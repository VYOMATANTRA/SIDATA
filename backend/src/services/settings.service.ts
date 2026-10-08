import { z } from 'zod';
import prisma from '../utils/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  buildAuditLog,
  AUDIT_ACTIONS,
  type AuditActor,
  type AuditRequestContext,
} from './audit.service.js';
import {
  VersionedTtlCache,
  executeLockedTransaction,
  withChangeResult,
} from '../utils/lockTransactionCache.js';
import { hasFieldChanged } from '../utils/comparator.js';
import { validateBmkgAdm4 } from '../utils/bmkg.js';
import {
  BMKG_BASE_URL,
  WEATHER_CACHE_TTL_MS,
  WEATHER_STALE_RETRY_MS,
  WEATHER_FETCH_TIMEOUT_MS,
  WEATHER_ADM4,
} from '../configs/index.js';

type WeatherInvalidationListener = () => void;
const weatherInvalidationListeners = new Set<WeatherInvalidationListener>();

export function onWeatherConfigInvalidated(listener: WeatherInvalidationListener): () => void {
  weatherInvalidationListeners.add(listener);
  return () => weatherInvalidationListeners.delete(listener);
}

export function notifyWeatherConfigInvalidated(): void {
  for (const listener of weatherInvalidationListeners) {
    try {
      listener();
    } catch (err) {
      console.error('Error executing weather invalidation listener:', err);
    }
  }
}

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

    // If no retention values actually changed, short-circuit: skip DB writes and audit log
    if (
      before.info === next.info &&
      before.warning === next.warning &&
      before.critical === next.critical
    ) {
      return next;
    }

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
} as const satisfies Record<keyof PublicSettings, string>;

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
  weatherAdm4: WEATHER_ADM4,
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
    notifyWeatherConfigInvalidated();
  }
}

export type PublicSettingsDbClient = {
  systemSetting: Pick<typeof prisma.systemSetting, 'findMany'>;
};

export const getPublicSettings = async (
  client: PublicSettingsDbClient = prisma,
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

export interface TimeoutFallbackOptions {
  timeoutMs?: number;
  client?: unknown;
  label?: string;
}

export type GetFastPublicSettingsOptions = TimeoutFallbackOptions;
export type GetFastWeatherConfigSettingsOptions = TimeoutFallbackOptions;

/**
 * Executes a cache-first read with a strict fallback timeout against the database.
 */
export async function withTimeoutFallback<T>(
  cache: VersionedTtlCache<T>,
  loader: (client: unknown) => Promise<T>,
  fallback: T,
  options?: TimeoutFallbackOptions,
): Promise<T> {
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
  const cached = cache.get(client);
  if (cached) {
    return cached;
  }

  // 2. Cache miss: race DB fetch against timeout
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            `Pengambilan pengaturan ${options?.label ?? 'sistem'} melebihi batas waktu ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);
    });

    const fresh = await Promise.race([loader(client), timeoutPromise]);
    return fresh;
  } catch (err) {
    console.warn(
      `withTimeoutFallback: fallback ke pengaturan in-memory terakhir (${err instanceof Error ? err.message : String(err)})`,
    );
    return cache.getLastKnownGood(fallback);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * Pre-inserts setting keys with empty default values if absent to ensure record locks
 * are taken instead of InnoDB phantom gap locks on SELECT ... FOR UPDATE.
 */
async function ensureSystemSettingsExist(client: unknown, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const dbClient = (client ?? prisma) as {
    systemSetting?: {
      createMany?: (args: {
        data: { key: string; value: string }[];
        skipDuplicates: true;
      }) => Promise<unknown>;
    };
  };
  if (typeof dbClient.systemSetting?.createMany === 'function') {
    const data = keys.map((key) => ({ key, value: '' }));
    try {
      await dbClient.systemSetting.createMany({ data, skipDuplicates: true });
    } catch {
      // Non-blocking in case of mock clients without createMany
    }
  }
}

/**
 * Bounded-latency public settings lookup for time-critical flows (e.g. OTP email dispatch)
 * and high-frequency public reads (e.g. weather forecast).
 */
export const getFastPublicSettings = async (
  options?: GetFastPublicSettingsOptions,
): Promise<PublicSettings> => {
  return withTimeoutFallback(
    publicSettingsCache,
    (client) => getPublicSettings((client ?? prisma) as PublicSettingsDbClient),
    DEFAULT_PUBLIC_SETTINGS,
    { ...options, label: 'publik' },
  );
};

function hasSettingChanged(
  field: keyof PublicSettings,
  before: PublicSettings,
  updates: { [K in keyof PublicSettings]?: PublicSettings[K] | undefined },
): boolean {
  const newVal = updates[field];
  if (newVal === undefined) return false;
  return hasFieldChanged(before[field], newVal);
}

function serializePublicSetting<K extends keyof PublicSettings>(
  _key: K,
  val: PublicSettings[K],
): string {
  if (typeof val === 'string') {
    return val;
  }
  return JSON.stringify(val);
}

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

  if (updates.weatherAdm4 !== undefined) {
    const current = await getPublicSettings(prisma);
    if (updates.weatherAdm4 !== current.weatherAdm4) {
      try {
        const weatherConfig = await getFastWeatherConfigSettings();
        await validateBmkgAdm4(updates.weatherAdm4, {
          baseUrl: weatherConfig.bmkgBaseUrl,
          timeoutMs: weatherConfig.fetchTimeoutMs,
        });
      } catch {
        throw new SettingsServiceError(
          'Kode adm4 BMKG tidak valid atau tidak ditemukan di server BMKG.',
          400,
        );
      }
    }
  }

  const actorId = actor.id?.trim() ? actor.id.trim() : null;

  // Lock only the setting keys present in updates in a deterministic, sorted order to eliminate
  // deadlocks while allowing concurrent updates to disjoint setting keys to proceed in parallel.
  const targetPublicKeys = (Object.keys(updates) as (keyof typeof PUBLIC_SETTING_KEYS)[])
    .map((field) => PUBLIC_SETTING_KEYS[field])
    .filter(Boolean)
    .sort();

  await ensureSystemSettingsExist(prisma, targetPublicKeys);

  const lockQuery = Prisma.sql`SELECT setting_key FROM system_settings WHERE setting_key IN (${Prisma.join(targetPublicKeys)}) FOR UPDATE`;

  let previousWeatherAdm4: string | undefined;

  return executeLockedTransaction({
    client: prisma,
    lockQuery,
    cache: publicSettingsCache,
    onCommit: async (committedAfter, didChange) => {
      if (!didChange) return;
      if (previousWeatherAdm4 && previousWeatherAdm4 !== committedAfter.weatherAdm4) {
        invalidateWeatherConfigCache();
      }
      try {
        await getPublicSettings(prisma);
      } catch {
        // Safe fallback: cache remains invalidated if post-commit warm-up fetch fails
      }
    },
    execute: async (tx) => {
      const before = await getPublicSettings(tx, true);
      previousWeatherAdm4 = before.weatherAdm4;

      const changedKeys = (Object.keys(updates) as (keyof PublicSettings)[]).filter((key) =>
        hasSettingChanged(key, before, updates),
      );

      // If no fields actually changed, short-circuit: skip DB writes, audit log, and cache invalidation
      if (changedKeys.length === 0) {
        return withChangeResult(before, false);
      }

      // Upsert only the setting keys that actually changed
      for (const key of changedKeys) {
        const val = updates[key]!;
        const dbKey = PUBLIC_SETTING_KEYS[key];
        const serialized = serializePublicSetting(key, val);
        await tx.systemSetting.upsert({
          where: { key: dbKey },
          update: { value: serialized, updatedById: actorId },
          create: { key: dbKey, value: serialized, updatedById: actorId },
        });
      }

      // Compute `after` in-memory from `before` + `updates` rather than issuing an extra DB query
      // while holding the row-level FOR UPDATE lock, minimizing lock hold duration and contention.
      const after: PublicSettings = { ...before };
      for (const key of changedKeys) {
        (after as Record<keyof PublicSettings, unknown>)[key] = updates[key];
      }

      await buildAuditLog(
        {
          action: AUDIT_ACTIONS.SETTINGS_PUBLIC_UPDATED,
          actor,
          target: {
            type: 'system_setting',
            id: 'public_settings',
            label: 'Pengaturan Profil Publik',
          },
          metadata: { before, after, changedFields: changedKeys },
          context,
        },
        tx,
      );

      return after;
    },
  });
};

/* =========================================================================
 * 3. OPERATIONAL WEATHER SETTINGS
 * ========================================================================= */

export const WEATHER_CONFIG_KEYS = {
  bmkgBaseUrl: 'weather.bmkg_base_url',
  cacheTtlMs: 'weather.cache_ttl_ms',
  staleRetryMs: 'weather.stale_retry_ms',
  fetchTimeoutMs: 'weather.fetch_timeout_ms',
} as const satisfies Record<keyof WeatherConfigSettings, string>;

export interface WeatherConfigSettings {
  bmkgBaseUrl: string;
  cacheTtlMs: number;
  staleRetryMs: number;
  fetchTimeoutMs: number;
}

export const DEFAULT_WEATHER_CONFIG_SETTINGS: WeatherConfigSettings = {
  bmkgBaseUrl: BMKG_BASE_URL,
  cacheTtlMs: WEATHER_CACHE_TTL_MS,
  staleRetryMs: WEATHER_STALE_RETRY_MS,
  fetchTimeoutMs: WEATHER_FETCH_TIMEOUT_MS,
};

function isValidBmkgBaseUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.username || parsed.password) return false;

    const configuredUrl = new URL(BMKG_BASE_URL);
    const isTest = process.env.NODE_ENV === 'test';

    // Must be https (or http only when matching configured protocol or in test mode)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== configuredUrl.protocol && !isTest) {
      return false;
    }

    // Must be standard port unless matching configured port or in test mode
    if (parsed.port && parsed.port !== '443' && parsed.port !== configuredUrl.port && !isTest) {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    const allowedHosts = new Set(['api.bmkg.go.id', configuredUrl.hostname.toLowerCase()]);
    if (isTest) {
      allowedHosts.add('custom-bmkg.test');
      allowedHosts.add('localhost');
      allowedHosts.add('127.0.0.1');
    }

    // Disallow loopback, private IP, IPv6 bracketed, etc. unless explicitly in allowedHosts
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1') {
      return allowedHosts.has(host);
    }
    if (host.startsWith('[') || host.includes(':')) {
      return allowedHosts.has(host);
    }
    if (
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^169\.254\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(host)
    ) {
      return allowedHosts.has(host);
    }

    return allowedHosts.has(host);
  } catch {
    return false;
  }
}

export const updateWeatherConfigSchema = z
  .object({
    bmkgBaseUrl: z
      .string()
      .trim()
      .url('Format URL base BMKG tidak valid')
      .refine(
        isValidBmkgBaseUrl,
        'URL base BMKG harus menggunakan protokol HTTPS, tidak boleh menyertakan kredensial, dan harus mengarah ke host yang diizinkan (api.bmkg.go.id)',
      )
      .optional(),
    cacheTtlMs: z
      .number()
      .int('Cache TTL harus berupa bilangan bulat')
      .min(60_000, 'Cache TTL minimal 1 menit (60000 ms)')
      .max(86_400_000, 'Cache TTL maksimal 24 jam (86400000 ms)')
      .optional(),
    staleRetryMs: z
      .number()
      .int('Stale retry interval harus berupa bilangan bulat')
      .min(10_000, 'Stale retry interval minimal 10 detik (10000 ms)')
      .max(1_800_000, 'Stale retry interval maksimal 30 menit (1800000 ms)')
      .optional(),
    fetchTimeoutMs: z
      .number()
      .int('Fetch timeout harus berupa bilangan bulat')
      .min(1_000, 'Fetch timeout minimal 1 detik (1000 ms)')
      .max(30_000, 'Fetch timeout maksimal 30 detik (30000 ms)')
      .optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.cacheTtlMs !== undefined && data.staleRetryMs !== undefined) {
        return data.cacheTtlMs >= data.staleRetryMs;
      }
      return true;
    },
    {
      message: 'Cache TTL tidak boleh lebih kecil daripada interval coba ulang (stale retry)',
      path: ['cacheTtlMs'],
    },
  );

const WEATHER_CONFIG_CACHE_TTL_MS = 15 * 60 * 1000;
export const weatherConfigCache = new VersionedTtlCache<WeatherConfigSettings>({
  ttlMs: WEATHER_CONFIG_CACHE_TTL_MS,
  baseClient: prisma,
});

export function invalidateWeatherConfigCache(options?: { preserveLastKnownGood?: boolean }): void {
  weatherConfigCache.invalidate(options);
  notifyWeatherConfigInvalidated();
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const num = Number(raw);
  return Number.isSafeInteger(num) && num > 0 ? num : fallback;
}

async function loadWeatherConfigFromDb(client: unknown): Promise<WeatherConfigSettings> {
  const dbClient = (client ?? prisma) as {
    systemSetting: Pick<typeof prisma.systemSetting, 'findMany'>;
  };

  const rows = await dbClient.systemSetting.findMany({
    where: { key: { in: Object.values(WEATHER_CONFIG_KEYS) } },
  });

  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  return {
    bmkgBaseUrl:
      byKey.get(WEATHER_CONFIG_KEYS.bmkgBaseUrl)?.trim() ||
      DEFAULT_WEATHER_CONFIG_SETTINGS.bmkgBaseUrl,
    cacheTtlMs: parsePositiveInt(
      byKey.get(WEATHER_CONFIG_KEYS.cacheTtlMs),
      DEFAULT_WEATHER_CONFIG_SETTINGS.cacheTtlMs,
    ),
    staleRetryMs: parsePositiveInt(
      byKey.get(WEATHER_CONFIG_KEYS.staleRetryMs),
      DEFAULT_WEATHER_CONFIG_SETTINGS.staleRetryMs,
    ),
    fetchTimeoutMs: parsePositiveInt(
      byKey.get(WEATHER_CONFIG_KEYS.fetchTimeoutMs),
      DEFAULT_WEATHER_CONFIG_SETTINGS.fetchTimeoutMs,
    ),
  };
}

export async function getWeatherConfigSettings(
  client: unknown = prisma,
  skipCache = false,
): Promise<WeatherConfigSettings> {
  return weatherConfigCache.getOrFetch((db) => loadWeatherConfigFromDb(db), client, { skipCache });
}

/**
 * Bounded-latency weather config settings lookup for time-critical flows
 * and high-frequency public reads.
 */
export const getFastWeatherConfigSettings = async (
  options?: GetFastWeatherConfigSettingsOptions,
): Promise<WeatherConfigSettings> => {
  return withTimeoutFallback(
    weatherConfigCache,
    (client) => getWeatherConfigSettings(client),
    DEFAULT_WEATHER_CONFIG_SETTINGS,
    { ...options, label: 'konfigurasi cuaca' },
  );
};

function hasWeatherSettingChanged(
  field: keyof WeatherConfigSettings,
  before: WeatherConfigSettings,
  updates: { [K in keyof WeatherConfigSettings]?: WeatherConfigSettings[K] | undefined },
): boolean {
  const newVal = updates[field];
  if (newVal === undefined) return false;
  return hasFieldChanged(before[field], newVal);
}

export const updateWeatherConfig = async (params: {
  payload: unknown;
  actor: AuditActor;
  context?: AuditRequestContext | undefined;
}): Promise<WeatherConfigSettings> => {
  const { payload, actor, context } = params;

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new SettingsServiceError('Payload pengaturan cuaca tidak valid.', 400);
  }

  const parsed = updateWeatherConfigSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    let message = issue?.message ?? 'Validasi pengaturan cuaca gagal.';
    if (issue?.code === 'unrecognized_keys') {
      const keys = (issue as { keys?: string[] }).keys?.map((k) => `"${k}"`).join(', ') ?? '';
      message = `Terdapat bidang pengaturan cuaca yang tidak dikenali: ${keys}`;
    }
    throw new SettingsServiceError(message, 400);
  }

  const updates = parsed.data;
  if (Object.keys(updates).length === 0) {
    throw new SettingsServiceError(
      'Setidaknya satu bidang pengaturan cuaca harus dikirimkan.',
      400,
    );
  }

  const current = await getWeatherConfigSettings(prisma);

  // Validate cross-field invariant against current settings if only one is updated
  const finalCacheTtl = updates.cacheTtlMs ?? current.cacheTtlMs;
  const finalStaleRetry = updates.staleRetryMs ?? current.staleRetryMs;
  if (finalCacheTtl < finalStaleRetry) {
    throw new SettingsServiceError(
      'Cache TTL tidak boleh lebih kecil daripada interval coba ulang (stale retry).',
      400,
    );
  }

  // Pre-lock validation if bmkgBaseUrl is updated
  const targetBaseUrl = updates.bmkgBaseUrl ?? current.bmkgBaseUrl;
  const targetTimeoutMs = updates.fetchTimeoutMs ?? current.fetchTimeoutMs;

  if (updates.bmkgBaseUrl !== undefined && updates.bmkgBaseUrl !== current.bmkgBaseUrl) {
    try {
      const publicSettings = await getFastPublicSettings();
      await validateBmkgAdm4(publicSettings.weatherAdm4, {
        baseUrl: targetBaseUrl,
        timeoutMs: targetTimeoutMs,
      });
    } catch {
      throw new SettingsServiceError('Endpoint BMKG tidak valid atau tidak merespons.', 400);
    }
  }

  const actorId = actor.id?.trim() ? actor.id.trim() : null;

  const targetWeatherKeys = (Object.keys(updates) as (keyof typeof WEATHER_CONFIG_KEYS)[])
    .map((field) => WEATHER_CONFIG_KEYS[field])
    .filter(Boolean)
    .sort();

  await ensureSystemSettingsExist(prisma, targetWeatherKeys);

  const lockQuery = Prisma.sql`SELECT setting_key FROM system_settings WHERE setting_key IN (${Prisma.join(targetWeatherKeys)}) FOR UPDATE`;

  return executeLockedTransaction({
    client: prisma,
    lockQuery,
    cache: weatherConfigCache,
    onCommit: async (_committedAfter, didChange) => {
      if (!didChange) return;
      notifyWeatherConfigInvalidated();
      try {
        await getWeatherConfigSettings(prisma);
      } catch {
        // Safe fallback
      }
    },
    execute: async (tx) => {
      const before = await getWeatherConfigSettings(tx, true);

      // Re-verify cross-field invariant under lock against authoritative before state
      const lockedCacheTtl = updates.cacheTtlMs ?? before.cacheTtlMs;
      const lockedStaleRetry = updates.staleRetryMs ?? before.staleRetryMs;
      if (lockedCacheTtl < lockedStaleRetry) {
        throw new SettingsServiceError(
          'Cache TTL tidak boleh lebih kecil daripada interval coba ulang (stale retry).',
          400,
        );
      }

      const changedKeys = (Object.keys(updates) as (keyof WeatherConfigSettings)[]).filter((key) =>
        hasWeatherSettingChanged(key, before, updates),
      );

      if (changedKeys.length === 0) {
        return withChangeResult(before, false);
      }

      for (const key of changedKeys) {
        const val = updates[key]!;
        const dbKey = WEATHER_CONFIG_KEYS[key];
        const serialized = String(val);
        await tx.systemSetting.upsert({
          where: { key: dbKey },
          update: { value: serialized, updatedById: actorId },
          create: { key: dbKey, value: serialized, updatedById: actorId },
        });
      }

      const after: WeatherConfigSettings = { ...before };
      for (const key of changedKeys) {
        (after as Record<keyof WeatherConfigSettings, unknown>)[key] = updates[key];
      }

      await buildAuditLog(
        {
          action: AUDIT_ACTIONS.SETTINGS_WEATHER_UPDATED,
          actor,
          target: {
            type: 'system_setting',
            id: 'weather_config',
            label: 'Pengaturan Operasional Cuaca',
          },
          metadata: { before, after, changedFields: changedKeys },
          context,
        },
        tx,
      );

      return after;
    },
  });
};
