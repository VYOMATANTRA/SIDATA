import prisma from '../utils/prisma.js';
import {
  buildAuditLog,
  AUDIT_ACTIONS,
  type AuditActor,
  type AuditRequestContext,
} from './audit.service.js';

export class PageServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'PageServiceError';
    this.statusCode = statusCode;
  }
}

export const PAGE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const RESERVED_PAGE_SLUGS = new Set([
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
export const MAX_PAGE_SORT_ORDER = 2_147_483_647;

function hasControlCharacters(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if ((code >= 0 && code <= 31) || code === 127) {
      return true;
    }
  }
  return false;
}

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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// sort_order isn't unique, so ties break on id to keep sibling order stable between requests.
const SORT_ORDER = [{ sortOrder: 'asc' as const }, { id: 'asc' as const }];

export interface SectionDTO {
  id: string;
  slug: string;
  title: string | null;
  sortOrder: number;
}

export interface ChapterDTO {
  id: string;
  slug: string;
  number: string | null;
  title: string;
  sortOrder: number;
  sections: SectionDTO[];
}

export interface PageSummaryDTO {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
  chapterCount: number;
}

export interface PageDetailDTO {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
  chapters: ChapterDTO[];
  createdAt: string;
  updatedAt: string;
}

export const getPages = async (): Promise<PageSummaryDTO[]> => {
  const pages = await prisma.page.findMany({
    orderBy: SORT_ORDER,
    include: { _count: { select: { chapters: true } } },
  });

  return pages.map((page) => ({
    id: page.id,
    slug: page.slug,
    title: page.title,
    sortOrder: page.sortOrder,
    chapterCount: page._count.chapters,
  }));
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

  return {
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
      sections: chapter.sections.map((section) => ({
        id: section.id,
        slug: section.slug,
        title: section.title,
        sortOrder: section.sortOrder,
      })),
    })),
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
  };
};

export const createPage = async (
  rawInput: unknown,
  actor: AuditActor,
  reqContext: AuditRequestContext,
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
  if (
    /<[a-z][\s\S]*>/i.test(trimmedTitle) ||
    trimmedTitle.includes('<') ||
    trimmedTitle.includes('>')
  ) {
    throw new PageServiceError('Judul halaman tidak boleh mengandung tag HTML', 400);
  }

  let slug: string;
  if (input.slug !== undefined && input.slug !== null) {
    if (typeof input.slug !== 'string') {
      throw new PageServiceError('Slug halaman harus berupa string', 400);
    }
    const rawSlug = input.slug.trim();
    if (
      !PAGE_SLUG_PATTERN.test(rawSlug) ||
      rawSlug.length > 100 ||
      rawSlug.includes('\\') ||
      /%5c/i.test(rawSlug)
    ) {
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
    if (!PAGE_SLUG_PATTERN.test(slug) || slug.length > 100) {
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
      input.sortOrder > MAX_PAGE_SORT_ORDER
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

export interface DeletedPageDTO {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
}

export const deletePage = async (
  rawSlug: string,
  actor: AuditActor,
  reqContext: AuditRequestContext,
  client = prisma,
): Promise<DeletedPageDTO> => {
  if (
    typeof rawSlug !== 'string' ||
    !PAGE_SLUG_PATTERN.test(rawSlug) ||
    rawSlug.length > 100 ||
    rawSlug.includes('\\') ||
    /%5c/i.test(rawSlug)
  ) {
    throw new PageServiceError(
      'Slug halaman tidak valid. Gunakan format kebab-case (maksimal 100 karakter).',
      400,
    );
  }

  const slug = rawSlug.trim().toLowerCase();

  const existingPage = await client.page.findUnique({
    where: { slug },
  });
  if (!existingPage) {
    throw new PageServiceError('Halaman tidak ditemukan', 404);
  }

  const attachedBlocksCount = await client.contentBlock.count({
    where: {
      section: {
        chapter: {
          pageId: existingPage.id,
        },
      },
    },
  });
  if (attachedBlocksCount > 0) {
    throw new PageServiceError(
      'Halaman tidak dapat dihapus karena masih memiliki data terkait (blok konten)',
      409,
    );
  }

  try {
    return await client.$transaction(async (tx) => {
      const deleted = await tx.page.delete({
        where: { id: existingPage.id },
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
        throw new PageServiceError('Halaman tidak ditemukan', 404);
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
  reqContext: AuditRequestContext,
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
      itemObj.sortOrder > MAX_PAGE_SORT_ORDER
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
    where: { id: { in: Array.from(seenIds) } },
  });

  if (existingPages.length !== seenIds.size) {
    throw new PageServiceError('Satu atau lebih halaman tidak ditemukan', 404);
  }

  const totalPagesCount = await client.page.count();
  if (seenIds.size !== totalPagesCount) {
    throw new PageServiceError(
      `Daftar urutan halaman harus mencakup seluruh halaman (${totalPagesCount} halaman)`,
      400,
    );
  }

  const existingMap = new Map(existingPages.map((p) => [p.id, p]));

  // Find items whose sortOrder actually changed
  const changedItems = validatedItems.filter(
    (item) => existingMap.get(item.id)!.sortOrder !== item.sortOrder,
  );

  // No-op detection: if none of the sortOrder values changed, return current list without DB writes or audit log
  if (changedItems.length === 0) {
    const pages = await client.page.findMany({
      orderBy: SORT_ORDER,
      include: { _count: { select: { chapters: true } } },
    });
    return pages.map((page) => ({
      id: page.id,
      slug: page.slug,
      title: page.title,
      sortOrder: page.sortOrder,
      chapterCount: page._count.chapters,
    }));
  }

  // Deterministic lock acquisition order: sort changed items by ID ascending to prevent InnoDB deadlocks (errno 1213)
  const sortedChanges = [...changedItems].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  try {
    return await client.$transaction(async (tx) => {
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
            items: validatedItems.map((it) => ({ id: it.id, sortOrder: it.sortOrder })),
          },
          context: reqContext,
        },
        tx,
      );

      const pages = await tx.page.findMany({
        orderBy: SORT_ORDER,
        include: { _count: { select: { chapters: true } } },
      });

      return pages.map((page) => ({
        id: page.id,
        slug: page.slug,
        title: page.title,
        sortOrder: page.sortOrder,
        chapterCount: page._count.chapters,
      }));
    });
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'P2025') {
      throw new PageServiceError('Satu atau lebih halaman tidak ditemukan', 404);
    }
    throw err;
  }
};
