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
  assertFresh,
  assertPlainObject,
  baseSlugFromTitle,
  expectedUpdatedAtSchema,
  HTML_TAG_PATTERN,
  idParamSchema,
  isUniqueViolation,
  parseOrThrow,
  PROSE_HTML_MESSAGE,
  resolveUniqueSlug,
  titleSchema,
} from '../utils/hierarchyAuthoring.js';
import { isFigureBlockSlug } from '../utils/sectionFigure.js';
import {
  executeLockedTransaction,
  withChangeResult,
  type LockedOperationOutput,
} from '../utils/lockTransactionCache.js';
import {
  formatContentBlock,
  invalidateContentBlocksCache,
  type ContentBlockDto,
} from './contentBlocks.service.js';
import { STANDALONE_BLOCK_SLUGS } from './proseBlocks.service.js';
import type { SectionRecordDTO } from './sections.service.js';

/**
 * A section's text as one unit (SPEC §3): its title and one body. The body is limited Markdown
 * where a blank line starts a new paragraph, so a section no longer needs several prose blocks.
 * Sections written before this holds several blocks; the first save merges them into one.
 */

/** The title the single prose block carries. The reader never shows a prose block's title. */
export const SECTION_TEXT_BLOCK_TITLE = 'Isi';
const MAX_BODY_LENGTH = 50000;
const MAX_SLUG_ATTEMPTS = 3;

export const putSectionTextSchema = z
  .object({
    title: titleSchema('Judul bagian'),
    // An empty body is allowed: it removes the section's text.
    body: z
      .string({ error: 'Isi bagian harus berupa teks' })
      .trim()
      .max(MAX_BODY_LENGTH, 'Isi bagian maksimal 50.000 karakter')
      .refine((v) => !HTML_TAG_PATTERN.test(v), PROSE_HTML_MESSAGE),
    expectedUpdatedAt: expectedUpdatedAtSchema,
  })
  .strict();

export interface SectionTextResult {
  section: SectionRecordDTO;
  /** The section's one prose block, or null when the body is empty. */
  block: ContentBlockDto | null;
}

const BLOCK_ORDER = [
  { sortOrder: 'asc' as const },
  { createdAt: 'asc' as const },
  { id: 'asc' as const },
];

export const putSectionText = async (
  rawSectionId: string,
  rawInput: unknown,
  actor: AuditActor,
  reqContext?: AuditRequestContext,
  client = prisma,
): Promise<SectionTextResult> => {
  const sectionId = parseOrThrow(idParamSchema, rawSectionId);
  assertPlainObject(rawInput, 'Payload teks bagian harus berupa objek JSON');
  const input = parseOrThrow(putSectionTextSchema, rawInput);
  const actorId = actor?.id?.trim() ? actor.id.trim() : null;
  const baseSlug = baseSlugFromTitle(SECTION_TEXT_BLOCK_TITLE, 'blok konten');
  const touchedSlugs = new Set<string>();

  const attempt = (): Promise<SectionTextResult> =>
    executeLockedTransaction({
      client,
      lockQuery: async (tx) => {
        // Section first, then its blocks in ascending id order (same order as reorder).
        await tx.$queryRaw(Prisma.sql`SELECT id FROM sections WHERE id = ${sectionId} FOR UPDATE`);
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM content_blocks WHERE section_id = ${sectionId} ORDER BY id FOR UPDATE`,
        );
      },
      onCommit: (_result, didChange) => {
        if (!didChange) return;
        if (touchedSlugs.size === 0) invalidateContentBlocksCache();
        for (const slug of touchedSlugs) invalidateContentBlocksCache(slug);
      },
      execute: async (tx): Promise<LockedOperationOutput<SectionTextResult>> => {
        touchedSlugs.clear();
        const section = await tx.section.findUnique({ where: { id: sectionId } });
        if (!section) throw new HierarchyServiceError('Bagian tidak ditemukan', 404);
        assertFresh(section.updatedAt, input.expectedUpdatedAt, 'Bagian');

        const blocks = await tx.contentBlock.findMany({
          where: { sectionId, type: 'prose' },
          orderBy: BLOCK_ORDER,
        });
        const [first, ...rest] = blocks;

        const titleChanged = section.title !== input.title;
        const bodyBefore = blocks.map((b) => b.body).join('\n\n');
        const bodyChanged =
          input.body === '' ? blocks.length > 0 : blocks.length !== 1 || first?.body !== input.body;

        if (!titleChanged && !bodyChanged) {
          return withChangeResult(
            { section: toRecord(section), block: first ? formatContentBlock(first) : null },
            false,
          );
        }

        let block: typeof first | null = first ?? null;

        if (input.body === '') {
          for (const b of blocks) {
            await tx.contentBlock.delete({ where: { id: b.id } });
            touchedSlugs.add(b.slug);
          }
          block = null;
        } else if (first) {
          for (const b of rest) {
            await tx.contentBlock.delete({ where: { id: b.id } });
            touchedSlugs.add(b.slug);
          }
          if (blocks.length !== 1 || first.body !== input.body) {
            block = await tx.contentBlock.update({
              where: { id: first.id },
              data: { body: input.body, updatedById: actorId },
            });
            touchedSlugs.add(first.slug);
          }
        } else {
          // content_blocks.slug is globally unique, so collisions are resolved table-wide. The
          // standalone and `figure-<id>` slugs are never available.
          const near = await tx.contentBlock.findMany({
            where: { slug: { startsWith: baseSlug.slice(0, MAX_SLUG_LENGTH - 8) } },
            select: { slug: true },
          });
          const taken = new Set([...near.map((b) => b.slug), ...STANDALONE_BLOCK_SLUGS]);
          let slug = resolveUniqueSlug(baseSlug, taken);
          while (isFigureBlockSlug(slug)) {
            taken.add(slug);
            slug = resolveUniqueSlug(baseSlug, taken);
          }
          block = await tx.contentBlock.create({
            data: {
              sectionId,
              type: 'prose',
              slug,
              title: SECTION_TEXT_BLOCK_TITLE,
              body: input.body,
              sortOrder: 0,
              updatedById: actorId,
            },
          });
          touchedSlugs.add(slug);
        }

        const updated = await tx.section.update({
          where: { id: sectionId },
          data: titleChanged ? { title: input.title } : { updatedAt: new Date() },
        });

        await buildAuditLog(
          {
            action: AUDIT_ACTIONS.SECTION_TEXT_SAVED,
            actor,
            target: { type: 'section', id: sectionId, label: updated.title },
            // Ids, counts and lengths only: the body is never logged.
            metadata: {
              chapterId: section.chapterId,
              slug: section.slug,
              titleChanged,
              blocksBefore: blocks.length,
              blocksAfter: block ? 1 : 0,
              bodyLengthBefore: bodyBefore.length,
              bodyLengthAfter: input.body.length,
            },
            context: reqContext,
          },
          tx,
        );

        return { section: toRecord(updated), block: block ? formatContentBlock(block) : null };
      },
    });

  for (let n = 1; ; n++) {
    try {
      return await attempt();
    } catch (err) {
      // A same-slug block committed by a concurrent writer in another section: re-resolve.
      if (isUniqueViolation(err) && n < MAX_SLUG_ATTEMPTS) continue;
      if (isUniqueViolation(err)) {
        throw new HierarchyServiceError(
          'Gagal membuat slug unik untuk blok konten. Silakan coba lagi.',
          409,
        );
      }
      throw err;
    }
  }
};

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
