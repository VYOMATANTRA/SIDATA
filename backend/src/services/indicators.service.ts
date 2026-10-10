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
import { hasFieldChanged, stableJsonStringify } from '../utils/comparator.js';
import { KeyedLruCache } from '../utils/keyedCache.js';

export class IndicatorServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'IndicatorServiceError';
    this.statusCode = statusCode;
  }
}

export interface IndicatorDto {
  id: string;
  sectionId: string;
  slug: string;
  label: string;
  unit: string | null;
  valueCurrent: string;
  valuePrevious: string | null;
  periodCurrent: string;
  periodPrevious: string | null;
  isComputedComparison: boolean;
  isStale: boolean;
  source: string | null;
  hedgeNote: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface IndicatorListFilters {
  sectionId?: string | undefined;
  includeStale?: boolean | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface IndicatorListResult {
  indicators: IndicatorDto[];
  total: number;
  page: number;
  pageSize: number;
}

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Decimal(18,4): at most 14 integer digits and 4 fractional digits.
const DECIMAL_RE = /^-?\d{1,14}(\.\d{1,4})?$/;

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function decimalToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value !== null && typeof value === 'object' && 'toString' in value) {
    return String((value as { toString(): string }).toString());
  }
  return String(value);
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Accepts a finite number or a decimal string that fits Decimal(18,4), and outputs a
 * canonical string (trimmed, no leading zeros, no trailing fractional zeros) via
 * Prisma.Decimal. Canonicalization matters because the DB normalises decimals the same
 * way: without it, `" 12 "` would pass validation but explode inside Prisma (500), and a
 * PATCH of `"12.50"` over a stored 12.5 would register as a change and write a bogus
 * `indicator.updated` audit diff.
 */
const decimalInput = z
  .union([z.number(), z.string()])
  .refine(
    (val) => {
      if (typeof val === 'number') {
        return Number.isFinite(val) && DECIMAL_RE.test(String(val));
      }
      return DECIMAL_RE.test(val.trim());
    },
    {
      message:
        'Nilai harus berupa angka desimal yang valid (maksimal 14 digit bulat, 4 digit desimal)',
    },
  )
  .transform((val) =>
    new Prisma.Decimal(typeof val === 'number' ? String(val) : val.trim()).toString(),
  );

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();

/** Empty/whitespace-only strings collapse to null; undefined (absent) stays undefined. */
function sanitizeNullableText(val: string | null | undefined): string | null | undefined {
  if (val === undefined) return undefined;
  if (val === null || val.trim() === '') return null;
  return val.trim();
}

const baseFields = {
  sectionId: z.string().trim().min(1, 'sectionId wajib diisi').max(191),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Slug wajib diisi')
    .max(100, 'Slug maksimal 100 karakter')
    .regex(SLUG_REGEX, 'Format slug tidak valid. Gunakan format kebab-case.'),
  label: z.string().trim().min(1, 'Label wajib diisi').max(500, 'Label maksimal 500 karakter'),
  unit: z.string().trim().max(32, 'Satuan maksimal 32 karakter').nullable().optional(),
  valueCurrent: decimalInput,
  valuePrevious: decimalInput.nullable().optional(),
  periodCurrent: z
    .string()
    .trim()
    .min(1, 'Periode berjalan wajib diisi')
    .max(64, 'Periode maksimal 64 karakter'),
  periodPrevious: nullableText(64),
  isComputedComparison: z.boolean().optional(),
  isStale: z.boolean().optional(),
  source: nullableText(2000),
  hedgeNote: nullableText(2000),
  // Signed 32-bit INT column: without the upper bound, e.g. 3000000000 passes
  // validation and MySQL rejects it as a non-IndicatorServiceError → 500.
  sortOrder: z
    .number()
    .refine((v) => Number.isInteger(v) && v >= 0 && v <= 2147483647, {
      message: 'Urutan harus berupa bilangan bulat antara 0 dan 2147483647',
    })
    .optional(),
};

function assertPairing(isComputed: boolean, valuePrevious: unknown, periodPrevious: unknown): void {
  const hasValue = valuePrevious !== null && valuePrevious !== undefined;
  const hasPeriod = periodPrevious !== null && periodPrevious !== undefined;
  // SPEC.md §5/§7: value_previous gates the tier-1 comparison prose. An orphaned half of
  // the pair (value without period or vice versa) would later render a comparison against
  // an unlabeled period once the flag flips or a consumer keys on valuePrevious != null,
  // so both must always be present together or absent together — computed or not.
  if (hasValue !== hasPeriod) {
    throw new IndicatorServiceError(
      'value_previous dan period_previous harus diisi berpasangan (keduanya ada atau keduanya kosong).',
      400,
    );
  }
  if (isComputed && !hasValue) {
    throw new IndicatorServiceError(
      'Indikator perbandingan terkomputasi membutuhkan value_previous (nilai tahun lalu).',
      400,
    );
  }
  if (isComputed && !hasPeriod) {
    throw new IndicatorServiceError(
      'Indikator perbandingan terkomputasi membutuhkan period_previous (periode tahun lalu).',
      400,
    );
  }
}

export const createIndicatorSchema = z.object(baseFields).strict();

export const updateIndicatorSchema = z
  .object({
    sectionId: baseFields.sectionId.optional(),
    slug: baseFields.slug.optional(),
    label: baseFields.label.optional(),
    unit: baseFields.unit.optional(),
    valueCurrent: baseFields.valueCurrent.optional(),
    valuePrevious: baseFields.valuePrevious.optional(),
    periodCurrent: baseFields.periodCurrent.optional(),
    periodPrevious: baseFields.periodPrevious.optional(),
    isComputedComparison: baseFields.isComputedComparison.optional(),
    isStale: baseFields.isStale.optional(),
    source: baseFields.source.optional(),
    hedgeNote: baseFields.hedgeNote.optional(),
    sortOrder: baseFields.sortOrder.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Setidaknya satu bidang harus disediakan untuk diperbarui',
  });

export type CreateIndicatorInput = z.infer<typeof createIndicatorSchema>;
export type UpdateIndicatorInput = z.infer<typeof updateIndicatorSchema>;

const CACHE_TTL_MS = 60 * 1000; // 1 minute
const MAX_CACHE_ENTRIES = 200;

const indicatorListCache = new KeyedLruCache<string, VersionedTtlCache<IndicatorListResult>>(
  MAX_CACHE_ENTRIES,
);

export const indicatorByIdCache = new KeyedLruCache<string, VersionedTtlCache<IndicatorDto | null>>(
  MAX_CACHE_ENTRIES,
);

/**
 * Negative results (unknown ids) are deliberately NOT retained in the shared per-id LRU:
 * the public GET /:id route is unauthenticated, so repeated lookups of random ids would
 * otherwise occupy all 200 slots, evict legitimate cached indicators, and force every
 * subsequent read back to the DB. Misses live in this separate small TTL set instead —
 * enough to absorb a scan burst without hammering the database on every repeat.
 */
const NEGATIVE_TTL_MS = 10 * 1000; // 10 seconds
const MAX_NEGATIVE_ENTRIES = 200;
const missingIndicatorIds = new Map<string, number>();

function isKnownMissing(id: string): boolean {
  const expiresAt = missingIndicatorIds.get(id);
  if (expiresAt === undefined) return false;
  if (Date.now() >= expiresAt) {
    missingIndicatorIds.delete(id);
    return false;
  }
  return true;
}

function rememberMissing(id: string): void {
  if (!missingIndicatorIds.has(id)) {
    if (missingIndicatorIds.size >= MAX_NEGATIVE_ENTRIES) {
      const oldest = missingIndicatorIds.keys().next().value;
      if (oldest !== undefined) missingIndicatorIds.delete(oldest);
    }
  } else {
    missingIndicatorIds.delete(id);
  }
  missingIndicatorIds.set(id, Date.now() + NEGATIVE_TTL_MS);
}

const getListCache = (key: string): VersionedTtlCache<IndicatorListResult> =>
  indicatorListCache.getOrCompute(
    key,
    () => new VersionedTtlCache<IndicatorListResult>({ ttlMs: CACHE_TTL_MS, baseClient: prisma }),
  );

const getByIdCache = (id: string): VersionedTtlCache<IndicatorDto | null> =>
  indicatorByIdCache.getOrCompute(
    id,
    () => new VersionedTtlCache<IndicatorDto | null>({ ttlMs: CACHE_TTL_MS, baseClient: prisma }),
  );

export const invalidateIndicatorsCache = (id?: string): void => {
  if (id) {
    indicatorByIdCache.get(id)?.invalidate();
    missingIndicatorIds.delete(id);
  } else {
    indicatorByIdCache.clear();
    missingIndicatorIds.clear();
  }
  for (const cache of indicatorListCache.values()) {
    cache.invalidate();
  }
  indicatorListCache.clear();
};

function formatIndicator(row: {
  id: string;
  sectionId: string;
  slug: string;
  label: string;
  unit: string | null;
  valueCurrent: unknown;
  valuePrevious: unknown;
  periodCurrent: string;
  periodPrevious: string | null;
  isComputedComparison: boolean;
  isStale: boolean;
  source: string | null;
  hedgeNote: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): IndicatorDto {
  return {
    id: row.id,
    sectionId: row.sectionId,
    slug: row.slug,
    label: row.label,
    unit: row.unit,
    valueCurrent: decimalToString(row.valueCurrent),
    valuePrevious: row.valuePrevious === null ? null : decimalToString(row.valuePrevious),
    periodCurrent: row.periodCurrent,
    periodPrevious: row.periodPrevious,
    isComputedComparison: row.isComputedComparison,
    isStale: row.isStale,
    source: row.source,
    hedgeNote: row.hedgeNote,
    sortOrder: row.sortOrder,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function normalizeListFilters(filters: IndicatorListFilters): {
  sectionId?: string;
  includeStale: boolean;
  page: number;
  pageSize: number;
} {
  const page =
    typeof filters.page === 'number' && Number.isFinite(filters.page) && filters.page > 0
      ? Math.floor(filters.page)
      : 1;
  const pageSize =
    typeof filters.pageSize === 'number' &&
    Number.isFinite(filters.pageSize) &&
    filters.pageSize > 0
      ? Math.min(Math.floor(filters.pageSize), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  return {
    ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
    includeStale: filters.includeStale ?? true,
    page,
    pageSize,
  };
}

function isPrismaKnownError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

export const listIndicators = async (
  filters: IndicatorListFilters = {},
  client: { indicator: Pick<typeof prisma.indicator, 'findMany' | 'count'> } = prisma,
): Promise<IndicatorListResult> => {
  const normalized = normalizeListFilters(filters);
  const cacheKey = stableJsonStringify(normalized);

  return getListCache(cacheKey).getOrFetch(async (db) => {
    const where = {
      ...(normalized.sectionId ? { sectionId: normalized.sectionId } : {}),
      ...(normalized.includeStale ? {} : { isStale: false }),
    };
    const [rows, total] = await Promise.all([
      db.indicator.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        skip: (normalized.page - 1) * normalized.pageSize,
        take: normalized.pageSize,
      }),
      db.indicator.count({ where }),
    ]);
    return {
      indicators: rows.map((row) => formatIndicator(row as Parameters<typeof formatIndicator>[0])),
      total,
      page: normalized.page,
      pageSize: normalized.pageSize,
    };
  }, client);
};

export const getIndicatorById = async (
  id: unknown,
  client: { indicator: Pick<typeof prisma.indicator, 'findUnique'> } = prisma,
): Promise<IndicatorDto | null> => {
  if (typeof id !== 'string' || id.trim() === '' || id.length > 191) {
    return null;
  }
  const normalizedId = id.trim();
  const useSharedCache = client === prisma;
  if (useSharedCache && isKnownMissing(normalizedId)) {
    return null;
  }
  const result = await getByIdCache(normalizedId).getOrFetch(async (db) => {
    const row = await db.indicator.findUnique({ where: { id: normalizedId } });
    if (!row) return null;
    return formatIndicator(row as Parameters<typeof formatIndicator>[0]);
  }, client);
  if (result === null && useSharedCache) {
    // Drop the just-allocated slot instead of retaining the miss in the shared LRU.
    indicatorByIdCache.delete(normalizedId);
    rememberMissing(normalizedId);
  }
  return result;
};

export const createIndicator = async (
  rawInput: unknown,
  actor: AuditActor,
  reqContext: AuditRequestContext,
  client = prisma,
): Promise<IndicatorDto> => {
  if (typeof rawInput !== 'object' || rawInput === null || Array.isArray(rawInput)) {
    throw new IndicatorServiceError('Payload harus berupa objek JSON.', 400);
  }

  const parsed = createIndicatorSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new IndicatorServiceError(parsed.error.issues.map((i) => i.message).join(', '), 400);
  }
  const input = parsed.data;

  const valuePrevious = input.valuePrevious ?? null;
  const periodPrevious = sanitizeNullableText(input.periodPrevious) ?? null;
  const isComputed = input.isComputedComparison ?? false;
  assertPairing(isComputed, valuePrevious, periodPrevious);

  const sectionId = input.sectionId.trim();
  const lockQuery = Prisma.sql`SELECT id FROM sections WHERE id = ${sectionId} FOR UPDATE`;

  try {
    return await executeLockedTransaction({
      client,
      lockQuery,
      cache: [],
      execute: async (tx) => {
        const section = await tx.section.findUnique({ where: { id: sectionId } });
        if (!section) {
          throw new IndicatorServiceError('Section tidak ditemukan.', 404);
        }

        const row = await tx.indicator.create({
          data: {
            sectionId,
            slug: input.slug,
            label: input.label.trim(),
            unit: sanitizeNullableText(input.unit) ?? null,
            valueCurrent: input.valueCurrent,
            valuePrevious: valuePrevious === null ? null : valuePrevious,
            periodCurrent: input.periodCurrent.trim(),
            periodPrevious,
            isComputedComparison: isComputed,
            isStale: input.isStale ?? false,
            source: sanitizeNullableText(input.source) ?? null,
            hedgeNote: sanitizeNullableText(input.hedgeNote) ?? null,
            sortOrder: input.sortOrder ?? 0,
          },
        });

        await buildAuditLog(
          {
            action: AUDIT_ACTIONS.INDICATOR_CREATED,
            actor,
            target: { type: 'indicator', id: row.id, label: row.slug },
            metadata: { slug: row.slug, label: row.label, sectionId },
            context: reqContext,
          },
          tx,
        );

        return formatIndicator(row);
      },
    });
  } catch (error) {
    if (error instanceof IndicatorServiceError) throw error;
    if (isPrismaKnownError(error, 'P2002')) {
      throw new IndicatorServiceError(`Slug '${input.slug}' sudah digunakan indikator lain.`, 409);
    }
    throw error;
  } finally {
    invalidateIndicatorsCache();
  }
};

export const updateIndicator = async (
  id: unknown,
  rawInput: unknown,
  actor: AuditActor,
  reqContext: AuditRequestContext,
  client = prisma,
): Promise<IndicatorDto> => {
  if (typeof id !== 'string' || id.trim() === '' || id.length > 191) {
    throw new IndicatorServiceError('ID indikator tidak valid.', 400);
  }
  const normalizedId = id.trim();

  if (typeof rawInput !== 'object' || rawInput === null || Array.isArray(rawInput)) {
    throw new IndicatorServiceError('Payload harus berupa objek JSON.', 400);
  }

  const parsed = updateIndicatorSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new IndicatorServiceError(parsed.error.issues.map((i) => i.message).join(', '), 400);
  }
  const input = parsed.data as UpdateIndicatorInput & Record<string, unknown>;

  const lockQuery = Prisma.sql`SELECT id FROM indicators WHERE id = ${normalizedId} FOR UPDATE`;
  const targetCache = getByIdCache(normalizedId);

  try {
    return await executeLockedTransaction({
      client,
      lockQuery,
      cache: [],
      onCommit: (committed, didChange) => {
        if (!didChange) return;
        targetCache.setCommitted(committed);
      },
      execute: async (tx) => {
        const existing = await tx.indicator.findUnique({ where: { id: normalizedId } });
        if (!existing) {
          throw new IndicatorServiceError('Indikator tidak ditemukan.', 404);
        }

        if (input.sectionId !== undefined) {
          const section = await tx.section.findUnique({ where: { id: input.sectionId.trim() } });
          if (!section) {
            throw new IndicatorServiceError('Section tidak ditemukan.', 404);
          }
        }

        if (input.slug !== undefined && input.slug !== existing.slug) {
          const clash = await tx.indicator.findUnique({ where: { slug: input.slug } });
          if (clash && clash.id !== normalizedId) {
            throw new IndicatorServiceError(
              `Slug '${input.slug}' sudah digunakan indikator lain.`,
              409,
            );
          }
        }

        const nextValuePrevious =
          input.valuePrevious !== undefined
            ? (input.valuePrevious ?? null)
            : existing.valuePrevious;
        const nextPeriodPrevious =
          input.periodPrevious !== undefined
            ? (sanitizeNullableText(input.periodPrevious as string | null) ?? null)
            : existing.periodPrevious;
        const nextComputed =
          input.isComputedComparison !== undefined
            ? input.isComputedComparison
            : existing.isComputedComparison;
        assertPairing(nextComputed, nextValuePrevious, nextPeriodPrevious);

        const changes: Record<string, { before: unknown; after: unknown }> = {};
        const track = (field: string, before: unknown, after: unknown) => {
          if (hasFieldChanged(before, after)) {
            changes[field] = { before, after };
          }
        };

        if (input.sectionId !== undefined)
          track('sectionId', existing.sectionId, input.sectionId.trim());
        if (input.slug !== undefined) track('slug', existing.slug, input.slug);
        if (input.label !== undefined)
          track('label', existing.label, (input.label as string).trim());
        if (input.unit !== undefined)
          track('unit', existing.unit, sanitizeNullableText(input.unit as string | null) ?? null);
        if (input.valueCurrent !== undefined)
          track('valueCurrent', decimalToString(existing.valueCurrent), input.valueCurrent);
        if (input.valuePrevious !== undefined)
          track(
            'valuePrevious',
            existing.valuePrevious === null ? null : decimalToString(existing.valuePrevious),
            nextValuePrevious === null ? null : nextValuePrevious,
          );
        if (input.periodCurrent !== undefined)
          track('periodCurrent', existing.periodCurrent, (input.periodCurrent as string).trim());
        if (input.periodPrevious !== undefined)
          track('periodPrevious', existing.periodPrevious, nextPeriodPrevious);
        if (input.isComputedComparison !== undefined)
          track('isComputedComparison', existing.isComputedComparison, nextComputed);
        if (input.isStale !== undefined) track('isStale', existing.isStale, input.isStale);
        if (input.source !== undefined)
          track(
            'source',
            existing.source,
            sanitizeNullableText(input.source as string | null) ?? null,
          );
        if (input.hedgeNote !== undefined)
          track(
            'hedgeNote',
            existing.hedgeNote,
            sanitizeNullableText(input.hedgeNote as string | null) ?? null,
          );
        if (input.sortOrder !== undefined) track('sortOrder', existing.sortOrder, input.sortOrder);

        if (Object.keys(changes).length === 0) {
          return withChangeResult(formatIndicator(existing), false);
        }

        const updated = await tx.indicator.update({
          where: { id: normalizedId },
          data: {
            ...(input.sectionId !== undefined ? { sectionId: input.sectionId.trim() } : {}),
            ...(input.slug !== undefined ? { slug: input.slug } : {}),
            ...(input.label !== undefined ? { label: (input.label as string).trim() } : {}),
            ...(input.unit !== undefined
              ? { unit: sanitizeNullableText(input.unit as string | null) ?? null }
              : {}),
            ...(input.valueCurrent !== undefined ? { valueCurrent: input.valueCurrent } : {}),
            ...(input.valuePrevious !== undefined
              ? { valuePrevious: nextValuePrevious === null ? null : nextValuePrevious }
              : {}),
            ...(input.periodCurrent !== undefined
              ? { periodCurrent: (input.periodCurrent as string).trim() }
              : {}),
            ...(input.periodPrevious !== undefined ? { periodPrevious: nextPeriodPrevious } : {}),
            ...(input.isComputedComparison !== undefined
              ? { isComputedComparison: nextComputed }
              : {}),
            ...(input.isStale !== undefined ? { isStale: input.isStale } : {}),
            ...(input.source !== undefined
              ? { source: sanitizeNullableText(input.source as string | null) ?? null }
              : {}),
            ...(input.hedgeNote !== undefined
              ? { hedgeNote: sanitizeNullableText(input.hedgeNote as string | null) ?? null }
              : {}),
            ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          },
        });

        await buildAuditLog(
          {
            action: AUDIT_ACTIONS.INDICATOR_UPDATED,
            actor,
            target: { type: 'indicator', id: existing.id, label: existing.slug },
            metadata: { slug: existing.slug, changes },
            context: reqContext,
          },
          tx,
        );

        return formatIndicator(updated);
      },
    });
  } catch (error) {
    if (error instanceof IndicatorServiceError) throw error;
    if (isPrismaKnownError(error, 'P2002')) {
      throw new IndicatorServiceError('Slug sudah digunakan indikator lain.', 409);
    }
    if (isPrismaKnownError(error, 'P2025')) {
      throw new IndicatorServiceError('Indikator tidak ditemukan.', 404);
    }
    throw error;
  } finally {
    invalidateIndicatorsCache(normalizedId);
  }
};

export const deleteIndicator = async (
  id: unknown,
  actor: AuditActor,
  reqContext: AuditRequestContext,
  client = prisma,
): Promise<IndicatorDto> => {
  if (typeof id !== 'string' || id.trim() === '' || id.length > 191) {
    throw new IndicatorServiceError('ID indikator tidak valid.', 400);
  }
  const normalizedId = id.trim();

  const lockQuery = Prisma.sql`SELECT id FROM indicators WHERE id = ${normalizedId} FOR UPDATE`;

  try {
    return await executeLockedTransaction({
      client,
      lockQuery,
      cache: [],
      execute: async (tx) => {
        const existing = await tx.indicator.findUnique({ where: { id: normalizedId } });
        if (!existing) {
          throw new IndicatorServiceError('Indikator tidak ditemukan.', 404);
        }

        await tx.indicator.delete({ where: { id: normalizedId } });

        const before = formatIndicator(existing);
        await buildAuditLog(
          {
            action: AUDIT_ACTIONS.INDICATOR_DELETED,
            actor,
            target: { type: 'indicator', id: existing.id, label: existing.slug },
            metadata: {
              slug: existing.slug,
              label: existing.label,
              sectionId: existing.sectionId,
              before,
            },
            context: reqContext,
          },
          tx,
        );

        return before;
      },
    });
  } catch (error) {
    if (error instanceof IndicatorServiceError) throw error;
    if (isPrismaKnownError(error, 'P2025')) {
      throw new IndicatorServiceError('Indikator tidak ditemukan.', 404);
    }
    throw error;
  } finally {
    invalidateIndicatorsCache(normalizedId);
  }
};
