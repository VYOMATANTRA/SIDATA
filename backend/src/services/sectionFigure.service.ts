import prisma from '../utils/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  buildAuditLog,
  AUDIT_ACTIONS,
  type AuditActor,
  type AuditRequestContext,
} from './audit.service.js';
import { executeLockedTransaction, withChangeResult } from '../utils/lockTransactionCache.js';
import { hasFieldChanged } from '../utils/comparator.js';
import {
  FIGURE_NOT_FOUND_CODE,
  HierarchyServiceError,
  assertFresh,
  assertPlainObject,
  expectedUpdatedAtSchema,
  idParamSchema,
  parseOrThrow,
} from '../utils/hierarchyAuthoring.js';
import {
  figureAuditSummary,
  figureMediaIds,
  figureSlugForSection,
  mediaIdsOfStoredFigure,
  putFigureBodySchema,
  sectionFigureSchema,
  type SectionFigure,
} from '../utils/sectionFigure.js';
import {
  attachMedia,
  detachMedia,
  MediaServiceError,
  type MediaTransactionClient,
} from './media.service.js';
import {
  ContentBlockServiceError,
  formatContentBlock,
  invalidateContentBlocksCache,
  type ContentBlockDto,
} from './contentBlocks.service.js';

// ---------------------------------------------------------------------------------------------
// Section figure (SPEC §2/§3/§7): at most one `figure` content block per section, holding a
// photo, a photo group or a diagram in `metadata`. The block's slug is deterministic
// (`figure-<sectionId>`), so the global unique slug also guarantees one figure per section.
// Every write holds the section row lock, attaches/detaches the referenced media inside the
// same transaction (never touching `attached_at` directly) and bumps the section's token.
// ---------------------------------------------------------------------------------------------

export const FIGURE_MEDIA_PURPOSE = 'cerita' as const;
export const FIGURE_MEDIA_SLOT = 'figure';

/** The section's fresh concurrency token, so the client can chain the next write. */
export interface FigureSectionToken {
  id: string;
  updatedAt: string;
}

export interface FigureSaveResult {
  block: ContentBlockDto;
  section: FigureSectionToken;
}

export interface FigureDeleteResult {
  section: FigureSectionToken;
}

const toToken = (s: { id: string; updatedAt: Date }): FigureSectionToken => ({
  id: s.id,
  updatedAt: s.updatedAt.toISOString(),
});

const mediaReference = (blockId: string) => ({
  purpose: FIGURE_MEDIA_PURPOSE,
  reference: { type: 'content_block', id: blockId, slot: FIGURE_MEDIA_SLOT },
});

/**
 * The media service types its transaction against the plain generated client; the app's
 * `$extends`-wrapped client (audit guard) produces a structurally equivalent but nominally
 * different transaction type, so it is narrowed here once.
 */
const asMediaTx = (tx: unknown): MediaTransactionClient => tx as MediaTransactionClient;

/** Media failures become plain 400s (the CMS shows the sentence); anything else bubbles up. */
function toFigureMediaError(err: unknown, mode: 'save' | 'delete' = 'save'): unknown {
  if (!(err instanceof MediaServiceError)) return err;
  if (mode === 'delete') {
    // Releasing media is lenient, so this is not expected; never ask the editor to re-upload
    // when the goal was to remove the figure.
    return new HierarchyServiceError(
      'Gambar bagian belum dapat dihapus karena foto-fotonya gagal dilepas. Coba lagi beberapa saat lagi.',
      409,
    );
  }
  if (err.code === 'MEDIA_PURPOSE_MISMATCH') {
    return new HierarchyServiceError(
      'Salah satu foto tidak dapat dipakai di gambar bagian ini. Unggah ulang fotonya dari halaman ini.',
      400,
    );
  }
  if (err.statusCode >= 400 && err.statusCode < 500) {
    return new HierarchyServiceError(
      'Salah satu foto tidak ditemukan atau sudah dihapus. Unggah ulang fotonya.',
      400,
    );
  }
  return err;
}

/** Locks section, then the figure block (parent-first, SPEC §3). */
async function lockSectionAndFigure(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  sectionId: string,
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM sections WHERE id = ${sectionId} FOR UPDATE`);
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM content_blocks WHERE slug = ${figureSlugForSection(sectionId)} FOR UPDATE`,
  );
}

/**
 * Takes the row locks of every affected asset in ascending id order up front, so two figures
 * that swap shared photos in opposite directions cannot lock them in inverted order.
 */
async function lockAffectedAssets(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  ids: readonly string[],
): Promise<void> {
  const sorted = [...new Set(ids)].sort();
  if (sorted.length === 0) return;
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM media_assets WHERE id IN (${Prisma.join(sorted)}) ORDER BY id FOR UPDATE`,
  );
}

export const putSectionFigure = async (
  rawSectionId: string,
  rawInput: unknown,
  actor: AuditActor,
  reqContext?: AuditRequestContext,
  client = prisma,
): Promise<FigureSaveResult> => {
  const sectionId = parseOrThrow(idParamSchema, rawSectionId);
  assertPlainObject(rawInput, 'Payload gambar harus berupa objek JSON');
  const body = parseOrThrow(putFigureBodySchema, rawInput);
  if (body.figure === undefined || body.figure === null) {
    throw new HierarchyServiceError('Data gambar wajib diisi', 400);
  }
  // Round-trip through JSON so dropped optional fields are absent keys, exactly as stored.
  const figure = JSON.parse(
    JSON.stringify(parseOrThrow(sectionFigureSchema, body.figure)),
  ) as SectionFigure;
  const slug = figureSlugForSection(sectionId);
  const newIds = figureMediaIds(figure);
  const actorId = actor?.id?.trim() ? actor.id.trim() : null;

  return executeLockedTransaction({
    client,
    // ReadCommitted: detachMedia counts the remaining references with a plain read, which under
    // REPEATABLE READ would use a snapshot older than the asset locks and miss a reference a
    // competing figure committed while this transaction waited (it would unpublish a shared photo).
    isolationLevel: 'ReadCommitted',
    lockQuery: (tx) => lockSectionAndFigure(tx, sectionId),
    execute: async (tx) => {
      const section = await tx.section.findUnique({
        where: { id: sectionId },
        select: { id: true, title: true, updatedAt: true },
      });
      if (!section) {
        throw new ContentBlockServiceError('Bagian tidak ditemukan', 404);
      }
      assertFresh(section.updatedAt, body.expectedUpdatedAt, 'Bagian');

      const existing = await tx.contentBlock.findUnique({ where: { slug } });
      if (existing && (existing.type !== 'figure' || existing.sectionId !== sectionId)) {
        // A prose block whose generated slug happens to equal the reserved figure slug.
        throw new HierarchyServiceError(
          'Gambar bagian tidak dapat dibuat karena nama internalnya sudah terpakai. Hubungi administrator.',
          409,
        );
      }

      // Same figure again: nothing to write, audit or invalidate; the token stays as it was.
      if (existing && !hasFieldChanged(existing.metadata, figure)) {
        return withChangeResult(
          { block: formatContentBlock(existing), section: toToken(section) },
          false,
        );
      }

      const oldIds = existing ? mediaIdsOfStoredFigure(existing.metadata) : [];
      const removedIds = oldIds.filter((id) => !newIds.includes(id));

      const metadata = figure as unknown as Prisma.InputJsonValue;
      const block = existing
        ? await tx.contentBlock.update({
            where: { id: existing.id },
            data: { metadata, updatedById: actorId },
          })
        : await tx.contentBlock.create({
            data: {
              sectionId,
              type: 'figure',
              slug,
              title: null,
              body: '',
              metadata,
              sortOrder: null,
              updatedById: actorId,
            },
          });

      try {
        await lockAffectedAssets(tx, [...removedIds, ...newIds]);
        await detachMedia(asMediaTx(tx), removedIds, mediaReference(block.id), new Date(), {
          lenient: true,
        });
        await attachMedia(asMediaTx(tx), newIds, mediaReference(block.id));
      } catch (err) {
        throw toFigureMediaError(err);
      }

      const touched = await tx.section.update({
        where: { id: sectionId },
        data: { updatedAt: new Date() },
        select: { id: true, updatedAt: true },
      });

      await buildAuditLog(
        {
          action: AUDIT_ACTIONS.SECTION_FIGURE_SAVED,
          actor,
          target: { type: 'section', id: sectionId, label: section.title },
          metadata: { sectionId, ...figureAuditSummary(figure) },
          context: reqContext,
        },
        tx,
      );

      return { block: formatContentBlock(block), section: toToken(touched) };
    },
    onCommit: (committed, didChange) => {
      if (didChange) invalidateContentBlocksCache(committed.block.slug);
    },
  });
};

export const deleteSectionFigure = async (
  rawSectionId: string,
  rawExpectedUpdatedAt: unknown,
  actor: AuditActor,
  reqContext?: AuditRequestContext,
  client = prisma,
): Promise<FigureDeleteResult> => {
  const sectionId = parseOrThrow(idParamSchema, rawSectionId);
  const expectedUpdatedAt = parseOrThrow(expectedUpdatedAtSchema, rawExpectedUpdatedAt);
  const slug = figureSlugForSection(sectionId);

  return executeLockedTransaction({
    client,
    // ReadCommitted: detachMedia counts the remaining references with a plain read, which under
    // REPEATABLE READ would use a snapshot older than the asset locks and miss a reference a
    // competing figure committed while this transaction waited (it would unpublish a shared photo).
    isolationLevel: 'ReadCommitted',
    lockQuery: (tx) => lockSectionAndFigure(tx, sectionId),
    execute: async (tx) => {
      const section = await tx.section.findUnique({
        where: { id: sectionId },
        select: { id: true, title: true, updatedAt: true },
      });
      if (!section) {
        throw new ContentBlockServiceError('Bagian tidak ditemukan', 404);
      }
      const existing = await tx.contentBlock.findUnique({ where: { slug } });
      if (!existing || existing.type !== 'figure' || existing.sectionId !== sectionId) {
        throw new HierarchyServiceError(
          'Bagian ini belum memiliki gambar',
          404,
          FIGURE_NOT_FOUND_CODE,
        );
      }
      assertFresh(section.updatedAt, expectedUpdatedAt, 'Bagian');

      const mediaIds = mediaIdsOfStoredFigure(existing.metadata);
      const meta = existing.metadata as { kind?: unknown } | null;
      const kind = typeof meta?.kind === 'string' ? meta.kind : null;

      await tx.contentBlock.delete({ where: { id: existing.id } });
      try {
        await lockAffectedAssets(tx, mediaIds);
        await detachMedia(asMediaTx(tx), mediaIds, mediaReference(existing.id), new Date(), {
          lenient: true,
        });
      } catch (err) {
        throw toFigureMediaError(err, 'delete');
      }
      const touched = await tx.section.update({
        where: { id: sectionId },
        data: { updatedAt: new Date() },
        select: { id: true, updatedAt: true },
      });

      await buildAuditLog(
        {
          action: AUDIT_ACTIONS.SECTION_FIGURE_DELETED,
          actor,
          target: { type: 'section', id: sectionId, label: section.title },
          metadata: { sectionId, kind },
          context: reqContext,
        },
        tx,
      );

      return { section: toToken(touched) };
    },
    onCommit: (_committed, didChange) => {
      if (didChange) invalidateContentBlocksCache(slug);
    },
  });
};
