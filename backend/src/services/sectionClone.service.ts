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
  MAX_SLUG_LENGTH,
  MAX_SORT_ORDER,
  assertFresh,
  assertPlainObject,
  baseSlugFromTitle,
  expectedUpdatedAtSchema,
  idParamSchema,
  isUniqueViolation,
  STALE_WRITE_CODE,
  parseOrThrow,
  resolveUniqueSlug,
} from '../utils/hierarchyAuthoring.js';
import {
  figureSlugForSection,
  isFigureBlockSlug,
  mediaIdsOfStoredFigure,
} from '../utils/sectionFigure.js';
import { executeLockedTransaction } from '../utils/lockTransactionCache.js';
import { invalidateHierarchyDependentCaches } from './hierarchyCaches.js';
import { invalidateContentBlocksCache } from './contentBlocks.service.js';
import { STANDALONE_BLOCK_SLUGS } from './proseBlocks.service.js';
import {
  asMediaTx,
  lockAffectedAssets,
  mediaReference,
  toFigureMediaError,
} from './sectionFigure.service.js';
import { attachMedia } from './media.service.js';
import { checkChartTable, pageIdOfSection } from './chartFigureRefs.js';
import type { SectionRecordDTO, ChapterTokenDTO } from './sections.service.js';

/**
 * Moving and duplicating a Cerita section (SPEC §3). Both stay inside one page: a chart figure
 * may only draw from a table on its own page, and a section never changes page.
 */

const MAX_TITLE_LENGTH = 255;
const COPY_SUFFIX = ' (salinan)';

export const moveSectionSchema = z
  .object({
    targetChapterId: z
      .string({ error: 'Bab tujuan wajib dipilih' })
      .trim()
      .min(1, 'Bab tujuan wajib dipilih')
      .max(191, 'Bab tujuan tidak valid'),
    expectedUpdatedAt: expectedUpdatedAtSchema,
  })
  .strict();

export const duplicateSectionSchema = z
  .object({ expectedUpdatedAt: expectedUpdatedAtSchema })
  .strict();

export interface SectionMoveResult {
  section: SectionRecordDTO;
  /** The chapter the section now belongs to. */
  chapter: ChapterTokenDTO;
  /** The chapter it left. */
  fromChapter: ChapterTokenDTO;
}

export interface SectionDuplicateResult {
  section: SectionRecordDTO;
  chapter: ChapterTokenDTO;
}

const toRecord = (s: {
  id: string;
  chapterId: string;
  slug: string;
  title: string | null;
  sortOrder: number;
  updatedAt: Date;
}): SectionRecordDTO => ({
  id: s.id,
  chapterId: s.chapterId,
  slug: s.slug,
  title: s.title,
  sortOrder: s.sortOrder,
  updatedAt: s.updatedAt.toISOString(),
});

const toToken = (c: { id: string; slug: string; updatedAt: Date }): ChapterTokenDTO => ({
  id: c.id,
  slug: c.slug,
  updatedAt: c.updatedAt.toISOString(),
});

/** Locks the chapters involved in ascending id order, then the section (parent-first). */
async function lockChaptersThenSection(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  chapterIds: readonly string[],
  sectionId: string,
): Promise<void> {
  for (const id of [...new Set(chapterIds)].sort()) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM chapters WHERE id = ${id} FOR UPDATE`);
  }
  await tx.$queryRaw(Prisma.sql`SELECT id FROM sections WHERE id = ${sectionId} FOR UPDATE`);
}

/** The section changed under us between reading its chapter and taking the locks. */
const movedMeanwhile = () =>
  new HierarchyServiceError(
    'Bagian ini baru saja diubah oleh pengguna lain. Muat ulang data lalu coba lagi.',
    409,
    STALE_WRITE_CODE,
  );

function copyTitle(title: string | null): string | null {
  if (!title) return null;
  const base = title.endsWith(COPY_SUFFIX) ? title.slice(0, -COPY_SUFFIX.length) : title;
  return `${base.slice(0, MAX_TITLE_LENGTH - COPY_SUFFIX.length).trimEnd()}${COPY_SUFFIX}`;
}

async function chapterIdOfSection(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  sectionId: string,
): Promise<string | undefined> {
  const rows = await tx.$queryRaw<Array<{ chapter_id: string }>>(
    Prisma.sql`SELECT chapter_id FROM sections WHERE id = ${sectionId}`,
  );
  return rows[0]?.chapter_id;
}

export const moveSection = async (
  rawId: string,
  rawInput: unknown,
  actor: AuditActor,
  reqContext?: AuditRequestContext,
  client = prisma,
): Promise<SectionMoveResult> => {
  const id = parseOrThrow(idParamSchema, rawId);
  assertPlainObject(rawInput, 'Payload bagian harus berupa objek JSON');
  const input = parseOrThrow(moveSectionSchema, rawInput);
  const targetChapterId = input.targetChapterId;
  let lockedFromChapterId: string | undefined;

  return executeLockedTransaction({
    client,
    // ReadCommitted: the lock function starts with a plain read (to find the source chapter),
    // which would pin an old snapshot before the locks are taken.
    isolationLevel: 'ReadCommitted',
    lockQuery: async (tx) => {
      const fromChapterId = await chapterIdOfSection(tx, id);
      if (!fromChapterId) return;
      lockedFromChapterId = fromChapterId;
      await lockChaptersThenSection(tx, [fromChapterId, targetChapterId], id);
    },
    cache: [{ invalidate: invalidateHierarchyDependentCaches }],
    onCommit: () => invalidateContentBlocksCache(),
    execute: async (tx) => {
      const existing = await tx.section.findUnique({ where: { id } });
      if (!existing) throw new HierarchyServiceError('Bagian tidak ditemukan', 404);
      assertFresh(existing.updatedAt, input.expectedUpdatedAt, 'Bagian');
      if (existing.chapterId !== lockedFromChapterId) throw movedMeanwhile();

      if (existing.chapterId === targetChapterId) {
        throw new HierarchyServiceError('Bagian sudah berada di bab tersebut', 400);
      }
      const [from, target] = await Promise.all([
        tx.chapter.findUnique({ where: { id: existing.chapterId } }),
        tx.chapter.findUnique({ where: { id: targetChapterId } }),
      ]);
      if (!from) throw new HierarchyServiceError('Bab asal tidak ditemukan', 404);
      if (!target) throw new HierarchyServiceError('Bab tujuan tidak ditemukan', 404);
      if (from.pageId !== target.pageId) {
        throw new HierarchyServiceError(
          'Bagian hanya dapat dipindahkan ke bab pada halaman cerita yang sama.',
          422,
        );
      }

      const siblings = await tx.section.findMany({
        where: { chapterId: targetChapterId },
        select: { slug: true, sortOrder: true },
      });
      const slug = resolveUniqueSlug(existing.slug, new Set(siblings.map((s) => s.slug)));
      const maxOrder = siblings.reduce((m, s) => Math.max(m, s.sortOrder), -1);
      if (maxOrder >= MAX_SORT_ORDER) {
        throw new HierarchyServiceError('Urutan bagian telah mencapai batas maksimum', 400);
      }

      const moved = await tx.section.update({
        where: { id },
        data: { chapterId: targetChapterId, slug, sortOrder: maxOrder + 1 },
      });
      const now = new Date();
      const [touchedTarget, touchedFrom] = await Promise.all([
        tx.chapter.update({
          where: { id: targetChapterId },
          data: { updatedAt: now },
          select: { id: true, slug: true, updatedAt: true },
        }),
        tx.chapter.update({
          where: { id: existing.chapterId },
          data: { updatedAt: now },
          select: { id: true, slug: true, updatedAt: true },
        }),
      ]);

      await buildAuditLog(
        {
          action: AUDIT_ACTIONS.SECTION_MOVED,
          actor,
          target: { type: 'section', id, label: moved.title },
          metadata: {
            fromChapterId: existing.chapterId,
            fromChapterSlug: from.slug,
            toChapterId: targetChapterId,
            toChapterSlug: target.slug,
            slug: moved.slug,
          },
          context: reqContext,
        },
        tx,
      );

      return {
        section: toRecord(moved),
        chapter: toToken(touchedTarget),
        fromChapter: toToken(touchedFrom),
      };
    },
  });
};

export const duplicateSection = async (
  rawId: string,
  rawInput: unknown,
  actor: AuditActor,
  reqContext?: AuditRequestContext,
  client = prisma,
): Promise<SectionDuplicateResult> => {
  const id = parseOrThrow(idParamSchema, rawId);
  assertPlainObject(rawInput, 'Payload bagian harus berupa objek JSON');
  const input = parseOrThrow(duplicateSectionSchema, rawInput);
  const actorId = actor?.id?.trim() ? actor.id.trim() : null;
  let lockedChapterId: string | undefined;
  let lockedTableId: string | undefined;

  const run = () =>
    executeLockedTransaction({
      client,
      isolationLevel: 'ReadCommitted',
      lockQuery: async (tx) => {
        const chapterId = await chapterIdOfSection(tx, id);
        if (!chapterId) return;
        lockedChapterId = chapterId;
        // A chart's table is locked first (same order as saving a chart or moving a table), so the
        // copy cannot point at a table that is being moved to another page or deleted.
        const figureBlock = await tx.contentBlock.findUnique({
          where: { slug: figureSlugForSection(id) },
          select: { metadata: true },
        });
        const tableId = (figureBlock?.metadata as { kind?: unknown; tableId?: unknown } | null)
          ?.tableId;
        if (typeof tableId === 'string') {
          lockedTableId = tableId;
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM indicator_tables WHERE id = ${tableId} FOR UPDATE`,
          );
        }
        await lockChaptersThenSection(tx, [chapterId], id);
      },
      onCommit: () => invalidateContentBlocksCache(),
      execute: async (tx) => {
        const existing = await tx.section.findUnique({ where: { id } });
        if (!existing) throw new HierarchyServiceError('Bagian tidak ditemukan', 404);
        assertFresh(existing.updatedAt, input.expectedUpdatedAt, 'Bagian');
        if (existing.chapterId !== lockedChapterId) throw movedMeanwhile();

        const siblings = await tx.section.findMany({
          where: { chapterId: existing.chapterId },
          select: { slug: true, sortOrder: true },
        });
        const maxOrder = siblings.reduce((m, s) => Math.max(m, s.sortOrder), -1);
        if (maxOrder >= MAX_SORT_ORDER) {
          throw new HierarchyServiceError('Urutan bagian telah mencapai batas maksimum', 400);
        }
        const title = copyTitle(existing.title);
        const slug = resolveUniqueSlug(
          baseSlugFromTitle(title ?? existing.slug, 'bagian'),
          new Set(siblings.map((s) => s.slug)),
        );

        const copy = await tx.section.create({
          data: { chapterId: existing.chapterId, slug, title, sortOrder: maxOrder + 1 },
        });

        // Prose blocks keep their order; content_blocks.slug is global, so each copy resolves its
        // own free slug (never a standalone or figure slug).
        const prose = await tx.contentBlock.findMany({
          where: { sectionId: id, type: 'prose' },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        });
        const taken = new Set<string>(STANDALONE_BLOCK_SLUGS);
        let order = 0;
        for (const block of prose) {
          const base = baseSlugFromTitle(block.title ?? block.slug, 'blok konten');
          const near = await tx.contentBlock.findMany({
            where: { slug: { startsWith: base.slice(0, MAX_SLUG_LENGTH - 8) } },
            select: { slug: true },
          });
          for (const n of near) taken.add(n.slug);
          let blockSlug = resolveUniqueSlug(base, taken);
          while (isFigureBlockSlug(blockSlug)) {
            taken.add(blockSlug);
            blockSlug = resolveUniqueSlug(base, taken);
          }
          taken.add(blockSlug);
          await tx.contentBlock.create({
            data: {
              sectionId: copy.id,
              type: 'prose',
              slug: blockSlug,
              title: block.title,
              body: block.body,
              sortOrder: order++,
              updatedById: actorId,
            },
          });
        }

        const figure = await tx.contentBlock.findUnique({
          where: { slug: figureSlugForSection(id) },
        });
        let photoCount = 0;
        const chartTableId = (figure?.metadata as { tableId?: unknown } | null)?.tableId;
        if (typeof chartTableId === 'string') {
          if (chartTableId !== lockedTableId) throw movedMeanwhile();
          const check = await checkChartTable(
            tx,
            chartTableId,
            await pageIdOfSection(tx, existing.id),
          );
          if (check !== 'ok') {
            throw new HierarchyServiceError(
              'Grafik pada bagian ini memakai tabel data yang tidak tersedia di halaman ini. Perbaiki grafiknya dulu.',
              422,
            );
          }
        }
        if (figure && figure.type === 'figure' && figure.sectionId === id) {
          const created = await tx.contentBlock.create({
            data: {
              sectionId: copy.id,
              type: 'figure',
              slug: figureSlugForSection(copy.id),
              title: null,
              body: '',
              metadata: figure.metadata as Prisma.InputJsonValue,
              sortOrder: null,
              updatedById: actorId,
            },
          });
          const mediaIds = mediaIdsOfStoredFigure(figure.metadata);
          photoCount = mediaIds.length;
          try {
            await lockAffectedAssets(tx, mediaIds);
            await attachMedia(asMediaTx(tx), mediaIds, mediaReference(created.id));
          } catch (err) {
            throw toFigureMediaError(err);
          }
        }

        const touched = await tx.chapter.update({
          where: { id: existing.chapterId },
          data: { updatedAt: new Date() },
          select: { id: true, slug: true, updatedAt: true },
        });

        await buildAuditLog(
          {
            action: AUDIT_ACTIONS.SECTION_DUPLICATED,
            actor,
            target: { type: 'section', id: copy.id, label: copy.title },
            metadata: {
              sourceSectionId: id,
              chapterId: existing.chapterId,
              slug: copy.slug,
              proseCount: prose.length,
              hasFigure: figure !== null,
              photoCount,
            },
            context: reqContext,
          },
          tx,
        );

        return { section: toRecord(copy), chapter: toToken(touched) };
      },
    });

  try {
    return await run();
  } catch (err) {
    // content_blocks.slug is global: a concurrent writer took a slug we resolved a moment ago.
    if (isUniqueViolation(err)) throw movedMeanwhile();
    throw err;
  }
};
