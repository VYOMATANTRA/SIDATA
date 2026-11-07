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
import { invalidateHierarchyDependentCaches } from './hierarchyCaches.js';

/** A section as the authoring endpoints return it. */
export interface SectionRecordDTO {
  id: string;
  chapterId: string;
  slug: string;
  title: string | null;
  sortOrder: number;
  updatedAt: string;
}

/** The parent chapter's fresh concurrency token, so the client can chain the next write. */
export interface ChapterTokenDTO {
  id: string;
  slug: string;
  updatedAt: string;
}

export interface SectionWriteResult {
  section: SectionRecordDTO;
  chapter: ChapterTokenDTO;
}

export interface SectionReorderResult {
  sections: SectionRecordDTO[];
  chapter: ChapterTokenDTO;
}

interface SectionRow {
  id: string;
  chapterId: string;
  slug: string;
  title: string | null;
  sortOrder: number;
  updatedAt: Date;
}

const toSectionRecord = (s: SectionRow): SectionRecordDTO => ({
  id: s.id,
  chapterId: s.chapterId,
  slug: s.slug,
  title: s.title,
  sortOrder: s.sortOrder,
  updatedAt: s.updatedAt.toISOString(),
});

const toChapterToken = (c: { id: string; slug: string; updatedAt: Date }): ChapterTokenDTO => ({
  id: c.id,
  slug: c.slug,
  updatedAt: c.updatedAt.toISOString(),
});

const SORT_ORDER = [
  { sortOrder: 'asc' as const },
  { createdAt: 'asc' as const },
  { id: 'asc' as const },
];

export const createSectionSchema = z.object({ title: titleSchema('Judul bagian') }).strict();

export const updateSectionSchema = z
  .object({ title: titleSchema('Judul bagian'), expectedUpdatedAt: expectedUpdatedAtSchema })
  .strict();

function parseId(raw: unknown): string {
  return parseOrThrow(idParamSchema, raw);
}

export const createSection = async (
  rawChapterId: string,
  rawInput: unknown,
  actor: AuditActor,
  reqContext?: AuditRequestContext,
  client = prisma,
): Promise<SectionWriteResult> => {
  const chapterId = parseId(rawChapterId);
  assertPlainObject(rawInput, 'Payload bagian harus berupa objek JSON');
  const input = parseOrThrow(createSectionSchema, rawInput);
  const baseSlug = baseSlugFromTitle(input.title, 'bagian');

  return executeLockedTransaction({
    client,
    // The chapter row lock serializes slug resolution and max(sort_order)+1 for this chapter.
    lockQuery: Prisma.sql`SELECT id FROM chapters WHERE id = ${chapterId} FOR UPDATE`,
    execute: async (tx) => {
      const chapter = await tx.chapter.findUnique({
        where: { id: chapterId },
        select: { id: true, slug: true, pageId: true },
      });
      if (!chapter) {
        throw new HierarchyServiceError('Bab tidak ditemukan', 404);
      }

      const siblings = await tx.section.findMany({
        where: { chapterId },
        select: { slug: true, sortOrder: true },
      });
      const slug = resolveUniqueSlug(baseSlug, new Set(siblings.map((s) => s.slug)));
      const maxOrder = siblings.reduce((m, s) => Math.max(m, s.sortOrder), -1);
      if (maxOrder >= MAX_SORT_ORDER) {
        throw new HierarchyServiceError('Urutan bagian telah mencapai batas maksimum', 400);
      }

      const created = await tx.section.create({
        data: { chapterId, slug, title: input.title, sortOrder: maxOrder + 1 },
      });
      const touched = await tx.chapter.update({
        where: { id: chapterId },
        data: { updatedAt: new Date() },
        select: { id: true, slug: true, updatedAt: true },
      });

      await buildAuditLog(
        {
          action: AUDIT_ACTIONS.SECTION_CREATED,
          actor,
          target: { type: 'section', id: created.id, label: created.title },
          metadata: {
            chapterId,
            chapterSlug: chapter.slug,
            slug: created.slug,
            title: created.title,
            sortOrder: created.sortOrder,
          },
          context: reqContext,
        },
        tx,
      );

      return { section: toSectionRecord(created), chapter: toChapterToken(touched) };
    },
  });
};

export const updateSection = async (
  rawId: string,
  rawInput: unknown,
  actor: AuditActor,
  reqContext?: AuditRequestContext,
  client = prisma,
): Promise<SectionRecordDTO> => {
  const id = parseId(rawId);
  assertPlainObject(rawInput, 'Payload bagian harus berupa objek JSON');
  const input = parseOrThrow(updateSectionSchema, rawInput);

  return executeLockedTransaction({
    client,
    lockQuery: Prisma.sql`SELECT id FROM sections WHERE id = ${id} FOR UPDATE`,
    execute: async (tx) => {
      const existing = await tx.section.findUnique({ where: { id } });
      if (!existing) {
        throw new HierarchyServiceError('Bagian tidak ditemukan', 404);
      }
      assertFresh(existing.updatedAt, input.expectedUpdatedAt, 'Bagian');

      if (existing.title === input.title) {
        return withChangeResult(toSectionRecord(existing), false);
      }

      const updated = await tx.section.update({ where: { id }, data: { title: input.title } });

      await buildAuditLog(
        {
          action: AUDIT_ACTIONS.SECTION_UPDATED,
          actor,
          target: { type: 'section', id, label: updated.title },
          metadata: {
            chapterId: existing.chapterId,
            slug: existing.slug,
            changes: { title: { before: existing.title, after: updated.title } },
          },
          context: reqContext,
        },
        tx,
      );

      return toSectionRecord(updated);
    },
  });
};

export const deleteSection = async (
  rawId: string,
  rawExpectedUpdatedAt: unknown,
  actor: AuditActor,
  reqContext?: AuditRequestContext,
  client = prisma,
): Promise<SectionWriteResult> => {
  const id = parseId(rawId);
  const expectedUpdatedAt = parseOrThrow(expectedUpdatedAtSchema, rawExpectedUpdatedAt);

  const run = () =>
    executeLockedTransaction({
      client,
      // Lock order is always chapter → section, matching create/reorder.
      lockQuery: async (tx) => {
        const rows = await tx.$queryRaw<Array<{ chapter_id: string }>>(
          Prisma.sql`SELECT chapter_id FROM sections WHERE id = ${id}`,
        );
        const chapterId = rows[0]?.chapter_id;
        if (!chapterId) return;
        await tx.$queryRaw(Prisma.sql`SELECT id FROM chapters WHERE id = ${chapterId} FOR UPDATE`);
        await tx.$queryRaw(Prisma.sql`SELECT id FROM sections WHERE id = ${id} FOR UPDATE`);
      },
      cache: [{ invalidate: invalidateHierarchyDependentCaches }],
      execute: async (tx) => {
        const existing = await tx.section.findUnique({ where: { id } });
        if (!existing) {
          throw new HierarchyServiceError('Bagian tidak ditemukan', 404);
        }
        assertFresh(existing.updatedAt, expectedUpdatedAt, 'Bagian');

        const counts = await countSectionDependents(tx, { sectionId: id });
        if (hasDependents(counts)) {
          throw dependentsError('Bagian', counts);
        }

        await tx.section.delete({ where: { id } });
        const touched = await tx.chapter.update({
          where: { id: existing.chapterId },
          data: { updatedAt: new Date() },
          select: { id: true, slug: true, updatedAt: true },
        });

        await buildAuditLog(
          {
            action: AUDIT_ACTIONS.SECTION_DELETED,
            actor,
            target: { type: 'section', id, label: existing.title },
            metadata: {
              chapterId: existing.chapterId,
              chapterSlug: touched.slug,
              slug: existing.slug,
              title: existing.title,
              sortOrder: existing.sortOrder,
            },
            context: reqContext,
          },
          tx,
        );

        return { section: toSectionRecord(existing), chapter: toChapterToken(touched) };
      },
    });

  try {
    return await run();
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      const counts = await countSectionDependents(client, { sectionId: id });
      throw dependentsError('Bagian', counts);
    }
    throw err;
  }
};

export const reorderSections = async (
  rawChapterId: string,
  rawInput: unknown,
  actor: AuditActor,
  reqContext?: AuditRequestContext,
  client = prisma,
): Promise<SectionReorderResult> => {
  const chapterId = parseId(rawChapterId);
  assertPlainObject(rawInput, 'Payload urutan bagian harus berupa objek JSON');
  const input = parseOrThrow(reorderBodySchema, rawInput);

  return executeLockedTransaction({
    client,
    lockQuery: async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM chapters WHERE id = ${chapterId} FOR UPDATE`);
      // Children are locked in ascending id order, the same order the writes below use.
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM sections WHERE chapter_id = ${chapterId} ORDER BY id FOR UPDATE`,
      );
    },
    execute: async (tx) => {
      const chapter = await tx.chapter.findUnique({
        where: { id: chapterId },
        select: { id: true, slug: true, title: true, updatedAt: true },
      });
      if (!chapter) {
        throw new HierarchyServiceError('Bab tidak ditemukan', 404);
      }
      assertFresh(chapter.updatedAt, input.expectedUpdatedAt, 'Daftar bagian');

      const sections = await tx.section.findMany({
        where: { chapterId },
        orderBy: SORT_ORDER,
      });
      const plan = planReorder(input.items, sections, 'bagian');

      if (plan.changes.length === 0) {
        return withChangeResult(
          { sections: sections.map(toSectionRecord), chapter: toChapterToken(chapter) },
          false,
        );
      }

      const slugById = new Map(sections.map((s) => [s.id, s.slug]));
      for (const change of plan.changes) {
        await tx.section.update({
          where: { id: change.id },
          data: { sortOrder: change.sortOrder },
        });
      }
      const touched = await tx.chapter.update({
        where: { id: chapterId },
        data: { updatedAt: new Date() },
        select: { id: true, slug: true, updatedAt: true },
      });

      await buildAuditLog(
        {
          action: AUDIT_ACTIONS.SECTION_REORDERED,
          actor,
          target: { type: 'chapter', id: chapterId, label: chapter.title },
          metadata: {
            chapterId,
            chapterSlug: chapter.slug,
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

      const fresh = await tx.section.findMany({ where: { chapterId }, orderBy: SORT_ORDER });
      return { sections: fresh.map(toSectionRecord), chapter: toChapterToken(touched) };
    },
  });
};
