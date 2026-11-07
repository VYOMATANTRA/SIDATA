import { z } from 'zod';
import prisma from '../utils/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  buildAuditLog,
  AUDIT_ACTIONS,
  type AuditActor,
  type AuditRequestContext,
} from './audit.service.js';
import { executeLockedTransaction, withChangeResult } from '../utils/lockTransactionCache.js';
import {
  STANDALONE_BLOCK_PROTECTED_CODE,
  assertFresh,
  assertPlainObject,
  baseSlugFromTitle,
  expectedUpdatedAtSchema,
  idParamSchema,
  isUniqueViolation,
  MAX_SLUG_LENGTH,
  MAX_SORT_ORDER,
  parseOrThrow,
  planReorder,
  reorderBodySchema,
  resolveUniqueSlug,
  titleSchema,
} from '../utils/hierarchyAuthoring.js';
import {
  ContentBlockServiceError,
  DEFAULT_CONTENT_BLOCKS,
  SLUG_REGEX,
  formatContentBlock,
  invalidateContentBlocksCache,
  type ContentBlockDto,
} from './contentBlocks.service.js';

// ---------------------------------------------------------------------------------------------
// Section prose blocks (SPEC §2/§3/§7): authoring API for blocks attached to a section.
// Standalone singleton blocks (section_id NULL: hero, sambutan, highlights, profile, catalog)
// are seeded fixed slots and can be neither created nor deleted through these functions.
// ---------------------------------------------------------------------------------------------

export const STANDALONE_BLOCK_SLUGS: ReadonlySet<string> = new Set(
  DEFAULT_CONTENT_BLOCKS.map((b) => b.slug),
);

/** The parent section's fresh concurrency token, so the client can chain the next write. */
export interface SectionTokenDto {
  id: string;
  slug: string;
  updatedAt: string;
}

export interface ContentBlockWriteResult {
  block: ContentBlockDto;
  section: SectionTokenDto;
}

export interface ContentBlockReorderResult {
  blocks: ContentBlockDto[];
  section: SectionTokenDto;
}

const toSectionToken = (s: { id: string; slug: string; updatedAt: Date }): SectionTokenDto => ({
  id: s.id,
  slug: s.slug,
  updatedAt: s.updatedAt.toISOString(),
});

const BLOCK_SORT_ORDER = [
  { sortOrder: 'asc' as const },
  { createdAt: 'asc' as const },
  { id: 'asc' as const },
];

export const createProseBlockSchema = z
  .object({
    title: titleSchema('Judul blok konten'),
    body: z
      .string({ error: 'Isi konten harus berupa string' })
      .trim()
      .min(1, 'Isi konten wajib diisi dan tidak boleh hanya berupa spasi')
      .max(50000, 'Isi konten maksimal 50.000 karakter'),
  })
  .strict();

const MAX_SLUG_ATTEMPTS = 3;

export const createProseBlock = async (
  rawSectionId: string,
  rawInput: unknown,
  actor: AuditActor,
  reqContext?: AuditRequestContext,
  client = prisma,
): Promise<ContentBlockWriteResult> => {
  const sectionId = parseOrThrow(idParamSchema, rawSectionId);
  assertPlainObject(rawInput, 'Payload blok konten harus berupa objek JSON');
  const input = parseOrThrow(createProseBlockSchema, rawInput);
  const baseSlug = baseSlugFromTitle(input.title, 'blok konten', STANDALONE_BLOCK_SLUGS);
  const actorId = actor?.id?.trim() ? actor.id.trim() : null;

  const attempt = () =>
    executeLockedTransaction({
      client,
      lockQuery: Prisma.sql`SELECT id FROM sections WHERE id = ${sectionId} FOR UPDATE`,
      execute: async (tx) => {
        const section = await tx.section.findUnique({
          where: { id: sectionId },
          select: { id: true, slug: true },
        });
        if (!section) {
          throw new ContentBlockServiceError('Bagian tidak ditemukan', 404);
        }

        // content_blocks.slug is globally unique, so collisions are resolved table-wide. The
        // lookup prefix is shortened so a suffixed name of a near-limit slug (which
        // resolveUniqueSlug truncates to fit `-N`) is still among the rows we load.
        const sameSlug = await tx.contentBlock.findMany({
          where: { slug: { startsWith: baseSlug.slice(0, MAX_SLUG_LENGTH - 8) } },
          select: { slug: true },
        });
        const slug = resolveUniqueSlug(baseSlug, new Set(sameSlug.map((b) => b.slug)));

        const siblings = await tx.contentBlock.findMany({
          where: { sectionId },
          select: { sortOrder: true },
        });
        const maxOrder = siblings.reduce((m, b) => Math.max(m, b.sortOrder ?? -1), -1);
        if (maxOrder >= MAX_SORT_ORDER) {
          throw new ContentBlockServiceError(
            'Urutan blok konten telah mencapai batas maksimum',
            400,
          );
        }

        const created = await tx.contentBlock.create({
          data: {
            sectionId,
            type: 'prose',
            slug,
            title: input.title,
            body: input.body,
            sortOrder: maxOrder + 1,
            updatedById: actorId,
          },
        });
        const touched = await tx.section.update({
          where: { id: sectionId },
          data: { updatedAt: new Date() },
          select: { id: true, slug: true, updatedAt: true },
        });

        await buildAuditLog(
          {
            action: AUDIT_ACTIONS.CONTENT_BLOCK_CREATED,
            actor,
            target: { type: 'content_block', id: created.id, label: created.slug },
            metadata: {
              slug: created.slug,
              type: created.type,
              title: created.title,
              sectionId,
              sectionSlug: section.slug,
              sortOrder: created.sortOrder,
              bodyLength: input.body.length,
            },
            context: reqContext,
          },
          tx,
        );

        return { block: formatContentBlock(created), section: toSectionToken(touched) };
      },
      onCommit: (committed, didChange) => {
        if (didChange) invalidateContentBlocksCache(committed.block.slug);
      },
    });

  for (let n = 1; ; n++) {
    try {
      return await attempt();
    } catch (err) {
      // A same-slug block committed by a concurrent writer in another section: re-resolve.
      if (isUniqueViolation(err) && n < MAX_SLUG_ATTEMPTS) continue;
      if (isUniqueViolation(err)) {
        throw new ContentBlockServiceError(
          'Gagal membuat slug unik untuk blok konten. Silakan coba lagi.',
          409,
        );
      }
      throw err;
    }
  }
};

export const deleteProseBlock = async (
  rawSlug: string,
  rawExpectedUpdatedAt: unknown,
  actor: AuditActor,
  reqContext?: AuditRequestContext,
  client = prisma,
): Promise<ContentBlockWriteResult> => {
  const slug = typeof rawSlug === 'string' ? rawSlug.trim().toLowerCase() : '';
  if (!SLUG_REGEX.test(slug) || slug.length > 100) {
    throw new ContentBlockServiceError(
      'Format slug tidak valid. Gunakan format kebab-case (maksimal 100 karakter).',
      400,
    );
  }
  const expectedUpdatedAt = parseOrThrow(expectedUpdatedAtSchema, rawExpectedUpdatedAt);

  return executeLockedTransaction({
    client,
    // Lock order is always section → block, matching create/reorder.
    // The lock function starts with a plain read (to find the parent), which would pin an old
    // snapshot before the locks are taken; ReadCommitted makes every post-lock read current.
    isolationLevel: 'ReadCommitted',
    lockQuery: async (tx) => {
      const rows = await tx.$queryRaw<Array<{ section_id: string | null }>>(
        Prisma.sql`SELECT section_id FROM content_blocks WHERE slug = ${slug}`,
      );
      const sectionId = rows[0]?.section_id;
      if (sectionId) {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM sections WHERE id = ${sectionId} FOR UPDATE`);
      }
      await tx.$queryRaw(Prisma.sql`SELECT id FROM content_blocks WHERE slug = ${slug} FOR UPDATE`);
    },
    onCommit: (_committed, didChange) => {
      if (didChange) invalidateContentBlocksCache(slug);
    },
    execute: async (tx) => {
      const existing = await tx.contentBlock.findUnique({ where: { slug } });
      if (!existing) {
        throw new ContentBlockServiceError(
          `Blok konten dengan slug '${slug}' tidak ditemukan`,
          404,
        );
      }
      if (
        existing.sectionId === null ||
        existing.type !== 'prose' ||
        STANDALONE_BLOCK_SLUGS.has(existing.slug)
      ) {
        throw new ContentBlockServiceError(
          'Blok konten mandiri (hero, sambutan, sorotan, profil, katalog) tidak dapat dihapus',
          409,
          STANDALONE_BLOCK_PROTECTED_CODE,
        );
      }
      assertFresh(existing.updatedAt, expectedUpdatedAt, 'Blok konten');

      await tx.contentBlock.delete({ where: { id: existing.id } });
      const touched = await tx.section.update({
        where: { id: existing.sectionId },
        data: { updatedAt: new Date() },
        select: { id: true, slug: true, updatedAt: true },
      });

      await buildAuditLog(
        {
          action: AUDIT_ACTIONS.CONTENT_BLOCK_DELETED,
          actor,
          target: { type: 'content_block', id: existing.id, label: existing.slug },
          metadata: {
            slug: existing.slug,
            type: existing.type,
            title: existing.title,
            sectionId: existing.sectionId,
            sectionSlug: touched.slug,
            sortOrder: existing.sortOrder,
            bodyLength: existing.body.length,
          },
          context: reqContext,
        },
        tx,
      );

      return { block: formatContentBlock(existing), section: toSectionToken(touched) };
    },
  });
};

export const reorderProseBlocks = async (
  rawSectionId: string,
  rawInput: unknown,
  actor: AuditActor,
  reqContext?: AuditRequestContext,
  client = prisma,
): Promise<ContentBlockReorderResult> => {
  const sectionId = parseOrThrow(idParamSchema, rawSectionId);
  assertPlainObject(rawInput, 'Payload urutan blok konten harus berupa objek JSON');
  const input = parseOrThrow(reorderBodySchema, rawInput);

  return executeLockedTransaction({
    client,
    lockQuery: async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM sections WHERE id = ${sectionId} FOR UPDATE`);
      // Children are locked in ascending id order, the same order the writes below use.
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM content_blocks WHERE section_id = ${sectionId} ORDER BY id FOR UPDATE`,
      );
    },
    execute: async (tx) => {
      const section = await tx.section.findUnique({
        where: { id: sectionId },
        select: { id: true, slug: true, title: true, updatedAt: true },
      });
      if (!section) {
        throw new ContentBlockServiceError('Bagian tidak ditemukan', 404);
      }
      assertFresh(section.updatedAt, input.expectedUpdatedAt, 'Daftar blok konten');

      const blocks = await tx.contentBlock.findMany({
        where: { sectionId },
        orderBy: BLOCK_SORT_ORDER,
      });
      const plan = planReorder(input.items, blocks, 'blok konten');

      // No-op reorder: nothing written, nothing audited, no cache dropped, token unchanged.
      if (plan.changes.length === 0) {
        return withChangeResult(
          { blocks: blocks.map(formatContentBlock), section: toSectionToken(section) },
          false,
        );
      }

      const slugById = new Map(blocks.map((b) => [b.id, b.slug]));
      for (const change of plan.changes) {
        await tx.contentBlock.update({
          where: { id: change.id },
          data: { sortOrder: change.sortOrder },
        });
      }
      const touched = await tx.section.update({
        where: { id: sectionId },
        data: { updatedAt: new Date() },
        select: { id: true, slug: true, updatedAt: true },
      });

      await buildAuditLog(
        {
          action: AUDIT_ACTIONS.CONTENT_BLOCK_REORDERED,
          actor,
          target: { type: 'section', id: sectionId, label: section.title },
          metadata: {
            sectionId,
            sectionSlug: section.slug,
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

      const fresh = await tx.contentBlock.findMany({
        where: { sectionId },
        orderBy: BLOCK_SORT_ORDER,
      });
      return { blocks: fresh.map(formatContentBlock), section: toSectionToken(touched) };
    },
    // Reordering rewrites sortOrder/updatedAt on every moved block: drop the list and their slug caches.
    onCommit: (committed, didChange) => {
      if (!didChange) return;
      for (const b of committed.blocks) invalidateContentBlocksCache(b.slug);
    },
  });
};
