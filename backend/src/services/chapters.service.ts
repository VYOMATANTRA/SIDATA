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
  assertFresh,
  assertPlainObject,
  baseSlugFromTitle,
  expectedUpdatedAtSchema,
  idParamSchema,
  isForeignKeyViolation,
  parseOrThrow,
  planReorder,
  reorderBodySchema,
  resolveUniqueSlug,
  titleSchema,
} from '../utils/hierarchyAuthoring.js';
import { executeLockedTransaction, withChangeResult } from '../utils/lockTransactionCache.js';
import {
  countSectionDependents,
  dependentsError,
  hasDependents,
} from './hierarchyDependencies.service.js';
import { isValidPageSlug } from './pages.service.js';
import { invalidateHierarchyDependentCaches } from './hierarchyCaches.js';

/** A chapter without its sections — what the authoring endpoints return. */
export interface ChapterRecordDTO {
  id: string;
  pageId: string;
  slug: string;
  number: string | null;
  title: string;
  sortOrder: number;
  updatedAt: string;
}

/** The parent's fresh concurrency token, so the client can chain the next write. */
export interface ParentTokenDTO {
  id: string;
  slug: string;
  updatedAt: string;
}

export interface ChapterWriteResult {
  chapter: ChapterRecordDTO;
  page: ParentTokenDTO;
}

export interface DeletedChapterDTO extends ChapterWriteResult {
  sectionCount: number;
}

export interface ChapterReorderResult {
  chapters: ChapterRecordDTO[];
  page: ParentTokenDTO;
}

interface ChapterRow {
  id: string;
  pageId: string;
  slug: string;
  number: string | null;
  title: string;
  sortOrder: number;
  updatedAt: Date;
}

const toChapterRecord = (c: ChapterRow): ChapterRecordDTO => ({
  id: c.id,
  pageId: c.pageId,
  slug: c.slug,
  number: c.number,
  title: c.title,
  sortOrder: c.sortOrder,
  updatedAt: c.updatedAt.toISOString(),
});

const toPageToken = (p: { id: string; slug: string; updatedAt: Date }): ParentTokenDTO => ({
  id: p.id,
  slug: p.slug,
  updatedAt: p.updatedAt.toISOString(),
});

const SORT_ORDER = [
  { sortOrder: 'asc' as const },
  { createdAt: 'asc' as const },
  { id: 'asc' as const },
];

export const createChapterSchema = z.object({ title: titleSchema('Judul bab') }).strict();

export const updateChapterSchema = z
  .object({ title: titleSchema('Judul bab'), expectedUpdatedAt: expectedUpdatedAtSchema })
  .strict();

function parseId(raw: unknown): string {
  return parseOrThrow(idParamSchema, raw);
}

export const createChapter = async (
  rawPageSlug: string,
  rawInput: unknown,
  actor: AuditActor,
  reqContext?: AuditRequestContext,
  client = prisma,
): Promise<ChapterWriteResult> => {
  if (!isValidPageSlug(rawPageSlug)) {
    throw new HierarchyServiceError('Slug halaman tidak valid', 400);
  }
  assertPlainObject(rawInput, 'Payload bab harus berupa objek JSON');
  const input = parseOrThrow(createChapterSchema, rawInput);
  const pageSlug = rawPageSlug.trim().toLowerCase();
  const baseSlug = baseSlugFromTitle(input.title, 'bab');

  return executeLockedTransaction({
    client,
    // The page row lock serializes slug resolution and max(sort_order)+1 for this page.
    lockQuery: Prisma.sql`SELECT id FROM pages WHERE slug = ${pageSlug} FOR UPDATE`,
    execute: async (tx) => {
      const page = await tx.page.findUnique({
        where: { slug: pageSlug },
        select: { id: true, slug: true, title: true },
      });
      if (!page) {
        throw new HierarchyServiceError('Halaman tidak ditemukan', 404);
      }

      const siblings = await tx.chapter.findMany({
        where: { pageId: page.id },
        select: { slug: true, sortOrder: true },
      });
      const slug = resolveUniqueSlug(baseSlug, new Set(siblings.map((s) => s.slug)));
      const maxOrder = siblings.reduce((m, s) => Math.max(m, s.sortOrder), -1);
      if (maxOrder >= MAX_SORT_ORDER) {
        throw new HierarchyServiceError('Urutan bab telah mencapai batas maksimum', 400);
      }

      const created = await tx.chapter.create({
        data: { pageId: page.id, slug, title: input.title, sortOrder: maxOrder + 1 },
      });
      const touched = await tx.page.update({
        where: { id: page.id },
        data: { updatedAt: new Date() },
        select: { id: true, slug: true, updatedAt: true },
      });

      await buildAuditLog(
        {
          action: AUDIT_ACTIONS.CHAPTER_CREATED,
          actor,
          target: { type: 'chapter', id: created.id, label: created.title },
          metadata: {
            pageId: page.id,
            pageSlug: page.slug,
            slug: created.slug,
            title: created.title,
            sortOrder: created.sortOrder,
          },
          context: reqContext,
        },
        tx,
      );

      return { chapter: toChapterRecord(created), page: toPageToken(touched) };
    },
  });
};

export const updateChapter = async (
  rawId: string,
  rawInput: unknown,
  actor: AuditActor,
  reqContext?: AuditRequestContext,
  client = prisma,
): Promise<ChapterRecordDTO> => {
  const id = parseId(rawId);
  assertPlainObject(rawInput, 'Payload bab harus berupa objek JSON');
  const input = parseOrThrow(updateChapterSchema, rawInput);

  return executeLockedTransaction({
    client,
    lockQuery: Prisma.sql`SELECT id FROM chapters WHERE id = ${id} FOR UPDATE`,
    execute: async (tx) => {
      const existing = await tx.chapter.findUnique({ where: { id } });
      if (!existing) {
        throw new HierarchyServiceError('Bab tidak ditemukan', 404);
      }
      assertFresh(existing.updatedAt, input.expectedUpdatedAt, 'Bab');

      if (existing.title === input.title) {
        return withChangeResult(toChapterRecord(existing), false);
      }

      const updated = await tx.chapter.update({
        where: { id },
        data: { title: input.title },
      });

      await buildAuditLog(
        {
          action: AUDIT_ACTIONS.CHAPTER_UPDATED,
          actor,
          target: { type: 'chapter', id, label: updated.title },
          metadata: {
            pageId: existing.pageId,
            slug: existing.slug,
            changes: { title: { before: existing.title, after: updated.title } },
          },
          context: reqContext,
        },
        tx,
      );

      return toChapterRecord(updated);
    },
  });
};

export const deleteChapter = async (
  rawId: string,
  rawExpectedUpdatedAt: unknown,
  actor: AuditActor,
  reqContext?: AuditRequestContext,
  client = prisma,
): Promise<DeletedChapterDTO> => {
  const id = parseId(rawId);
  const expectedUpdatedAt = parseOrThrow(expectedUpdatedAtSchema, rawExpectedUpdatedAt);

  const run = () =>
    executeLockedTransaction({
      client,
      // Lock order is always page → chapter, matching create/reorder, so no inversion deadlocks.
      lockQuery: async (tx) => {
        const rows = await tx.$queryRaw<Array<{ page_id: string }>>(
          Prisma.sql`SELECT page_id FROM chapters WHERE id = ${id}`,
        );
        const pageId = rows[0]?.page_id;
        if (!pageId) return;
        await tx.$queryRaw(Prisma.sql`SELECT id FROM pages WHERE id = ${pageId} FOR UPDATE`);
        await tx.$queryRaw(Prisma.sql`SELECT id FROM chapters WHERE id = ${id} FOR UPDATE`);
      },
      cache: [{ invalidate: invalidateHierarchyDependentCaches }],
      execute: async (tx) => {
        const existing = await tx.chapter.findUnique({
          where: { id },
          include: { _count: { select: { sections: true } } },
        });
        if (!existing) {
          throw new HierarchyServiceError('Bab tidak ditemukan', 404);
        }
        assertFresh(existing.updatedAt, expectedUpdatedAt, 'Bab');

        const counts = await countSectionDependents(tx, { chapterId: id });
        if (hasDependents(counts)) {
          throw dependentsError('Bab', counts);
        }

        // Only empty sections can remain at this point, so the DB cascade removes nothing real.
        await tx.chapter.delete({ where: { id } });
        const touched = await tx.page.update({
          where: { id: existing.pageId },
          data: { updatedAt: new Date() },
          select: { id: true, slug: true, updatedAt: true },
        });

        const sectionCount = existing._count.sections;
        await buildAuditLog(
          {
            action: AUDIT_ACTIONS.CHAPTER_DELETED,
            actor,
            target: { type: 'chapter', id, label: existing.title },
            metadata: {
              pageId: existing.pageId,
              pageSlug: touched.slug,
              slug: existing.slug,
              title: existing.title,
              sortOrder: existing.sortOrder,
              sectionCount,
            },
            context: reqContext,
          },
          tx,
        );

        return {
          chapter: toChapterRecord(existing),
          page: toPageToken(touched),
          sectionCount,
        };
      },
    });

  try {
    return await run();
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      // A dependent row appeared between the count and the delete; report it like the pre-check.
      const counts = await countSectionDependents(client, { chapterId: id });
      throw dependentsError('Bab', counts);
    }
    throw err;
  }
};

export const reorderChapters = async (
  rawPageSlug: string,
  rawInput: unknown,
  actor: AuditActor,
  reqContext?: AuditRequestContext,
  client = prisma,
): Promise<ChapterReorderResult> => {
  if (!isValidPageSlug(rawPageSlug)) {
    throw new HierarchyServiceError('Slug halaman tidak valid', 400);
  }
  assertPlainObject(rawInput, 'Payload urutan bab harus berupa objek JSON');
  const input = parseOrThrow(reorderBodySchema, rawInput);
  const pageSlug = rawPageSlug.trim().toLowerCase();

  return executeLockedTransaction({
    client,
    lockQuery: async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM pages WHERE slug = ${pageSlug} FOR UPDATE`,
      );
      const pageId = rows[0]?.id;
      if (!pageId) return;
      // Children are locked in ascending id order, the same order the writes below use.
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM chapters WHERE page_id = ${pageId} ORDER BY id FOR UPDATE`,
      );
    },
    execute: async (tx) => {
      const page = await tx.page.findUnique({
        where: { slug: pageSlug },
        select: { id: true, slug: true, title: true, updatedAt: true },
      });
      if (!page) {
        throw new HierarchyServiceError('Halaman tidak ditemukan', 404);
      }
      assertFresh(page.updatedAt, input.expectedUpdatedAt, 'Daftar bab');

      const chapters = await tx.chapter.findMany({
        where: { pageId: page.id },
        orderBy: SORT_ORDER,
      });
      const plan = planReorder(input.items, chapters, 'bab');

      // No-op reorder: nothing written, nothing audited, parent token unchanged.
      if (plan.changes.length === 0) {
        return withChangeResult(
          { chapters: chapters.map(toChapterRecord), page: toPageToken(page) },
          false,
        );
      }

      const slugById = new Map(chapters.map((c) => [c.id, c.slug]));
      for (const change of plan.changes) {
        await tx.chapter.update({
          where: { id: change.id },
          data: { sortOrder: change.sortOrder },
        });
      }
      const touched = await tx.page.update({
        where: { id: page.id },
        data: { updatedAt: new Date() },
        select: { id: true, slug: true, updatedAt: true },
      });

      await buildAuditLog(
        {
          action: AUDIT_ACTIONS.CHAPTER_REORDERED,
          actor,
          target: { type: 'page', id: page.id, label: page.title },
          metadata: {
            pageId: page.id,
            pageSlug: page.slug,
            changes: plan.changes.map((c) => ({
              id: c.id,
              slug: slugById.get(c.id) ?? null,
              from: c.from,
              to: c.sortOrder,
            })),
          },
          context: reqContext,
        },
        tx,
      );

      const fresh = await tx.chapter.findMany({
        where: { pageId: page.id },
        orderBy: SORT_ORDER,
      });
      return { chapters: fresh.map(toChapterRecord), page: toPageToken(touched) };
    },
  });
};
