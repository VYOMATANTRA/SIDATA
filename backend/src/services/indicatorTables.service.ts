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
  type CacheInvalidator,
} from '../utils/lockTransactionCache.js';
import { hasFieldChanged, stableJsonStringify } from '../utils/comparator.js';
import { KeyedLruCache } from '../utils/keyedCache.js';

export class IndicatorTableServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'IndicatorTableServiceError';
    this.statusCode = statusCode;
  }
}

export const INDICATOR_TABLE_KINDS = [
  'age_pyramid',
  'ethnicity',
  'religion_by_sex',
  'occupation',
] as const;
export type IndicatorTableKind = (typeof INDICATOR_TABLE_KINDS)[number];

/** Kinds whose rows carry a male/female split; the rest carry a single total. */
const SEX_SPLIT_KINDS: ReadonlySet<string> = new Set(['age_pyramid', 'religion_by_sex']);

const isSexSplitKind = (kind: string): boolean => SEX_SPLIT_KINDS.has(kind);

export interface IndicatorTableRowDto {
  id: string;
  tableId: string;
  rowKey: string;
  label: string;
  male: number | null;
  female: number | null;
  /** Derived (`male + female`) for sex-split kinds; stored for single-value kinds. */
  total: number | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface IndicatorTableTotals {
  rowCount: number;
  male: number | null;
  female: number | null;
  total: number | null;
}

export interface IndicatorTableDto {
  id: string;
  sectionId: string;
  slug: string;
  title: string;
  kind: IndicatorTableKind;
  period: string;
  source: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface IndicatorTableDetailDto extends IndicatorTableDto {
  rows: IndicatorTableRowDto[];
  totals: IndicatorTableTotals;
}

export interface IndicatorTableListFilters {
  sectionId?: string | undefined;
  kind?: IndicatorTableKind | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface IndicatorTableListResult {
  tables: IndicatorTableDto[];
  total: number;
  page: number;
  pageSize: number;
}

export const TABLE_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Signed 32-bit INT columns (matching `indicators.sort_order`): without the upper bound a value
// like 3000000000 passes validation and MySQL rejects it as a non-service error → 500.
const nonnegInt = (field: string) =>
  z.number().refine((v) => Number.isInteger(v) && v >= 0 && v <= 2147483647, {
    message: `${field} harus berupa bilangan bulat antara 0 dan 2147483647`,
  });

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();

/** Empty/whitespace-only strings collapse to null; undefined (absent) stays undefined. */
function sanitizeNullableText(val: string | null | undefined): string | null | undefined {
  if (val === undefined) return undefined;
  if (val === null || val.trim() === '') return null;
  return val.trim();
}

const rowCells = {
  male: nonnegInt('male').nullable().optional(),
  female: nonnegInt('female').nullable().optional(),
  total: nonnegInt('total').nullable().optional(),
};

const rowBaseFields = {
  rowKey: z.string().trim().min(1, 'rowKey wajib diisi').max(64, 'rowKey maksimal 64 karakter'),
  label: z
    .string()
    .trim()
    .min(1, 'Label baris wajib diisi')
    .max(255, 'Label maksimal 255 karakter'),
  ...rowCells,
  sortOrder: z
    .number()
    .refine((v) => Number.isInteger(v) && v >= 0 && v <= 2147483647, {
      message: 'Urutan harus berupa bilangan bulat antara 0 dan 2147483647',
    })
    .optional(),
};

const tableBaseFields = {
  sectionId: z.string().trim().min(1, 'sectionId wajib diisi').max(191),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Slug wajib diisi')
    .max(100, 'Slug maksimal 100 karakter')
    .regex(TABLE_SLUG_REGEX, 'Format slug tidak valid. Gunakan format kebab-case.'),
  title: z.string().trim().min(1, 'Judul wajib diisi').max(255, 'Judul maksimal 255 karakter'),
  kind: z.enum(INDICATOR_TABLE_KINDS),
  period: z.string().trim().min(1, 'Periode wajib diisi').max(64, 'Periode maksimal 64 karakter'),
  source: nullableText(2000),
  sortOrder: rowBaseFields.sortOrder,
};

export const createTableRowSchema = z.object(rowBaseFields).strict();

export const updateTableRowSchema = z
  .object({
    rowKey: rowBaseFields.rowKey.optional(),
    label: rowBaseFields.label.optional(),
    male: rowBaseFields.male,
    female: rowBaseFields.female,
    total: rowBaseFields.total,
    sortOrder: rowBaseFields.sortOrder,
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Setidaknya satu bidang harus disediakan untuk diperbarui',
  });

export const createTableSchema = z
  .object({
    ...tableBaseFields,
    rows: z.array(createTableRowSchema).max(500, 'Maksimal 500 baris per tabel').optional(),
  })
  .strict();

export const updateTableSchema = z
  .object({
    sectionId: tableBaseFields.sectionId.optional(),
    slug: tableBaseFields.slug.optional(),
    title: tableBaseFields.title.optional(),
    kind: tableBaseFields.kind.optional(),
    period: tableBaseFields.period.optional(),
    source: tableBaseFields.source,
    sortOrder: tableBaseFields.sortOrder,
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Setidaknya satu bidang harus disediakan untuk diperbarui',
  });

export type CreateTableRowInput = z.infer<typeof createTableRowSchema>;
export type UpdateTableRowInput = z.infer<typeof updateTableRowSchema>;
export type CreateTableInput = z.infer<typeof createTableSchema>;
export type UpdateTableInput = z.infer<typeof updateTableSchema>;

interface NormalizedCells {
  male: number | null;
  female: number | null;
  total: number | null;
}

function normalizeCells(raw: {
  male?: number | null | undefined;
  female?: number | null | undefined;
  total?: number | null | undefined;
}): NormalizedCells {
  return {
    male: raw.male ?? null,
    female: raw.female ?? null,
    total: raw.total ?? null,
  };
}

/**
 * Opsi A cell-shape rule: sex-split kinds require male+female with total absent; single-value
 * kinds require total with male/female absent. Storing a total alongside male+female would let
 * the two drift apart, so it is rejected rather than reconciled.
 */
function assertRowCells(kind: string, cells: NormalizedCells, scope: string = 'Baris'): void {
  if (isSexSplitKind(kind)) {
    if (cells.male === null || cells.female === null) {
      throw new IndicatorTableServiceError(
        `${scope} tabel ${kind} membutuhkan male dan female (keduanya wajib).`,
        400,
      );
    }
    if (cells.total !== null) {
      throw new IndicatorTableServiceError(
        `${scope} tabel ${kind} tidak memakai total tersimpan — total dihitung dari male + female.`,
        400,
      );
    }
    return;
  }
  if (cells.total === null) {
    throw new IndicatorTableServiceError(
      `${scope} tabel ${kind} membutuhkan total (satu nilai per baris).`,
      400,
    );
  }
  if (cells.male !== null || cells.female !== null) {
    throw new IndicatorTableServiceError(
      `${scope} tabel ${kind} tidak memakai male/female — gunakan total.`,
      400,
    );
  }
}

/**
 * Omitted row sortOrder appends after the current last row (`MAX(sort_order) + 1`) instead of
 * collapsing to 0, where the read path's UUID tiebreak would scatter it. Must run inside the
 * caller's locked transaction so concurrent appends serialize on the parent table lock.
 */
async function resolveAppendSortOrder(
  tx: {
    indicatorTableRow: {
      aggregate(args: unknown): Promise<unknown>;
    };
  },
  tableId: string,
  explicit: number | undefined,
): Promise<number> {
  if (explicit !== undefined) return explicit;
  const agg = (await tx.indicatorTableRow.aggregate({
    where: { tableId },
    _max: { sortOrder: true },
  })) as { _max: { sortOrder: number | null } };
  const max = agg._max.sortOrder;
  if (max === null) return 0;
  return Math.min(max + 1, 2147483647);
}

const DEFAULT_PAGE_SIZE = 50;
export const MAX_TABLE_LIST_PAGE = 10_000;
export const MAX_TABLE_LIST_PAGE_SIZE = 200;
/** Upper bound on rows served per table detail — the 17-group ethnicity table is the largest. */
export const MAX_ROWS_PER_TABLE = 500;

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

interface TableRow {
  id: string;
  sectionId: string;
  slug: string;
  title: string;
  kind: string;
  period: string;
  source: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

interface CellRow {
  id: string;
  tableId: string;
  rowKey: string;
  label: string;
  male: number | null;
  female: number | null;
  total: number | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

function formatTable(row: TableRow): IndicatorTableDto {
  return {
    id: row.id,
    sectionId: row.sectionId,
    slug: row.slug,
    title: row.title,
    kind: row.kind as IndicatorTableKind,
    period: row.period,
    source: row.source,
    sortOrder: row.sortOrder,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function formatRow(row: CellRow, kind: string): IndicatorTableRowDto {
  return {
    id: row.id,
    tableId: row.tableId,
    rowKey: row.rowKey,
    label: row.label,
    male: row.male,
    female: row.female,
    total: isSexSplitKind(kind) ? (row.male ?? 0) + (row.female ?? 0) : row.total,
    sortOrder: row.sortOrder,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

/** SQL-side totals (SUM aggregates, not JS parsing) over the table's normalized rows. */
function toTotals(
  kind: string,
  rowCount: number,
  sums: { male: number | null; female: number | null; total: number | null },
): IndicatorTableTotals {
  if (isSexSplitKind(kind)) {
    const male = sums.male ?? 0;
    const female = sums.female ?? 0;
    return { rowCount, male, female, total: male + female };
  }
  return { rowCount, male: null, female: null, total: sums.total ?? 0 };
}

/** JS-side fallback for totals when rows are already in hand (create path). */
function totalsFromRows(
  kind: string,
  rows: Array<{ male: number | null; female: number | null; total: number | null }>,
): IndicatorTableTotals {
  const sums = {
    male: rows.reduce<number | null>(
      (acc, r) => (r.male === null ? acc : (acc ?? 0) + r.male),
      null,
    ),
    female: rows.reduce<number | null>(
      (acc, r) => (r.female === null ? acc : (acc ?? 0) + r.female),
      null,
    ),
    total: rows.reduce<number | null>(
      (acc, r) => (r.total === null ? acc : (acc ?? 0) + r.total),
      null,
    ),
  };
  return toTotals(kind, rows.length, sums);
}

function normalizeListFilters(filters: IndicatorTableListFilters): {
  sectionId?: string;
  kind?: IndicatorTableKind;
  page: number;
  pageSize: number;
} {
  const page =
    typeof filters.page === 'number' && Number.isFinite(filters.page) && filters.page > 0
      ? Math.min(Math.floor(filters.page), MAX_TABLE_LIST_PAGE)
      : 1;
  const pageSize =
    typeof filters.pageSize === 'number' &&
    Number.isFinite(filters.pageSize) &&
    filters.pageSize > 0
      ? Math.min(Math.floor(filters.pageSize), MAX_TABLE_LIST_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  return {
    ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
    ...(filters.kind ? { kind: filters.kind } : {}),
    page,
    pageSize,
  };
}

function isPrismaKnownError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

const CACHE_TTL_MS = 60 * 1000; // 1 minute
const MAX_CACHE_ENTRIES = 200;

const tableListCache = new KeyedLruCache<string, VersionedTtlCache<IndicatorTableListResult>>(
  MAX_CACHE_ENTRIES,
);

export const tableByIdCache = new KeyedLruCache<
  string,
  VersionedTtlCache<IndicatorTableDetailDto | null>
>(MAX_CACHE_ENTRIES);

export const tableBySlugCache = new KeyedLruCache<
  string,
  VersionedTtlCache<IndicatorTableDetailDto | null>
>(MAX_CACHE_ENTRIES);

const NEGATIVE_TTL_MS = 10 * 1000; // 10 seconds
const MAX_NEGATIVE_ENTRIES = 200;
const missingTableIds = new Map<string, number>();
const missingTableSlugs = new Map<string, number>();

function isKnownMissing(map: Map<string, number>, key: string): boolean {
  const expiresAt = map.get(key);
  if (expiresAt === undefined) return false;
  if (Date.now() >= expiresAt) {
    map.delete(key);
    return false;
  }
  return true;
}

function rememberMissing(map: Map<string, number>, key: string): void {
  if (!map.has(key)) {
    if (map.size >= MAX_NEGATIVE_ENTRIES) {
      const oldest = map.keys().next().value;
      if (oldest !== undefined) map.delete(oldest);
    }
  } else {
    map.delete(key);
  }
  map.set(key, Date.now() + NEGATIVE_TTL_MS);
}

const getListCache = (key: string): VersionedTtlCache<IndicatorTableListResult> =>
  tableListCache.getOrCompute(
    key,
    () =>
      new VersionedTtlCache<IndicatorTableListResult>({ ttlMs: CACHE_TTL_MS, baseClient: prisma }),
  );

const getByIdCache = (id: string): VersionedTtlCache<IndicatorTableDetailDto | null> =>
  tableByIdCache.getOrCompute(
    id,
    () =>
      new VersionedTtlCache<IndicatorTableDetailDto | null>({
        ttlMs: CACHE_TTL_MS,
        baseClient: prisma,
      }),
  );

const getBySlugCache = (slug: string): VersionedTtlCache<IndicatorTableDetailDto | null> =>
  tableBySlugCache.getOrCompute(
    slug,
    () =>
      new VersionedTtlCache<IndicatorTableDetailDto | null>({
        ttlMs: CACHE_TTL_MS,
        baseClient: prisma,
      }),
  );

const listCachesInvalidator: CacheInvalidator = {
  invalidate: () => {
    for (const cache of tableListCache.values()) {
      cache.invalidate();
    }
    tableListCache.clear();
  },
};

export const invalidateIndicatorTablesCache = (idOrSlug?: string): void => {
  if (idOrSlug) {
    tableByIdCache.get(idOrSlug)?.invalidate();
    tableBySlugCache.get(idOrSlug)?.invalidate();
    missingTableIds.delete(idOrSlug);
    missingTableSlugs.delete(idOrSlug);
  } else {
    tableByIdCache.clear();
    tableBySlugCache.clear();
    missingTableIds.clear();
    missingTableSlugs.clear();
  }
  for (const cache of tableListCache.values()) {
    cache.invalidate();
  }
  tableListCache.clear();
};

type TableReadClient = {
  indicatorTable: Pick<
    typeof prisma.indicatorTable,
    'findMany' | 'count' | 'findUnique' | 'findFirst'
  >;
  indicatorTableRow: Pick<typeof prisma.indicatorTableRow, 'findMany' | 'aggregate'>;
};

export const listIndicatorTables = async (
  filters: IndicatorTableListFilters = {},
  client: Pick<TableReadClient, 'indicatorTable'> = prisma,
): Promise<IndicatorTableListResult> => {
  const normalized = normalizeListFilters(filters);
  const cacheKey = stableJsonStringify(normalized);

  return getListCache(cacheKey).getOrFetch(async (db) => {
    const where = {
      ...(normalized.sectionId ? { sectionId: normalized.sectionId } : {}),
      ...(normalized.kind ? { kind: normalized.kind } : {}),
    };
    const [rows, total] = await Promise.all([
      db.indicatorTable.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        skip: (normalized.page - 1) * normalized.pageSize,
        take: normalized.pageSize,
      }),
      db.indicatorTable.count({ where }),
    ]);
    return {
      tables: rows.map((row) => formatTable(row as TableRow)),
      total,
      page: normalized.page,
      pageSize: normalized.pageSize,
    };
  }, client);
};

async function fetchTableDetail(
  db: Pick<TableReadClient, 'indicatorTableRow'>,
  table: TableRow,
): Promise<IndicatorTableDetailDto> {
  const [rows, sums] = await Promise.all([
    db.indicatorTableRow.findMany({
      where: { tableId: table.id },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      take: MAX_ROWS_PER_TABLE,
    }),
    db.indicatorTableRow.aggregate({
      where: { tableId: table.id },
      _sum: { male: true, female: true, total: true },
      _count: { _all: true },
    }),
  ]);
  const typedRows = rows as CellRow[];
  return {
    ...formatTable(table),
    rows: typedRows.map((r) => formatRow(r, table.kind)),
    totals: toTotals(table.kind, (sums as { _count: { _all: number } })._count._all, {
      male: (sums as { _sum: { male: number | null } })._sum.male,
      female: (sums as { _sum: { female: number | null } })._sum.female,
      total: (sums as { _sum: { total: number | null } })._sum.total,
    }),
  };
}

export const getIndicatorTableById = async (
  id: unknown,
  client: TableReadClient = prisma,
): Promise<IndicatorTableDetailDto | null> => {
  if (typeof id !== 'string' || id.trim() === '' || id.length > 191) {
    return null;
  }
  const normalizedId = id.trim();
  const useSharedCache = client === prisma;
  if (useSharedCache && isKnownMissing(missingTableIds, normalizedId)) {
    return null;
  }
  const result = await getByIdCache(normalizedId).getOrFetch(async (db) => {
    const table = await db.indicatorTable.findUnique({ where: { id: normalizedId } });
    if (!table) return null;
    return fetchTableDetail(db, table as TableRow);
  }, client);
  if (result === null && useSharedCache) {
    tableByIdCache.delete(normalizedId);
    rememberMissing(missingTableIds, normalizedId);
  }
  return result;
};

export const getIndicatorTableBySlug = async (
  slug: unknown,
  client: TableReadClient = prisma,
): Promise<IndicatorTableDetailDto | null> => {
  if (typeof slug !== 'string' || slug.trim() === '' || slug.length > 100) {
    return null;
  }
  const normalizedSlug = slug.trim().toLowerCase();
  const useSharedCache = client === prisma;
  if (useSharedCache && isKnownMissing(missingTableSlugs, normalizedSlug)) {
    return null;
  }
  const result = await getBySlugCache(normalizedSlug).getOrFetch(async (db) => {
    const table = await db.indicatorTable.findUnique({ where: { slug: normalizedSlug } });
    if (!table) return null;
    return fetchTableDetail(db, table as TableRow);
  }, client);
  if (result === null && useSharedCache) {
    tableBySlugCache.delete(normalizedSlug);
    rememberMissing(missingTableSlugs, normalizedSlug);
  }
  return result;
};

/** Tracks which table a row mutation touched so onCommit can warm/drop its detail caches. */
interface AffectedTable {
  id: string;
  slug: string;
}

function warmTableCaches(detail: IndicatorTableDetailDto): void {
  getByIdCache(detail.id).setCommitted(detail);
  getBySlugCache(detail.slug).setCommitted(detail);
  missingTableIds.delete(detail.id);
  missingTableSlugs.delete(detail.slug);
}

function dropTableCaches(affected: AffectedTable): void {
  tableByIdCache.delete(affected.id);
  tableBySlugCache.delete(affected.slug);
  missingTableIds.delete(affected.id);
  missingTableSlugs.delete(affected.slug);
}

function parsePayload(rawInput: unknown): Record<string, unknown> {
  if (typeof rawInput !== 'object' || rawInput === null || Array.isArray(rawInput)) {
    throw new IndicatorTableServiceError('Payload harus berupa objek JSON.', 400);
  }
  return rawInput as Record<string, unknown>;
}

export const createIndicatorTable = async (
  rawInput: unknown,
  actor: AuditActor,
  reqContext: AuditRequestContext,
  client = prisma,
): Promise<IndicatorTableDetailDto> => {
  const parsed = createTableSchema.safeParse(parsePayload(rawInput));
  if (!parsed.success) {
    throw new IndicatorTableServiceError(parsed.error.issues.map((i) => i.message).join(', '), 400);
  }
  const input = parsed.data;

  // Rows omitting sortOrder inherit their submission order (array index) instead of all
  // collapsing to 0 — with all-zero ties the read path's id tiebreak (random UUIDs) would
  // return them scrambled relative to the submitted order.
  const nestedRows = (input.rows ?? []).map((r, index) => ({
    rowKey: r.rowKey.trim(),
    label: r.label.trim(),
    ...normalizeCells(r),
    sortOrder: r.sortOrder ?? index,
  }));
  for (const row of nestedRows) {
    assertRowCells(input.kind, row);
  }
  const seenKeys = new Set<string>();
  for (const row of nestedRows) {
    if (seenKeys.has(row.rowKey)) {
      throw new IndicatorTableServiceError(
        `rowKey '${row.rowKey}' duplikat dalam payload — setiap baris harus unik per tabel.`,
        400,
      );
    }
    seenKeys.add(row.rowKey);
  }

  const sectionId = input.sectionId.trim();
  const lockQuery = Prisma.sql`SELECT id FROM sections WHERE id = ${sectionId} FOR UPDATE`;

  try {
    return await executeLockedTransaction({
      client,
      lockQuery,
      cache: [listCachesInvalidator],
      onCommit: (committed) => {
        warmTableCaches(committed);
      },
      execute: async (tx) => {
        const section = await tx.section.findUnique({ where: { id: sectionId } });
        if (!section) {
          throw new IndicatorTableServiceError('Section tidak ditemukan.', 404);
        }

        const created = await tx.indicatorTable.create({
          data: {
            sectionId,
            slug: input.slug,
            title: input.title.trim(),
            kind: input.kind,
            period: input.period.trim(),
            source: sanitizeNullableText(input.source) ?? null,
            sortOrder: input.sortOrder ?? 0,
            rows: { create: nestedRows },
          },
          include: { rows: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
        });

        const typed = created as unknown as TableRow & { rows: CellRow[] };
        const detail: IndicatorTableDetailDto = {
          ...formatTable(typed),
          rows: typed.rows.map((r) => formatRow(r, typed.kind)),
          totals: totalsFromRows(typed.kind, typed.rows),
        };

        await buildAuditLog(
          {
            action: AUDIT_ACTIONS.INDICATOR_TABLE_CREATED,
            actor,
            target: { type: 'indicator_table', id: typed.id, label: typed.slug },
            metadata: {
              slug: typed.slug,
              kind: typed.kind,
              sectionId,
              rowCount: typed.rows.length,
            },
            context: reqContext,
          },
          tx,
        );

        return detail;
      },
    });
  } catch (error) {
    if (error instanceof IndicatorTableServiceError) throw error;
    if (isPrismaKnownError(error, 'P2002')) {
      throw new IndicatorTableServiceError(
        `Slug '${input.slug}' sudah digunakan tabel indikator lain.`,
        409,
      );
    }
    throw error;
  }
};

export const updateIndicatorTable = async (
  id: unknown,
  rawInput: unknown,
  actor: AuditActor,
  reqContext: AuditRequestContext,
  client = prisma,
): Promise<IndicatorTableDetailDto> => {
  if (typeof id !== 'string' || id.trim() === '' || id.length > 191) {
    throw new IndicatorTableServiceError('ID tabel indikator tidak valid.', 400);
  }
  const normalizedId = id.trim();

  const parsed = updateTableSchema.safeParse(parsePayload(rawInput));
  if (!parsed.success) {
    throw new IndicatorTableServiceError(parsed.error.issues.map((i) => i.message).join(', '), 400);
  }
  const input = parsed.data as UpdateTableInput & Record<string, unknown>;

  const lockQuery = Prisma.sql`SELECT id FROM indicator_tables WHERE id = ${normalizedId} FOR UPDATE`;
  const affected: AffectedTable[] = [];

  try {
    return await executeLockedTransaction({
      client,
      lockQuery,
      cache: [listCachesInvalidator],
      onCommit: (committed, didChange) => {
        if (!didChange) return;
        const target = affected[0];
        if (target) dropTableCaches(target);
        warmTableCaches(committed);
      },
      execute: async (tx) => {
        const existing = (await tx.indicatorTable.findUnique({
          where: { id: normalizedId },
        })) as unknown as TableRow | null;
        if (!existing) {
          throw new IndicatorTableServiceError('Tabel indikator tidak ditemukan.', 404);
        }

        if (input.sectionId !== undefined) {
          const nextSectionId = (input.sectionId as string).trim();
          if (nextSectionId !== existing.sectionId) {
            await tx.$queryRaw(
              Prisma.sql`SELECT id FROM sections WHERE id = ${nextSectionId} FOR UPDATE`,
            );
          }
          const section = await tx.section.findUnique({ where: { id: nextSectionId } });
          if (!section) {
            throw new IndicatorTableServiceError('Section tidak ditemukan.', 404);
          }
        }

        if (input.slug !== undefined && input.slug !== existing.slug) {
          const clash = await tx.indicatorTable.findUnique({ where: { slug: input.slug } });
          if (clash && (clash as unknown as TableRow).id !== normalizedId) {
            throw new IndicatorTableServiceError(
              `Slug '${input.slug}' sudah digunakan tabel indikator lain.`,
              409,
            );
          }
        }

        if (input.kind !== undefined && input.kind !== existing.kind) {
          const rowCount = await tx.indicatorTableRow.count({
            where: { tableId: normalizedId },
          });
          if (rowCount > 0) {
            throw new IndicatorTableServiceError(
              'Jenis tabel tidak dapat diubah selama masih memiliki baris — hapus barisnya dulu.',
              400,
            );
          }
        }

        const changes: Record<string, { before: unknown; after: unknown }> = {};
        const track = (field: string, before: unknown, after: unknown) => {
          if (hasFieldChanged(before, after)) {
            changes[field] = { before, after };
          }
        };

        if (input.sectionId !== undefined)
          track('sectionId', existing.sectionId, (input.sectionId as string).trim());
        if (input.slug !== undefined) track('slug', existing.slug, input.slug);
        if (input.title !== undefined)
          track('title', existing.title, (input.title as string).trim());
        if (input.kind !== undefined) track('kind', existing.kind, input.kind);
        if (input.period !== undefined)
          track('period', existing.period, (input.period as string).trim());
        if (input.source !== undefined)
          track(
            'source',
            existing.source,
            sanitizeNullableText(input.source as string | null) ?? null,
          );
        if (input.sortOrder !== undefined) track('sortOrder', existing.sortOrder, input.sortOrder);

        if (Object.keys(changes).length === 0) {
          const detail = await fetchTableDetail(
            tx as unknown as Pick<TableReadClient, 'indicatorTableRow'>,
            existing,
          );
          return withChangeResult(detail, false);
        }

        const updated = (await tx.indicatorTable.update({
          where: { id: normalizedId },
          data: {
            ...(input.sectionId !== undefined
              ? { sectionId: (input.sectionId as string).trim() }
              : {}),
            ...(input.slug !== undefined ? { slug: input.slug } : {}),
            ...(input.title !== undefined ? { title: (input.title as string).trim() } : {}),
            ...(input.kind !== undefined ? { kind: input.kind } : {}),
            ...(input.period !== undefined ? { period: (input.period as string).trim() } : {}),
            ...(input.source !== undefined
              ? { source: sanitizeNullableText(input.source as string | null) ?? null }
              : {}),
            ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          },
        })) as unknown as TableRow;

        await buildAuditLog(
          {
            action: AUDIT_ACTIONS.INDICATOR_TABLE_UPDATED,
            actor,
            target: { type: 'indicator_table', id: existing.id, label: existing.slug },
            metadata: { slug: existing.slug, changes },
            context: reqContext,
          },
          tx,
        );

        affected.push({ id: existing.id, slug: existing.slug });
        if (updated.slug !== existing.slug) {
          affected.push({ id: updated.id, slug: updated.slug });
        }
        return fetchTableDetail(
          tx as unknown as Pick<TableReadClient, 'indicatorTableRow'>,
          updated,
        );
      },
    });
  } catch (error) {
    if (error instanceof IndicatorTableServiceError) throw error;
    if (isPrismaKnownError(error, 'P2002')) {
      throw new IndicatorTableServiceError('Slug sudah digunakan tabel indikator lain.', 409);
    }
    if (isPrismaKnownError(error, 'P2025')) {
      throw new IndicatorTableServiceError('Tabel indikator tidak ditemukan.', 404);
    }
    if (isPrismaKnownError(error, 'P2003')) {
      throw new IndicatorTableServiceError('Section tidak ditemukan.', 404);
    }
    throw error;
  }
};

export const deleteIndicatorTable = async (
  id: unknown,
  actor: AuditActor,
  reqContext: AuditRequestContext,
  client = prisma,
): Promise<IndicatorTableDto> => {
  if (typeof id !== 'string' || id.trim() === '' || id.length > 191) {
    throw new IndicatorTableServiceError('ID tabel indikator tidak valid.', 400);
  }
  const normalizedId = id.trim();

  const lockQuery = Prisma.sql`SELECT id FROM indicator_tables WHERE id = ${normalizedId} FOR UPDATE`;
  const affected: AffectedTable[] = [];

  try {
    return await executeLockedTransaction({
      client,
      lockQuery,
      cache: [listCachesInvalidator],
      onCommit: () => {
        const target = affected[0];
        if (target) dropTableCaches(target);
      },
      execute: async (tx) => {
        const existing = (await tx.indicatorTable.findUnique({
          where: { id: normalizedId },
        })) as unknown as TableRow | null;
        if (!existing) {
          throw new IndicatorTableServiceError('Tabel indikator tidak ditemukan.', 404);
        }

        const rowCount = await tx.indicatorTableRow.count({ where: { tableId: normalizedId } });
        await tx.indicatorTable.delete({ where: { id: normalizedId } });

        const before = formatTable(existing);
        await buildAuditLog(
          {
            action: AUDIT_ACTIONS.INDICATOR_TABLE_DELETED,
            actor,
            target: { type: 'indicator_table', id: existing.id, label: existing.slug },
            metadata: {
              slug: existing.slug,
              kind: existing.kind,
              sectionId: existing.sectionId,
              rowCount,
              before,
            },
            context: reqContext,
          },
          tx,
        );

        affected.push({ id: existing.id, slug: existing.slug });
        return before;
      },
    });
  } catch (error) {
    if (error instanceof IndicatorTableServiceError) throw error;
    if (isPrismaKnownError(error, 'P2025')) {
      throw new IndicatorTableServiceError('Tabel indikator tidak ditemukan.', 404);
    }
    throw error;
  }
};

export const createIndicatorTableRow = async (
  tableId: unknown,
  rawInput: unknown,
  actor: AuditActor,
  reqContext: AuditRequestContext,
  client = prisma,
): Promise<IndicatorTableRowDto> => {
  if (typeof tableId !== 'string' || tableId.trim() === '' || tableId.length > 191) {
    throw new IndicatorTableServiceError('ID tabel indikator tidak valid.', 400);
  }
  const normalizedTableId = tableId.trim();

  const parsed = createTableRowSchema.safeParse(parsePayload(rawInput));
  if (!parsed.success) {
    throw new IndicatorTableServiceError(parsed.error.issues.map((i) => i.message).join(', '), 400);
  }
  const input = parsed.data;
  const cells = normalizeCells(input);

  const lockQuery = Prisma.sql`SELECT id FROM indicator_tables WHERE id = ${normalizedTableId} FOR UPDATE`;
  const affected: AffectedTable[] = [];

  try {
    return await executeLockedTransaction({
      client,
      lockQuery,
      cache: [listCachesInvalidator],
      onCommit: () => {
        const target = affected[0];
        if (target) dropTableCaches(target);
      },
      execute: async (tx) => {
        const table = (await tx.indicatorTable.findUnique({
          where: { id: normalizedTableId },
        })) as unknown as TableRow | null;
        if (!table) {
          throw new IndicatorTableServiceError('Tabel indikator tidak ditemukan.', 404);
        }
        assertRowCells(table.kind, cells);

        // The detail read caps rows at MAX_ROWS_PER_TABLE while totals aggregate over all of
        // them — allowing a 501st row would desync displayed rows from the totals (and hide
        // the extra row forever). Enforced here, inside the locked transaction, so the
        // invariant rows.length === totals.rowCount always holds.
        const existingRowCount = await tx.indicatorTableRow.count({
          where: { tableId: normalizedTableId },
        });
        if (existingRowCount >= MAX_ROWS_PER_TABLE) {
          throw new IndicatorTableServiceError(
            `Tabel sudah mencapai batas ${MAX_ROWS_PER_TABLE} baris.`,
            409,
          );
        }

        const rowKey = input.rowKey.trim();
        const clash = await tx.indicatorTableRow.findUnique({
          where: { tableId_rowKey: { tableId: normalizedTableId, rowKey } },
        });
        if (clash) {
          throw new IndicatorTableServiceError(
            `rowKey '${rowKey}' sudah dipakai baris lain di tabel ini.`,
            409,
          );
        }

        const created = (await tx.indicatorTableRow.create({
          data: {
            tableId: normalizedTableId,
            rowKey,
            label: input.label.trim(),
            male: cells.male,
            female: cells.female,
            total: cells.total,
            // Omitted sortOrder appends after the current last row instead of collapsing to
            // 0 — computed inside this locked transaction so concurrent appends serialize.
            sortOrder: await resolveAppendSortOrder(
              tx as unknown as Parameters<typeof resolveAppendSortOrder>[0],
              normalizedTableId,
              input.sortOrder,
            ),
          },
        })) as unknown as CellRow;

        await buildAuditLog(
          {
            action: AUDIT_ACTIONS.INDICATOR_TABLE_ROW_CREATED,
            actor,
            target: { type: 'indicator_table_row', id: created.id, label: rowKey },
            metadata: { tableId: normalizedTableId, tableSlug: table.slug, rowKey },
            context: reqContext,
          },
          tx,
        );

        affected.push({ id: table.id, slug: table.slug });
        return formatRow(created, table.kind);
      },
    });
  } catch (error) {
    if (error instanceof IndicatorTableServiceError) throw error;
    if (isPrismaKnownError(error, 'P2002')) {
      throw new IndicatorTableServiceError('rowKey sudah dipakai baris lain di tabel ini.', 409);
    }
    throw error;
  }
};

export const updateIndicatorTableRow = async (
  id: unknown,
  rawInput: unknown,
  actor: AuditActor,
  reqContext: AuditRequestContext,
  client = prisma,
): Promise<IndicatorTableRowDto> => {
  if (typeof id !== 'string' || id.trim() === '' || id.length > 191) {
    throw new IndicatorTableServiceError('ID baris tabel tidak valid.', 400);
  }
  const normalizedId = id.trim();

  const parsed = updateTableRowSchema.safeParse(parsePayload(rawInput));
  if (!parsed.success) {
    throw new IndicatorTableServiceError(parsed.error.issues.map((i) => i.message).join(', '), 400);
  }
  const input = parsed.data as UpdateTableRowInput & Record<string, unknown>;

  const lockQuery = Prisma.sql`SELECT id FROM indicator_table_rows WHERE id = ${normalizedId} FOR UPDATE`;
  const affected: AffectedTable[] = [];

  try {
    return await executeLockedTransaction({
      client,
      lockQuery,
      cache: [listCachesInvalidator],
      onCommit: (committed, didChange) => {
        if (!didChange) return;
        const target = affected[0];
        if (target) dropTableCaches(target);
      },
      execute: async (tx) => {
        const existing = (await tx.indicatorTableRow.findUnique({
          where: { id: normalizedId },
        })) as unknown as CellRow | null;
        if (!existing) {
          throw new IndicatorTableServiceError('Baris tabel tidak ditemukan.', 404);
        }
        const table = (await tx.indicatorTable.findUnique({
          where: { id: existing.tableId },
        })) as unknown as TableRow | null;
        if (!table) {
          throw new IndicatorTableServiceError('Tabel indikator tidak ditemukan.', 404);
        }

        const nextCells: NormalizedCells = {
          male: input.male !== undefined ? ((input.male as number | null) ?? null) : existing.male,
          female:
            input.female !== undefined
              ? ((input.female as number | null) ?? null)
              : existing.female,
          total:
            input.total !== undefined ? ((input.total as number | null) ?? null) : existing.total,
        };
        assertRowCells(table.kind, nextCells);

        const nextRowKey =
          input.rowKey !== undefined ? (input.rowKey as string).trim() : existing.rowKey;
        if (nextRowKey !== existing.rowKey) {
          const clash = await tx.indicatorTableRow.findUnique({
            where: { tableId_rowKey: { tableId: existing.tableId, rowKey: nextRowKey } },
          });
          if (clash && (clash as unknown as CellRow).id !== normalizedId) {
            throw new IndicatorTableServiceError(
              `rowKey '${nextRowKey}' sudah dipakai baris lain di tabel ini.`,
              409,
            );
          }
        }

        const changes: Record<string, { before: unknown; after: unknown }> = {};
        const track = (field: string, before: unknown, after: unknown) => {
          if (hasFieldChanged(before, after)) {
            changes[field] = { before, after };
          }
        };

        if (input.rowKey !== undefined) track('rowKey', existing.rowKey, nextRowKey);
        if (input.label !== undefined)
          track('label', existing.label, (input.label as string).trim());
        if (input.male !== undefined) track('male', existing.male, nextCells.male);
        if (input.female !== undefined) track('female', existing.female, nextCells.female);
        if (input.total !== undefined) track('total', existing.total, nextCells.total);
        if (input.sortOrder !== undefined) track('sortOrder', existing.sortOrder, input.sortOrder);

        if (Object.keys(changes).length === 0) {
          return withChangeResult(formatRow(existing, table.kind), false);
        }

        const updated = (await tx.indicatorTableRow.update({
          where: { id: normalizedId },
          data: {
            ...(input.rowKey !== undefined ? { rowKey: nextRowKey } : {}),
            ...(input.label !== undefined ? { label: (input.label as string).trim() } : {}),
            ...(input.male !== undefined ? { male: nextCells.male } : {}),
            ...(input.female !== undefined ? { female: nextCells.female } : {}),
            ...(input.total !== undefined ? { total: nextCells.total } : {}),
            ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          },
        })) as unknown as CellRow;

        await buildAuditLog(
          {
            action: AUDIT_ACTIONS.INDICATOR_TABLE_ROW_UPDATED,
            actor,
            target: { type: 'indicator_table_row', id: existing.id, label: existing.rowKey },
            metadata: { tableId: existing.tableId, tableSlug: table.slug, changes },
            context: reqContext,
          },
          tx,
        );

        affected.push({ id: table.id, slug: table.slug });
        return formatRow(updated, table.kind);
      },
    });
  } catch (error) {
    if (error instanceof IndicatorTableServiceError) throw error;
    if (isPrismaKnownError(error, 'P2002')) {
      throw new IndicatorTableServiceError('rowKey sudah dipakai baris lain di tabel ini.', 409);
    }
    if (isPrismaKnownError(error, 'P2025')) {
      throw new IndicatorTableServiceError('Baris tabel tidak ditemukan.', 404);
    }
    throw error;
  }
};

export const deleteIndicatorTableRow = async (
  id: unknown,
  actor: AuditActor,
  reqContext: AuditRequestContext,
  client = prisma,
): Promise<IndicatorTableRowDto> => {
  if (typeof id !== 'string' || id.trim() === '' || id.length > 191) {
    throw new IndicatorTableServiceError('ID baris tabel tidak valid.', 400);
  }
  const normalizedId = id.trim();

  const lockQuery = Prisma.sql`SELECT id FROM indicator_table_rows WHERE id = ${normalizedId} FOR UPDATE`;
  const affected: AffectedTable[] = [];

  try {
    return await executeLockedTransaction({
      client,
      lockQuery,
      cache: [listCachesInvalidator],
      onCommit: () => {
        const target = affected[0];
        if (target) dropTableCaches(target);
      },
      execute: async (tx) => {
        const existing = (await tx.indicatorTableRow.findUnique({
          where: { id: normalizedId },
        })) as unknown as CellRow | null;
        if (!existing) {
          throw new IndicatorTableServiceError('Baris tabel tidak ditemukan.', 404);
        }
        const table = (await tx.indicatorTable.findUnique({
          where: { id: existing.tableId },
        })) as unknown as TableRow | null;
        if (!table) {
          throw new IndicatorTableServiceError('Tabel indikator tidak ditemukan.', 404);
        }

        await tx.indicatorTableRow.delete({ where: { id: normalizedId } });

        const before = formatRow(existing, table.kind);
        await buildAuditLog(
          {
            action: AUDIT_ACTIONS.INDICATOR_TABLE_ROW_DELETED,
            actor,
            target: { type: 'indicator_table_row', id: existing.id, label: existing.rowKey },
            metadata: {
              tableId: existing.tableId,
              tableSlug: table.slug,
              rowKey: existing.rowKey,
              before,
            },
            context: reqContext,
          },
          tx,
        );

        affected.push({ id: table.id, slug: table.slug });
        return before;
      },
    });
  } catch (error) {
    if (error instanceof IndicatorTableServiceError) throw error;
    if (isPrismaKnownError(error, 'P2025')) {
      throw new IndicatorTableServiceError('Baris tabel tidak ditemukan.', 404);
    }
    throw error;
  }
};
