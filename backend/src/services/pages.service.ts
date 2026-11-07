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
  HierarchyServiceError,
  MAX_SORT_ORDER,
  RESERVED_SLUGS,
  hasControlCharacters,
  STALE_WRITE_CODE,
  assertFresh,
  expectedUpdatedAtSchema,
  parseOrThrow,
  titleSchema,
  assertPlainObject,
} from '../utils/hierarchyAuthoring.js';
import { executeLockedTransaction, withChangeResult } from '../utils/lockTransactionCache.js';
import {
  countSectionDependents,
  dependentsError,
  hasDependents,
} from './hierarchyDependencies.service.js';

export class PageServiceError extends HierarchyServiceError {
  constructor(
    message: string,
    statusCode: number,
    code?: string,
    details?: Record<string, unknown>,
  ) {
    super(message, statusCode, code, details);
    this.name = 'PageServiceError';
  }
}

export const PAGE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_PAGE_SLUG_LENGTH = 100;

export function isValidPageSlug(raw: unknown): raw is string {
  if (typeof raw !== 'string') {
    return false;
  }
  return (
    raw.length > 0 &&
    raw.length <= MAX_PAGE_SLUG_LENGTH &&
    PAGE_SLUG_PATTERN.test(raw) &&
    !raw.includes('\\') &&
    !/%5c/i.test(raw)
  );
}

export const RESERVED_PAGE_SLUGS = RESERVED_SLUGS;

function hasPrototypePollution(val: unknown, depth = 0): boolean {
  if (depth > 10) return true;
  if (!val || typeof val !== 'object') return false;

  if (Object.prototype.hasOwnProperty.call(val, '__proto__')) return true;

  const proto = Object.getPrototypeOf(val);
  if (Array.isArray(val)) {
    if (proto !== Array.prototype && proto !== null) return true;
    for (const item of val) {
      if (hasPrototypePollution(item, depth + 1)) return true;
    }
    return false;
  }

  if (proto !== Object.prototype && proto !== null) {
    return true;
  }

  const keys = Object.getOwnPropertyNames(val);
  for (const key of keys) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return true;
    if (hasPrototypePollution((val as Record<string, unknown>)[key], depth + 1)) return true;
  }
  return false;
}

// Kept local on purpose: unlike slugifyTitle it does not strip diacritics (NFKD), and page slugs
// derived from titles must stay byte-identical to the ones already published.
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// sort_order isn't unique; ties break deterministically on createdAt (creation order), then id.
const SORT_ORDER = [
  { sortOrder: 'asc' as const },
  { createdAt: 'asc' as const },
  { id: 'asc' as const },
];

export interface SectionDTO {
  id: string;
  slug: string;
  title: string | null;
  sortOrder: number;
  /** Optimistic-concurrency token for section edits/deletes and block reorders (SPEC §3). */
  updatedAt: string;
}

export interface ChapterDTO {
  id: string;
  slug: string;
  number: string | null;
  title: string;
  sortOrder: number;
  /** Optimistic-concurrency token for chapter edits/deletes and section reorders (SPEC §3). */
  updatedAt: string;
  sections: SectionDTO[];
}

export interface PageSummaryDTO {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
  chapterCount: number;
}

export interface PageWithChapterCount {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
  _count: {
    chapters: number;
  };
}

export const toPageSummary = (page: PageWithChapterCount): PageSummaryDTO => ({
  id: page.id,
  slug: page.slug,
  title: page.title,
  sortOrder: page.sortOrder,
  chapterCount: page._count.chapters,
});

export interface PageDetailDTO {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
  chapters: ChapterDTO[];
  createdAt: string;
  updatedAt: string;
}

interface PageRowWithChapters {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  chapters: Array<{
    id: string;
    slug: string;
    number: string | null;
    title: string;
    sortOrder: number;
    updatedAt: Date;
    sections: Array<{
      id: string;
      slug: string;
      title: string | null;
      sortOrder: number;
      updatedAt: Date;
    }>;
  }>;
}

const toPageDetail = (page: PageRowWithChapters): PageDetailDTO => ({
  id: page.id,
  slug: page.slug,
  title: page.title,
  sortOrder: page.sortOrder,
  chapters: page.chapters.map((chapter) => ({
    id: chapter.id,
    slug: chapter.slug,
    number: chapter.number,
    title: chapter.title,
    sortOrder: chapter.sortOrder,
    updatedAt: chapter.updatedAt.toISOString(),
    sections: chapter.sections.map((section) => ({
      id: section.id,
      slug: section.slug,
      title: section.title,
      sortOrder: section.sortOrder,
      updatedAt: section.updatedAt.toISOString(),
    })),
  })),
  createdAt: page.createdAt.toISOString(),
  updatedAt: page.updatedAt.toISOString(),
});

export const getPages = async (): Promise<PageSummaryDTO[]> => {
  const pages = await prisma.page.findMany({
    orderBy: SORT_ORDER,
    include: { _count: { select: { chapters: true } } },
  });

  return pages.map(toPageSummary);
};

/**
 * The whole page → chapter → section tree in one query, for callers that need every section
 * label at once (the CMS hierarchy). Same DTO shape as `getPageBySlug`, so a caller can cache
 * each entry and serve a later per-slug read from it.
 */
export const getPagesWithSections = async (): Promise<PageDetailDTO[]> => {
  const pages = await prisma.page.findMany({
    orderBy: SORT_ORDER,
    include: {
      chapters: {
        orderBy: SORT_ORDER,
        include: { sections: { orderBy: SORT_ORDER } },
      },
    },
  });

  return pages.map(toPageDetail);
};

export const getPageBySlug = async (slug: string): Promise<PageDetailDTO | null> => {
  const page = await prisma.page.findUnique({
    where: { slug },
    include: {
      chapters: {
        orderBy: SORT_ORDER,
        include: { sections: { orderBy: SORT_ORDER } },
      },
    },
  });

  if (!page) {
    return null;
  }

  return toPageDetail(page);
};

export const createPage = async (
  rawInput: unknown,
  actor: AuditActor,
  reqContext?: AuditRequestContext,
  client = prisma,
): Promise<PageSummaryDTO> => {
  if (hasPrototypePollution(rawInput)) {
    throw new PageServiceError('Payload tidak valid', 400);
  }

  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    throw new PageServiceError('Payload halaman harus berupa objek', 400);
  }

  const input = rawInput as Record<string, unknown>;

  if (typeof input.title !== 'string') {
    throw new PageServiceError('Judul halaman harus berupa string', 400);
  }
  const trimmedTitle = input.title.trim();
  if (!trimmedTitle) {
    throw new PageServiceError('Judul halaman tidak boleh kosong', 400);
  }
  if (trimmedTitle.length > 255) {
    throw new PageServiceError('Judul halaman maksimal 255 karakter', 400);
  }
  if (hasControlCharacters(trimmedTitle)) {
    throw new PageServiceError('Judul halaman mengandung karakter kontrol yang tidak valid', 400);
  }
  if (/<[a-z!/]/i.test(trimmedTitle)) {
    throw new PageServiceError('Judul halaman tidak boleh mengandung tag HTML', 400);
  }

  let slug: string;
  if (input.slug !== undefined && input.slug !== null) {
    if (typeof input.slug !== 'string') {
      throw new PageServiceError('Slug halaman harus berupa string', 400);
    }
    const rawSlug = input.slug.trim();
    if (!isValidPageSlug(rawSlug)) {
      throw new PageServiceError(
        'Format slug tidak valid. Gunakan format kebab-case (maksimal 100 karakter).',
        400,
      );
    }
    slug = rawSlug.toLowerCase();
    if (RESERVED_PAGE_SLUGS.has(slug)) {
      throw new PageServiceError(`Slug '${slug}' menggunakan kata kunci terproteksi`, 400);
    }
  } else {
    slug = slugify(trimmedTitle);
    if (!isValidPageSlug(slug)) {
      throw new PageServiceError(
        'Gagal membuat slug otomatis dari judul halaman. Harap tentukan slug secara manual.',
        400,
      );
    }
    if (RESERVED_PAGE_SLUGS.has(slug)) {
      throw new PageServiceError(`Slug '${slug}' menggunakan kata kunci terproteksi`, 400);
    }
  }

  let sortOrder: number | undefined;
  if (input.sortOrder !== undefined && input.sortOrder !== null) {
    if (
      typeof input.sortOrder !== 'number' ||
      !Number.isInteger(input.sortOrder) ||
      input.sortOrder < 0 ||
      input.sortOrder > MAX_SORT_ORDER
    ) {
      throw new PageServiceError(
        'Urutan (sortOrder) harus berupa bilangan bulat antara 0 dan 2147483647',
        400,
      );
    }
    sortOrder = input.sortOrder;
  }

  const existing = await client.page.findUnique({
    where: { slug },
  });
  if (existing) {
    throw new PageServiceError(`Slug halaman '${slug}' sudah digunakan`, 409);
  }

  try {
    return await client.$transaction(async (tx) => {
      let finalSortOrder = sortOrder;
      if (finalSortOrder === undefined) {
        const agg = await tx.page.aggregate({
          _max: { sortOrder: true },
        });
        if (agg._max.sortOrder !== null && agg._max.sortOrder >= MAX_SORT_ORDER) {
          throw new PageServiceError(
            'Urutan halaman telah mencapai batas maksimum (2147483647)',
            400,
          );
        }
        finalSortOrder = agg._max.sortOrder !== null ? agg._max.sortOrder + 1 : 0;
      }

      const createdPage = await tx.page.create({
        data: {
          title: trimmedTitle,
          slug,
          sortOrder: finalSortOrder,
        },
      });

      await buildAuditLog(
        {
          action: AUDIT_ACTIONS.PAGE_CREATED,
          actor,
          target: {
            type: 'page',
            id: createdPage.id,
            label: createdPage.title,
          },
          metadata: {
            slug: createdPage.slug,
            title: createdPage.title,
            sortOrder: createdPage.sortOrder,
          },
          context: reqContext,
        },
        tx,
      );

      return {
        id: createdPage.id,
        slug: createdPage.slug,
        title: createdPage.title,
        sortOrder: createdPage.sortOrder,
        chapterCount: 0,
      };
    });
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'P2002') {
      throw new PageServiceError(`Slug halaman '${slug}' sudah digunakan`, 409);
    }
    throw err;
  }
};

export interface PageAuthoringDTO extends PageSummaryDTO {
  /** Optimistic-concurrency token for the next page edit/delete or chapter reorder. */
  updatedAt: string;
}

const toPageAuthoring = (page: PageWithChapterCount & { updatedAt: Date }): PageAuthoringDTO => ({
  ...toPageSummary(page),
  updatedAt: page.updatedAt.toISOString(),
});

export const updatePageSchema = z
  .object({
    title: titleSchema('Judul halaman'),
    expectedUpdatedAt: expectedUpdatedAtSchema,
  })
  .strict();

/**
 * Renames a page. The slug is deliberately immutable so shared links keep working; the page
 * has no description column, so `title` is the only editable field.
 */
export const updatePage = async (
  rawSlug: string,
  rawInput: unknown,
  actor: AuditActor,
  reqContext?: AuditRequestContext,
  client = prisma,
): Promise<PageAuthoringDTO> => {
  if (!isValidPageSlug(rawSlug)) {
    throw new PageServiceError(
      'Slug halaman tidak valid. Gunakan format kebab-case (maksimal 100 karakter).',
      400,
    );
  }
  assertPlainObject(rawInput, 'Payload halaman harus berupa objek JSON');
  const input = parseOrThrow(updatePageSchema, rawInput);
  const slug = rawSlug.trim().toLowerCase();

  return executeLockedTransaction({
    client,
    lockQuery: Prisma.sql`SELECT id FROM pages WHERE slug = ${slug} FOR UPDATE`,
    execute: async (tx) => {
      const existing = await tx.page.findUnique({
        where: { slug },
        include: { _count: { select: { chapters: true } } },
      });
      if (!existing) {
        throw new PageServiceError('Halaman tidak ditemukan', 404);
      }
      assertFresh(existing.updatedAt, input.expectedUpdatedAt, 'Halaman');

      if (existing.title === input.title) {
        return withChangeResult(toPageAuthoring(existing), false);
      }

      const updated = await tx.page.update({
        where: { id: existing.id },
        data: { title: input.title },
        include: { _count: { select: { chapters: true } } },
      });

      await buildAuditLog(
        {
          action: AUDIT_ACTIONS.PAGE_UPDATED,
          actor,
          target: { type: 'page', id: existing.id, label: input.title },
          metadata: {
            slug: existing.slug,
            changes: { title: { before: existing.title, after: input.title } },
          },
          context: reqContext,
        },
        tx,
      );

      return toPageAuthoring(updated);
    },
  });
};

export interface DeletedPageDTO {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
}

export const deletePage = async (
  rawSlug: string,
  actor: AuditActor,
  reqContext: AuditRequestContext | undefined,
  client = prisma,
  options: { expectedUpdatedAt: string },
): Promise<DeletedPageDTO> => {
  if (!isValidPageSlug(rawSlug)) {
    throw new PageServiceError(
      'Slug halaman tidak valid. Gunakan format kebab-case (maksimal 100 karakter).',
      400,
    );
  }

  const slug = rawSlug.trim().toLowerCase();

  const existingPage = await client.page.findUnique({
    where: { slug },
    include: {
      chapters: {
        select: {
          slug: true,
          _count: { select: { sections: true } },
        },
      },
    },
  });
  if (!existingPage) {
    throw new PageServiceError('Halaman tidak ditemukan', 404);
  }

  assertFresh(existingPage.updatedAt, options.expectedUpdatedAt, 'Halaman');

  const dependents = await countSectionDependents(client, { pageId: existingPage.id });
  if (hasDependents(dependents)) {
    throw dependentsError('Halaman', dependents);
  }

  const chapters =
    (
      existingPage as {
        chapters?: Array<{
          slug: string;
          _count?: { sections?: number };
          sections?: unknown[];
        }>;
      }
    ).chapters ?? [];
  const chapterCount = chapters.length;
  const sectionCount = chapters.reduce(
    (sum, ch) =>
      sum + (ch._count?.sections ?? (Array.isArray(ch.sections) ? ch.sections.length : 0)),
    0,
  );
  const chapterSlugs = chapters.map((ch) => ch.slug);

  try {
    return await client.$transaction(async (tx) => {
      // The delete is a compare-and-swap on updatedAt (P2025 = lost the race).
      const deleted = await tx.page.delete({
        where: { id: existingPage.id, updatedAt: existingPage.updatedAt },
      });

      await buildAuditLog(
        {
          action: AUDIT_ACTIONS.PAGE_DELETED,
          actor,
          target: {
            type: 'page',
            id: deleted.id,
            label: deleted.title,
          },
          metadata: {
            slug: deleted.slug,
            title: deleted.title,
            sortOrder: deleted.sortOrder,
            chapterCount,
            sectionCount,
            chapterSlugs,
          },
          context: reqContext,
        },
        tx,
      );

      return {
        id: deleted.id,
        slug: deleted.slug,
        title: deleted.title,
        sortOrder: deleted.sortOrder,
      };
    });
  } catch (err) {
    if (err instanceof Error && 'code' in err) {
      if (err.code === 'P2003') {
        throw new PageServiceError(
          'Halaman tidak dapat dihapus karena masih memiliki data terkait (blok konten)',
          409,
        );
      }
      if (err.code === 'P2025') {
        throw new PageServiceError(
          'Halaman telah diubah oleh pengguna lain. Muat ulang data lalu coba lagi.',
          409,
          STALE_WRITE_CODE,
        );
      }
    }
    throw err;
  }
};

export interface ReorderPageItemDTO {
  id: string;
  sortOrder: number;
}

export const reorderPages = async (
  rawInput: unknown,
  actor: AuditActor,
  reqContext?: AuditRequestContext,
  client = prisma,
): Promise<PageSummaryDTO[]> => {
  if (hasPrototypePollution(rawInput)) {
    throw new PageServiceError('Payload tidak valid', 400);
  }

  let items: unknown[];
  if (Array.isArray(rawInput)) {
    items = rawInput;
  } else if (
    rawInput &&
    typeof rawInput === 'object' &&
    'items' in rawInput &&
    Array.isArray((rawInput as { items: unknown }).items)
  ) {
    items = (rawInput as { items: unknown[] }).items;
  } else {
    throw new PageServiceError(
      'Payload reorder harus berupa array atau objek dengan properti items',
      400,
    );
  }

  if (items.length === 0) {
    throw new PageServiceError('Daftar urutan halaman tidak boleh kosong', 400);
  }

  const validatedItems: ReorderPageItemDTO[] = [];
  const seenIds = new Set<string>();
  const seenSortOrders = new Set<number>();

  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new PageServiceError('Setiap item urutan halaman harus berupa objek', 400);
    }
    const itemObj = item as Record<string, unknown>;
    if (typeof itemObj.id !== 'string') {
      throw new PageServiceError('ID halaman harus berupa string', 400);
    }
    const trimmedId = itemObj.id.trim();
    if (!trimmedId) {
      throw new PageServiceError('ID halaman tidak boleh kosong', 400);
    }

    if (
      typeof itemObj.sortOrder !== 'number' ||
      !Number.isInteger(itemObj.sortOrder) ||
      itemObj.sortOrder < 0 ||
      itemObj.sortOrder > MAX_SORT_ORDER
    ) {
      throw new PageServiceError(
        'Urutan (sortOrder) harus berupa bilangan bulat antara 0 dan 2147483647',
        400,
      );
    }

    if (seenIds.has(trimmedId)) {
      throw new PageServiceError('ID halaman tidak boleh duplikat', 400);
    }
    seenIds.add(trimmedId);

    if (seenSortOrders.has(itemObj.sortOrder)) {
      throw new PageServiceError('Nilai sortOrder tidak boleh duplikat', 400);
    }
    seenSortOrders.add(itemObj.sortOrder);

    validatedItems.push({
      id: trimmedId,
      sortOrder: itemObj.sortOrder,
    });
  }

  const existingPages = await client.page.findMany({
    orderBy: SORT_ORDER,
    include: { _count: { select: { chapters: true } } },
  });

  const existingMap = new Map(existingPages.map((p) => [p.id, p]));

  for (const id of seenIds) {
    if (!existingMap.has(id)) {
      throw new PageServiceError('Satu atau lebih halaman tidak ditemukan', 404);
    }
  }

  if (seenIds.size !== existingPages.length) {
    throw new PageServiceError(
      `Daftar urutan halaman harus mencakup seluruh halaman (${existingPages.length} halaman)`,
      400,
    );
  }

  // Find items whose sortOrder actually changed
  const changedItems = validatedItems.filter(
    (item) => existingMap.get(item.id)!.sortOrder !== item.sortOrder,
  );

  // No-op detection: if none of the sortOrder values changed, return current list without DB writes or audit log
  if (changedItems.length === 0) {
    return existingPages.map(toPageSummary);
  }

  // Deterministic lock acquisition order: sort changed items by ID ascending to prevent InnoDB deadlocks (errno 1213)
  const sortedChanges = [...changedItems].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  try {
    return await client.$transaction(async (tx) => {
      // Re-verify completeness inside the transaction to catch concurrent additions or deletions (Anti-TOCTOU)
      if (tx.page && typeof tx.page.count === 'function') {
        const currentCount = await tx.page.count();
        if (currentCount !== seenIds.size) {
          throw new PageServiceError(
            'Urutan halaman gagal diperbarui karena terdapat perubahan data bersamaan. Silakan muat ulang halaman.',
            409,
          );
        }
      }

      for (const item of sortedChanges) {
        await tx.page.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        });
      }

      await buildAuditLog(
        {
          action: AUDIT_ACTIONS.PAGE_REORDERED,
          actor,
          target: {
            type: 'page',
            label: 'Cerita Pages',
          },
          metadata: {
            changes: sortedChanges.map((it) => ({
              id: it.id,
              slug: existingMap.get(it.id)!.slug,
              from: existingMap.get(it.id)!.sortOrder,
              to: it.sortOrder,
            })),
          },
          context: reqContext,
        },
        tx,
      );

      const pages = await tx.page.findMany({
        orderBy: SORT_ORDER,
        include: { _count: { select: { chapters: true } } },
      });

      return pages.map(toPageSummary);
    });
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'P2025') {
      throw new PageServiceError(
        'Terjadi konflik saat memperbarui urutan halaman karena perubahan data bersamaan. Silakan muat ulang halaman.',
        409,
      );
    }
    throw err;
  }
};
