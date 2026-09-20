import { z } from 'zod';
import prisma from '../utils/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  buildAuditLog,
  AUDIT_ACTIONS,
  type AuditActor,
  type AuditRequestContext,
} from './audit.service.js';
import { VersionedTtlCache, executeLockedTransaction } from '../utils/lockTransactionCache.js';
import { evictWeatherCache } from './weather.service.js';

export class SettingsServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'SettingsServiceError';
    this.statusCode = statusCode;
  }
}

/**
 * Keys into the generic `system_settings` key/value store (see prisma/schema.prisma) that back
 * admin-configurable audit log retention. `0` means "keep forever" — this is the default seeded
 * in prisma/seed.ts, so a fresh install never silently deletes evidence.
 */
export const AUDIT_RETENTION_KEYS = {
  info: 'audit.retention_info_days',
  warning: 'audit.retention_warning_days',
  critical: 'audit.retention_critical_days',
} as const;

export interface AuditRetentionSettings {
  info: number;
  warning: number;
  critical: number;
}

export const getAuditRetentionSettings = async (
  client: { systemSetting: Pick<typeof prisma.systemSetting, 'findMany'> } = prisma,
): Promise<AuditRetentionSettings> => {
  const rows = await client.systemSetting.findMany({
    where: { key: { in: Object.values(AUDIT_RETENTION_KEYS) } },
  });

  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  const parse = (key: string): number => {
    const raw = byKey.get(key);
    const value = raw !== undefined ? Number(raw) : 0;
    return Number.isInteger(value) && value >= 0 ? value : 0;
  };

  return {
    info: parse(AUDIT_RETENTION_KEYS.info),
    warning: parse(AUDIT_RETENTION_KEYS.warning),
    critical: parse(AUDIT_RETENTION_KEYS.critical),
  };
};

const MAX_RETENTION_DAYS = 36500; // 100 years

function validateRetentionPayload(payload: unknown): AuditRetentionSettings {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new SettingsServiceError('Payload pengaturan tidak valid.', 400);
  }

  const allowedKeys = new Set(['info', 'warning', 'critical']);
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      throw new SettingsServiceError(
        `Terdapat bidang pengaturan retensi yang tidak dikenali: "${key}".`,
        400,
      );
    }
  }

  const record = payload as Record<string, unknown>;

  const validateOne = (value: unknown, label: string): number => {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      throw new SettingsServiceError(
        `Nilai retensi "${label}" harus berupa bilangan bulat non-negatif (0 = simpan selamanya).`,
        400,
      );
    }
    if (value > MAX_RETENTION_DAYS) {
      throw new SettingsServiceError(
        `Nilai retensi "${label}" maksimal ${MAX_RETENTION_DAYS} hari (100 tahun). Gunakan 0 untuk menyimpan selamanya.`,
        400,
      );
    }
    return value;
  };

  const info = validateOne(record.info, 'info');
  const warning = validateOne(record.warning, 'warning');
  const critical = validateOne(record.critical, 'critical');

  // 0 means "keep forever" — treat it as infinite for the ordering check, since infinite
  // retention always satisfies "at least as long as" regardless of position.
  const effective = (value: number) => (value === 0 ? Infinity : value);

  if (effective(info) > effective(warning) || effective(warning) > effective(critical)) {
    throw new SettingsServiceError(
      'Retensi critical harus >= warning >= info. Kejadian yang lebih parah tidak boleh dihapus lebih cepat daripada kejadian yang lebih ringan.',
      400,
    );
  }

  return { info, warning, critical };
}

export const updateAuditRetentionSettings = async (params: {
  payload: unknown;
  actor: AuditActor;
  context?: AuditRequestContext | undefined;
}) => {
  const { payload, actor, context } = params;
  const next = validateRetentionPayload(payload);
  const actorId = actor.id?.trim() ? actor.id.trim() : null;

  // Shortening retention is the single most useful move for someone covering their tracks, so
  // this change is logged at `critical` severity — the loudest level the system has — with the
  // full before/after in metadata. That before/after has to be trustworthy, so this uses the
  // interactive form of $transaction (unlike the array form used elsewhere, e.g.
  // users.service.ts): a `SELECT ... FOR UPDATE` locks the three rows first, serializing this
  // against any concurrent retention update, so the "before" read below is guaranteed to be the
  // value that directly preceded this write rather than a stale read racing another admin's
  // in-flight change. A failed audit write still rolls back the settings change, same as before.
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT setting_key FROM system_settings WHERE setting_key IN (${AUDIT_RETENTION_KEYS.info}, ${AUDIT_RETENTION_KEYS.warning}, ${AUDIT_RETENTION_KEYS.critical}) FOR UPDATE`;
    const before = await getAuditRetentionSettings(tx);

    // Sequential, not Promise.all: interactive transactions run on a single shared connection,
    // so concurrent queries against the same `tx` risk interleaving/closed-transaction errors.
    const upsertOne = (key: string, value: number) =>
      tx.systemSetting.upsert({
        where: { key },
        update: { value: String(value), updatedById: actorId },
        create: { key, value: String(value), updatedById: actorId },
      });

    await upsertOne(AUDIT_RETENTION_KEYS.info, next.info);
    await upsertOne(AUDIT_RETENTION_KEYS.warning, next.warning);
    await upsertOne(AUDIT_RETENTION_KEYS.critical, next.critical);

    await buildAuditLog(
      {
        action: AUDIT_ACTIONS.SETTINGS_AUDIT_RETENTION_CHANGED,
        actor,
        target: { type: 'system_setting', id: 'audit_retention', label: 'Retensi Audit Log' },
        metadata: { before, after: next },
        context,
      },
      tx,
    );

    return next;
  });
};

/**
 * Whitelist of public setting keys. Only keys defined here are accessible via the
 * public settings endpoint. This strictly prevents internal/governance settings
 * (like audit retention) from being exposed.
 */
export const PUBLIC_SETTING_KEYS = {
  appName: 'public.app_name',
  institutionName: 'public.institution_name',
  tagline: 'public.tagline',
  administrativeArea: 'public.administrative_area',
  contactPhone: 'public.contact_phone',
  contactWhatsapp: 'public.contact_whatsapp',
  contactEmail: 'public.contact_email',
  contactAddress: 'public.contact_address',
  defaultCoordinates: 'public.default_coordinates',
  weatherAdm4: 'public.weather_adm4',
} as const;

export interface CoordinatesSetting {
  lat: number;
  lon: number;
  zoom: number;
}

export interface PublicSettings {
  appName: string;
  institutionName: string;
  tagline: string;
  administrativeArea: string;
  contactPhone: string;
  contactWhatsapp: string;
  contactEmail: string;
  contactAddress: string;
  defaultCoordinates: CoordinatesSetting;
  weatherAdm4: string;
}

export const DEFAULT_PUBLIC_SETTINGS: PublicSettings = {
  appName: 'SIDATA',
  institutionName: 'Kelurahan Manggar',
  tagline: 'Sistem Informasi Data Terpadu Kelurahan Manggar',
  administrativeArea: 'Kelurahan Manggar, Balikpapan Timur, Kota Balikpapan',
  contactPhone: '(0542) 746123',
  contactWhatsapp: '081234567890',
  contactEmail: 'kelurahan.manggar@balikpapan.go.id',
  contactAddress:
    'Jl. Mulawarman No. 1, Manggar, Balikpapan Timur, Kota Balikpapan, Kalimantan Timur 76116',
  defaultCoordinates: {
    lat: -1.2251,
    lon: 116.9438,
    zoom: 13,
  },
  weatherAdm4: '64.71.01.1001',
};

export const coordinatesSchema = z
  .object({
    lat: z
      .number({ message: 'Latitude wajib diisi' })
      .finite('Latitude harus berupa angka valid')
      .min(-90, 'Latitude harus di antara -90 dan 90')
      .max(90, 'Latitude harus di antara -90 dan 90'),
    lon: z
      .number({ message: 'Longitude wajib diisi' })
      .finite('Longitude harus berupa angka valid')
      .min(-180, 'Longitude harus di antara -180 dan 180')
      .max(180, 'Longitude harus di antara -180 dan 180'),
    zoom: z
      .number({ message: 'Zoom wajib diisi' })
      .int('Zoom harus berupa bilangan bulat')
      .min(1, 'Zoom minimal 1')
      .max(20, 'Zoom maksimal 20'),
  })
  .strict();

const noHtmlRegex = /^[^<>]*$/;
const singleLineTextRegex = /^[^<>\r\n]*$/;
const phoneFormatRegex = /^(?=.*\d)[\d\s()+-]+$/;

export const updatePublicSettingsSchema = z
  .object({
    appName: z
      .string()
      .trim()
      .min(1, 'Nama portal tidak boleh kosong')
      .max(100, 'Nama portal maksimal 100 karakter')
      .regex(
        singleLineTextRegex,
        'Nama portal tidak boleh mengandung karakter < atau > atau baris baru',
      )
      .optional(),
    institutionName: z
      .string()
      .trim()
      .min(1, 'Nama instansi tidak boleh kosong')
      .max(150, 'Nama instansi maksimal 150 karakter')
      .regex(
        singleLineTextRegex,
        'Nama instansi tidak boleh mengandung karakter < atau > atau baris baru',
      )
      .optional(),
    tagline: z
      .string()
      .trim()
      .max(255, 'Tagline maksimal 255 karakter')
      .regex(
        singleLineTextRegex,
        'Tagline tidak boleh mengandung karakter < atau > atau baris baru',
      )
      .nullable()
      .transform((val) => val ?? '')
      .optional(),
    administrativeArea: z
      .string()
      .trim()
      .max(255, 'Wilayah administratif maksimal 255 karakter')
      .regex(
        singleLineTextRegex,
        'Wilayah administratif tidak boleh mengandung karakter < atau > atau baris baru',
      )
      .nullable()
      .transform((val) => val ?? '')
      .optional(),
    contactPhone: z
      .string()
      .trim()
      .max(50, 'Nomor telepon maksimal 50 karakter')
      .regex(phoneFormatRegex, 'Format nomor telepon tidak valid (hanya angka, spasi, (), +, -)')
      .or(z.literal(''))
      .nullable()
      .transform((val) => val ?? '')
      .optional(),
    contactWhatsapp: z
      .string()
      .trim()
      .max(50, 'Nomor WhatsApp maksimal 50 karakter')
      .regex(phoneFormatRegex, 'Format nomor WhatsApp tidak valid (hanya angka, spasi, (), +, -)')
      .or(z.literal(''))
      .nullable()
      .transform((val) => val ?? '')
      .optional(),
    contactEmail: z
      .string()
      .trim()
      .max(254, 'Email maksimal 254 karakter')
      .email('Format email kontak tidak valid')
      .or(z.literal(''))
      .nullable()
      .transform((val) => val ?? '')
      .optional(),
    contactAddress: z
      .string()
      .trim()
      .max(500, 'Alamat kantor maksimal 500 karakter')
      .regex(noHtmlRegex, 'Alamat kantor tidak boleh mengandung karakter < atau >')
      .nullable()
      .transform((val) => val ?? '')
      .optional(),
    defaultCoordinates: coordinatesSchema.optional(),
    weatherAdm4: z
      .string()
      .trim()
      .regex(
        /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/,
        'Format kode adm4 BMKG tidak valid (contoh: 64.71.01.1001)',
      )
      .optional(),
  })
  .strict();

const PUBLIC_SETTINGS_CACHE_TTL_MS = 15 * 60 * 1000;
export const publicSettingsCache = new VersionedTtlCache<PublicSettings>({
  ttlMs: PUBLIC_SETTINGS_CACHE_TTL_MS,
  baseClient: prisma,
});

export function invalidatePublicSettingsCache(options?: {
  preserveLastKnownGood?: boolean;
  evictWeatherCache?: boolean;
}): void {
  publicSettingsCache.invalidate(options);
  if (options?.evictWeatherCache) {
    evictWeatherCache();
  }
}

export const getPublicSettings = async (
  client: { systemSetting: Pick<typeof prisma.systemSetting, 'findMany'> } = prisma,
  skipCache = false,
): Promise<PublicSettings> => {
  return publicSettingsCache.getOrFetch(
    async (db: typeof client) => {
      const rows = await db.systemSetting.findMany({
        where: { key: { in: Object.values(PUBLIC_SETTING_KEYS) } },
      });

      const byKey = new Map(rows.map((row) => [row.key, row.value]));

      const parseCoords = (raw?: string): CoordinatesSetting => {
        if (!raw) return DEFAULT_PUBLIC_SETTINGS.defaultCoordinates;
        try {
          const parsed = JSON.parse(raw);
          const validated = coordinatesSchema.safeParse(parsed);
          return validated.success ? validated.data : DEFAULT_PUBLIC_SETTINGS.defaultCoordinates;
        } catch {
          return DEFAULT_PUBLIC_SETTINGS.defaultCoordinates;
        }
      };

      return {
        appName: byKey.get(PUBLIC_SETTING_KEYS.appName)?.trim() || DEFAULT_PUBLIC_SETTINGS.appName,
        institutionName:
          byKey.get(PUBLIC_SETTING_KEYS.institutionName)?.trim() ||
          DEFAULT_PUBLIC_SETTINGS.institutionName,
        tagline: byKey.get(PUBLIC_SETTING_KEYS.tagline) ?? DEFAULT_PUBLIC_SETTINGS.tagline,
        administrativeArea:
          byKey.get(PUBLIC_SETTING_KEYS.administrativeArea) ??
          DEFAULT_PUBLIC_SETTINGS.administrativeArea,
        contactPhone:
          byKey.get(PUBLIC_SETTING_KEYS.contactPhone) ?? DEFAULT_PUBLIC_SETTINGS.contactPhone,
        contactWhatsapp:
          byKey.get(PUBLIC_SETTING_KEYS.contactWhatsapp) ?? DEFAULT_PUBLIC_SETTINGS.contactWhatsapp,
        contactEmail:
          byKey.get(PUBLIC_SETTING_KEYS.contactEmail) ?? DEFAULT_PUBLIC_SETTINGS.contactEmail,
        contactAddress:
          byKey.get(PUBLIC_SETTING_KEYS.contactAddress) ?? DEFAULT_PUBLIC_SETTINGS.contactAddress,
        defaultCoordinates: parseCoords(byKey.get(PUBLIC_SETTING_KEYS.defaultCoordinates)),
        weatherAdm4:
          byKey.get(PUBLIC_SETTING_KEYS.weatherAdm4)?.trim() || DEFAULT_PUBLIC_SETTINGS.weatherAdm4,
      };
    },
    client,
    { skipCache },
  );
};

export interface GetFastPublicSettingsOptions {
  timeoutMs?: number;
  client?: { systemSetting: Pick<typeof prisma.systemSetting, 'findMany'> };
}

/**
 * Bounded-latency public settings lookup for time-critical flows (e.g. OTP email dispatch)
 * and high-frequency public reads (e.g. weather forecast).
 *
 * Guarantees:
 * - Cache hit: returns immediately from memory in 0ms (0 DB round trips, 0 pool connections).
 * - Cache miss: bounds DB wait time with a strict timeout (default: 200ms). If the DB
 *   is stalled, deadlocked, or connection-pool exhausted, it bails out and returns the in-memory
 *   last-known-good or default settings without delaying the caller.
 */
export const getFastPublicSettings = async (
  options?: GetFastPublicSettingsOptions,
): Promise<PublicSettings> => {
  const client = options?.client ?? prisma;
  const rawTimeout = options?.timeoutMs;
  const timeoutMs =
    typeof rawTimeout === 'number' &&
    Number.isFinite(rawTimeout) &&
    rawTimeout > 0 &&
    rawTimeout <= 2_147_483_647
      ? Math.max(1, Math.floor(rawTimeout))
      : 200;

  // 1. In-memory cache hit: 0ms, zero DB load
  const cached = publicSettingsCache.get(client);
  if (cached) {
    return cached;
  }

  // 2. Cache miss: race DB fetch against timeout
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Pengambilan pengaturan publik melebihi batas waktu ${timeoutMs}ms`));
      }, timeoutMs);
    });

    const fresh = await Promise.race([getPublicSettings(client), timeoutPromise]);
    return fresh;
  } catch (err) {
    console.warn(
      `getFastPublicSettings: fallback ke pengaturan in-memory terakhir (${err instanceof Error ? err.message : String(err)})`,
    );
    return publicSettingsCache.getLastKnownGood(DEFAULT_PUBLIC_SETTINGS);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

export const updatePublicSettings = async (params: {
  payload: unknown;
  actor: AuditActor;
  context?: AuditRequestContext | undefined;
}): Promise<PublicSettings> => {
  const { payload, actor, context } = params;

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new SettingsServiceError('Payload pengaturan tidak valid.', 400);
  }

  const parsed = updatePublicSettingsSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    let message = issue?.message ?? 'Validasi pengaturan gagal.';
    if (issue?.code === 'unrecognized_keys') {
      const isCoordinates = issue.path.includes('defaultCoordinates');
      const keys = (issue as { keys?: string[] }).keys?.map((k) => `"${k}"`).join(', ') ?? '';
      message = isCoordinates
        ? `Terdapat bidang koordinat yang tidak dikenali: ${keys}`
        : `Terdapat bidang pengaturan yang tidak dikenali: ${keys}`;
    }
    throw new SettingsServiceError(message, 400);
  }

  const updates = parsed.data;
  if (Object.keys(updates).length === 0) {
    throw new SettingsServiceError('Setidaknya satu bidang pengaturan harus dikirimkan.', 400);
  }

  const actorId = actor.id?.trim() ? actor.id.trim() : null;

  // Lock ALL public setting keys in a deterministic, sorted order to eliminate deadlocks
  // and completely serialize concurrent admin updates against race conditions or interleaved diffs.
  const allPublicKeys = Object.values(PUBLIC_SETTING_KEYS).sort();
  const lockQuery = Prisma.sql`SELECT setting_key FROM system_settings WHERE setting_key IN (${Prisma.join(allPublicKeys)}) FOR UPDATE`;

  let previousWeatherAdm4: string | undefined;

  return executeLockedTransaction({
    client: prisma,
    lockQuery,
    cache: publicSettingsCache,
    onCommit: (committedAfter) => {
      publicSettingsCache.setCommitted(committedAfter);
      if (previousWeatherAdm4 && previousWeatherAdm4 !== committedAfter.weatherAdm4) {
        evictWeatherCache(previousWeatherAdm4);
      }
    },
    execute: async (tx) => {
      const before = await getPublicSettings(tx, true);
      previousWeatherAdm4 = before.weatherAdm4;

      const upsertOne = (key: string, val: string) =>
        tx.systemSetting.upsert({
          where: { key },
          update: { value: val, updatedById: actorId },
          create: { key, value: val, updatedById: actorId },
        });

      if (updates.appName !== undefined)
        await upsertOne(PUBLIC_SETTING_KEYS.appName, updates.appName);
      if (updates.institutionName !== undefined)
        await upsertOne(PUBLIC_SETTING_KEYS.institutionName, updates.institutionName);
      if (updates.tagline !== undefined)
        await upsertOne(PUBLIC_SETTING_KEYS.tagline, updates.tagline);
      if (updates.administrativeArea !== undefined)
        await upsertOne(PUBLIC_SETTING_KEYS.administrativeArea, updates.administrativeArea);
      if (updates.contactPhone !== undefined)
        await upsertOne(PUBLIC_SETTING_KEYS.contactPhone, updates.contactPhone);
      if (updates.contactWhatsapp !== undefined)
        await upsertOne(PUBLIC_SETTING_KEYS.contactWhatsapp, updates.contactWhatsapp);
      if (updates.contactEmail !== undefined)
        await upsertOne(PUBLIC_SETTING_KEYS.contactEmail, updates.contactEmail);
      if (updates.contactAddress !== undefined)
        await upsertOne(PUBLIC_SETTING_KEYS.contactAddress, updates.contactAddress);
      if (updates.defaultCoordinates !== undefined)
        await upsertOne(
          PUBLIC_SETTING_KEYS.defaultCoordinates,
          JSON.stringify(updates.defaultCoordinates),
        );
      if (updates.weatherAdm4 !== undefined)
        await upsertOne(PUBLIC_SETTING_KEYS.weatherAdm4, updates.weatherAdm4);

      // Compute `after` in-memory from `before` + `updates` rather than issuing an extra DB query
      // while holding the row-level FOR UPDATE lock, minimizing lock hold duration and contention.
      const after: PublicSettings = {
        appName: updates.appName ?? before.appName,
        institutionName: updates.institutionName ?? before.institutionName,
        tagline: updates.tagline ?? before.tagline,
        administrativeArea: updates.administrativeArea ?? before.administrativeArea,
        contactPhone: updates.contactPhone ?? before.contactPhone,
        contactWhatsapp: updates.contactWhatsapp ?? before.contactWhatsapp,
        contactEmail: updates.contactEmail ?? before.contactEmail,
        contactAddress: updates.contactAddress ?? before.contactAddress,
        defaultCoordinates: updates.defaultCoordinates ?? before.defaultCoordinates,
        weatherAdm4: updates.weatherAdm4 ?? before.weatherAdm4,
      };

      await buildAuditLog(
        {
          action: AUDIT_ACTIONS.SETTINGS_PUBLIC_UPDATED,
          actor,
          target: {
            type: 'system_setting',
            id: 'public_settings',
            label: 'Pengaturan Profil Publik',
          },
          metadata: { before, after, changedFields: Object.keys(updates) },
          context,
        },
        tx,
      );

      return after;
    },
  });
};
