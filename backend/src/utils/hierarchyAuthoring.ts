import { z } from 'zod';
import type { Response } from 'express';

/**
 * Shared building blocks for the Cerita hierarchy authoring API (SPEC §2/§3): pages, chapters,
 * sections and section prose blocks. Pure helpers only — no Prisma here — so each service keeps
 * its own transactions and this file stays trivially unit-testable.
 */

export const STALE_WRITE_CODE = 'STALE_WRITE';
export const HAS_DEPENDENTS_CODE = 'HAS_DEPENDENTS';
export const STANDALONE_BLOCK_PROTECTED_CODE = 'STANDALONE_BLOCK_PROTECTED';
export const FIGURE_BLOCK_PROTECTED_CODE = 'FIGURE_BLOCK_PROTECTED';
export const FIGURE_BLOCK_PROTECTED_MESSAGE =
  'Gambar bagian tidak dapat diubah atau dihapus lewat blok konten. Gunakan pengaturan gambar pada bagian terkait.';
export const PUBLIKASI_BLOCK_PROTECTED_CODE = 'PUBLIKASI_BLOCK_PROTECTED';
export const PUBLIKASI_BLOCK_PROTECTED_MESSAGE =
  'Daftar publikasi tidak dapat diubah lewat blok konten. Gunakan halaman Publikasi di menu admin.';
export const FIGURE_NOT_FOUND_CODE = 'FIGURE_NOT_FOUND';

export interface ServiceErrorDetails {
  [key: string]: unknown;
}

export class HierarchyServiceError extends Error {
  statusCode: number;
  code?: string | undefined;
  details?: ServiceErrorDetails | undefined;

  constructor(message: string, statusCode: number, code?: string, details?: ServiceErrorDetails) {
    super(message);
    this.name = 'HierarchyServiceError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/** Writes `{error, code?, details?}`; returns false when `error` is not a hierarchy error. */
export function sendHierarchyError(res: Response, error: unknown): boolean {
  if (!(error instanceof HierarchyServiceError)) {
    return false;
  }
  res.status(error.statusCode).json({
    error: error.message,
    ...(error.code ? { code: error.code } : {}),
    ...(error.details ? { details: error.details } : {}),
  });
  return true;
}

export const MAX_SORT_ORDER = 2_147_483_647;
export const MAX_SLUG_LENGTH = 100;
export const MAX_REORDER_ITEMS = 500;

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'reorder',
  'api',
  'admin',
  'auth',
  'settings',
  'public',
  'health',
  'null',
  'undefined',
]);

const INVISIBLE_OR_BIDI_REGEX = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/u;

export function hasControlCharacters(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if ((code >= 0 && code <= 31) || code === 127) {
      return true;
    }
  }
  return INVISIBLE_OR_BIDI_REGEX.test(str);
}

/** Title rules shared with page creation: 1–255 chars, no control/bidi characters, no HTML. */
export const titleSchema = (label: string) =>
  z
    .string({ error: `${label} harus berupa string` })
    .trim()
    .min(1, `${label} tidak boleh kosong`)
    .max(255, `${label} maksimal 255 karakter`)
    .refine(
      (v) => !hasControlCharacters(v),
      `${label} mengandung karakter kontrol yang tidak valid`,
    )
    .refine((v) => !/<[a-z!/]/i.test(v), `${label} tidak boleh mengandung tag HTML`);

export const expectedUpdatedAtSchema = z
  .string({ error: 'expectedUpdatedAt wajib diisi (string ISO 8601)' })
  .datetime({ offset: true, error: 'expectedUpdatedAt harus berupa tanggal ISO 8601 yang valid' });

export const idParamSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'ID tidak valid');

/** Runs a zod schema and converts the first batch of issues into a 400 service error. */
export function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new HierarchyServiceError(parsed.error.issues.map((i) => i.message).join(', '), 400);
  }
  return parsed.data;
}

export function assertPlainObject(input: unknown, message: string): void {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HierarchyServiceError(message, 400);
  }
}

/** Reads and validates `expectedUpdatedAt` from a query string value (DELETE endpoints). */
export function parseExpectedUpdatedAtQuery(raw: unknown): string {
  return parseOrThrow(expectedUpdatedAtSchema, raw);
}

/**
 * Optimistic-concurrency precondition: the row's current `updatedAt` must equal the value the
 * client last saw. Compared at millisecond precision (MySQL DATETIME(3) / ISO strings).
 */
export function assertFresh(current: Date, expectedIso: string, label: string): void {
  const expected = Date.parse(expectedIso);
  if (Number.isNaN(expected) || current.getTime() !== expected) {
    throw new HierarchyServiceError(
      `${label} telah diubah oleh pengguna lain. Muat ulang data lalu coba lagi.`,
      409,
      STALE_WRITE_CODE,
      { currentUpdatedAt: current.toISOString() },
    );
  }
}

/** Latin-ish slugify: strips diacritics, lower-cases, collapses non-alphanumerics to `-`. */
export function slugifyTitle(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Derives the base slug for a new chapter/section/prose block from its title. Rejects titles
 * that yield no slug — clients never supply slugs for these resources. Reserved words are NOT an
 * error here (they protect page slugs, which are top-level routes); a clash is resolved by
 * `resolveUniqueSlug` picking a free slug.
 */
export function baseSlugFromTitle(title: string, label: string): string {
  let slug = slugifyTitle(title);
  if (slug.length > MAX_SLUG_LENGTH) {
    slug = slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, '');
  }
  if (!slug) {
    throw new HierarchyServiceError(
      `Gagal membuat slug dari judul ${label}. Gunakan judul yang memuat huruf atau angka.`,
      400,
    );
  }
  return slug;
}

/** First free slug in `taken`: `base`, then `base-2`, `base-3`, … (within the 100-char cap). */
export function resolveUniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const head = base.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/g, '');
    const candidate = `${head}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export const reorderItemSchema = z
  .object({
    id: idParamSchema,
    sortOrder: z
      .number({ error: 'Urutan (sortOrder) harus berupa bilangan bulat' })
      .int('Urutan (sortOrder) harus berupa bilangan bulat')
      .min(0, 'Urutan (sortOrder) minimal 0')
      .max(MAX_SORT_ORDER, 'Urutan (sortOrder) melebihi batas maksimum'),
  })
  .strict();

export const reorderBodySchema = z
  .object({
    expectedUpdatedAt: expectedUpdatedAtSchema,
    items: z
      .array(reorderItemSchema, { error: 'items harus berupa array' })
      .min(1, 'Daftar urutan tidak boleh kosong')
      .max(MAX_REORDER_ITEMS, `Maksimal ${MAX_REORDER_ITEMS} item per permintaan`),
  })
  .strict();

export interface ReorderItem {
  id: string;
  sortOrder: number;
}

export interface ReorderSibling {
  id: string;
  sortOrder: number | null;
}

export interface ReorderPlan {
  /** Items whose sortOrder actually changes, sorted by id ascending (deterministic lock order). */
  changes: Array<ReorderItem & { from: number | null }>;
}

/**
 * Validates a reorder request against the parent's current children and computes the minimal
 * change set. Items must be unique by id and by sortOrder and cover every sibling exactly.
 */
export function planReorder(
  items: ReorderItem[],
  siblings: ReorderSibling[],
  label: string,
): ReorderPlan {
  const siblingMap = new Map(siblings.map((s) => [s.id, s]));
  const seenIds = new Set<string>();
  const seenOrders = new Set<number>();
  for (const item of items) {
    if (seenIds.has(item.id)) {
      throw new HierarchyServiceError(`ID ${label} tidak boleh duplikat`, 400);
    }
    seenIds.add(item.id);
    if (seenOrders.has(item.sortOrder)) {
      throw new HierarchyServiceError('Nilai sortOrder tidak boleh duplikat', 400);
    }
    seenOrders.add(item.sortOrder);
    if (!siblingMap.has(item.id)) {
      throw new HierarchyServiceError(
        `Satu atau lebih ${label} bukan bagian dari induk yang dituju`,
        400,
      );
    }
  }
  if (seenIds.size !== siblings.length) {
    throw new HierarchyServiceError(
      `Daftar urutan harus mencakup seluruh ${label} (${siblings.length} item)`,
      400,
    );
  }

  const changes = items
    .filter((item) => siblingMap.get(item.id)!.sortOrder !== item.sortOrder)
    .map((item) => ({ ...item, from: siblingMap.get(item.id)!.sortOrder }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return { changes };
}

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
}

export function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2003';
}

export function isRecordNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2025';
}
