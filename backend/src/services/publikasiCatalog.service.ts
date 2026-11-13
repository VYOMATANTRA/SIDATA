import { randomUUID } from 'node:crypto';
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
import { hasFieldChanged } from '../utils/comparator.js';
import {
  HierarchyServiceError,
  assertFresh,
  assertPlainObject,
  expectedUpdatedAtSchema,
  parseOrThrow,
} from '../utils/hierarchyAuthoring.js';
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
  publikasiItemSchema,
  type ContentBlockDto,
} from './contentBlocks.service.js';

// ---------------------------------------------------------------------------------------------
// Publikasi catalog (SPEC §4/§7): the `publikasi-katalog` content block holds the catalog in
// `metadata.publications[]`. Items may reference an uploaded document and a cover photo, so every
// write goes through this service: it locks the block, attaches/detaches the referenced media in
// the same transaction (never touching `attached_at` directly), derives the file facts from the
// stored asset and audits the change. The generic content-block PATCH refuses metadata changes
// for this block (PUBLIKASI_BLOCK_PROTECTED) so none of this can be bypassed.
// ---------------------------------------------------------------------------------------------

export const PUBLIKASI_SLUG = 'publikasi-katalog';
export const PUBLIKASI_DOCUMENT_PURPOSE = 'publikasi-document' as const;
export const PUBLIKASI_COVER_PURPOSE = 'publikasi-cover' as const;
export const PUBLIKASI_DOCUMENT_SLOT = 'publikasi-document';
export const PUBLIKASI_COVER_SLOT = 'publikasi-cover';

type PublikasiItem = z.infer<typeof publikasiItemSchema>;

export const putPublikasiCatalogSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Judul katalog wajib diisi')
      .max(255, 'Judul maksimal 255 karakter')
      .refine((v) => !/<[a-z!/]/i.test(v), 'Judul tidak boleh mengandung tag HTML'),
    body: z
      .string()
      .trim()
      .min(1, 'Deskripsi katalog wajib diisi')
      .max(50000, 'Isi konten maksimal 50.000 karakter'),
    publications: z.array(publikasiItemSchema).max(25, 'Maksimal 25 item publikasi'),
    expectedUpdatedAt: expectedUpdatedAtSchema,
  })
  .strict();

const asMediaTx = (tx: unknown): MediaTransactionClient => tx as MediaTransactionClient;

const FILE_TYPE_BY_MIME: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
};

/** Asset ids held by one slot of a stored catalog, tolerant of malformed legacy metadata. */
export function storedAssetIds(
  metadata: unknown,
  key: 'documentAssetId' | 'coverAssetId',
): string[] {
  const items = (metadata as { publications?: unknown } | null)?.publications;
  if (!Array.isArray(items)) return [];
  const ids: string[] = [];
  for (const item of items) {
    const id = (item as Record<string, unknown> | null)?.[key];
    if (typeof id === 'string') ids.push(id);
  }
  return ids;
}

function assertNoSharedAssets(items: readonly PublikasiItem[]): void {
  for (const key of ['documentAssetId', 'coverAssetId'] as const) {
    const ids = items.map((i) => i[key]).filter((id): id is string => Boolean(id));
    if (new Set(ids).size !== ids.length) {
      throw new HierarchyServiceError(
        'Satu berkas atau sampul hanya boleh dipakai oleh satu publikasi.',
        400,
      );
    }
  }
}

function toMediaError(err: unknown): unknown {
  if (!(err instanceof MediaServiceError)) return err;
  if (err.code === 'MEDIA_PURPOSE_MISMATCH') {
    return new HierarchyServiceError(
      'Salah satu berkas tidak dapat dipakai di katalog publikasi. Unggah ulang berkasnya dari halaman ini.',
      400,
    );
  }
  if (err.statusCode >= 400 && err.statusCode < 500) {
    return new HierarchyServiceError(
      'Salah satu berkas atau sampul tidak ditemukan atau sudah dihapus. Unggah ulang berkasnya.',
      400,
    );
  }
  return err;
}

async function lockAssets(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  ids: readonly string[],
): Promise<void> {
  const sorted = [...new Set(ids)].sort();
  if (sorted.length === 0) return;
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM media_assets WHERE id IN (${Prisma.join(sorted)}) ORDER BY id FOR UPDATE`,
  );
}

const reference = (blockId: string, slot: string, purpose: typeof PUBLIKASI_COVER_PURPOSE) => ({
  purpose,
  reference: { type: 'content_block', id: blockId, slot },
});

const documentRef = (blockId: string) => ({
  purpose: PUBLIKASI_DOCUMENT_PURPOSE,
  reference: { type: 'content_block', id: blockId, slot: PUBLIKASI_DOCUMENT_SLOT },
});

const coverRef = (blockId: string) =>
  reference(blockId, PUBLIKASI_COVER_SLOT, PUBLIKASI_COVER_PURPOSE);

/** The audit summary: counts only, never file names, paths or ids. */
function auditSummary(items: readonly PublikasiItem[]): Record<string, unknown> {
  return {
    publications: items.length,
    withDocument: items.filter((i) => i.documentAssetId).length,
    withCover: items.filter((i) => i.coverAssetId).length,
  };
}

/**
 * Which publications an edit touched, by title (SPEC §3: audit rows hold titles and counts).
 * Rows are matched by their stored id; a row without one counts as removed and added.
 */
function auditItemDiff(
  before: readonly PublikasiItem[],
  after: readonly PublikasiItem[],
): { added: string[]; removed: string[]; changed: string[]; reordered: boolean } {
  const byId = new Map(before.filter((i) => i.id).map((i) => [i.id!, i]));
  const keptIds = new Set<string>();
  const added: string[] = [];
  const changed: string[] = [];
  for (const item of after) {
    const old = item.id ? byId.get(item.id) : undefined;
    if (!old) {
      added.push(item.title);
      continue;
    }
    keptIds.add(old.id!);
    if (hasFieldChanged(old, item)) changed.push(item.title);
  }
  const removed = before.filter((i) => !i.id || !keptIds.has(i.id)).map((i) => i.title);
  const orderOf = (list: readonly PublikasiItem[]) =>
    list
      .filter((i) => i.id && keptIds.has(i.id))
      .map((i) => i.id)
      .join();
  return { added, removed, changed, reordered: orderOf(before) !== orderOf(after) };
}

export const putPublikasiCatalog = async (
  rawInput: unknown,
  actor: AuditActor,
  reqContext?: AuditRequestContext,
  client = prisma,
): Promise<ContentBlockDto> => {
  assertPlainObject(rawInput, 'Payload katalog harus berupa objek JSON');
  const input = parseOrThrow(putPublikasiCatalogSchema, rawInput);
  assertNoSharedAssets(input.publications);
  const actorId = actor?.id?.trim() ? actor.id.trim() : null;

  return executeLockedTransaction({
    client,
    // ReadCommitted: see sectionFigure.service.ts (detachMedia counts references with a plain read).
    isolationLevel: 'ReadCommitted',
    lockQuery: Prisma.sql`SELECT id FROM content_blocks WHERE slug = ${PUBLIKASI_SLUG} FOR UPDATE`,
    execute: async (tx) => {
      const existing = await tx.contentBlock.findUnique({ where: { slug: PUBLIKASI_SLUG } });
      if (!existing) {
        throw new ContentBlockServiceError('Katalog publikasi tidak ditemukan', 404);
      }
      assertFresh(existing.updatedAt, input.expectedUpdatedAt, 'Katalog publikasi');

      const newDocIds = input.publications
        .map((i) => i.documentAssetId)
        .filter((id): id is string => Boolean(id));
      const newCoverIds = input.publications
        .map((i) => i.coverAssetId)
        .filter((id): id is string => Boolean(id));
      const oldDocIds = storedAssetIds(existing.metadata, 'documentAssetId');
      const oldCoverIds = storedAssetIds(existing.metadata, 'coverAssetId');

      // Facts about each attached document come from the stored asset, not from the editor.
      let assetFacts = new Map<string, { mimeType: string; byteSize: number; kind: string }>();
      try {
        await lockAssets(tx, [...oldDocIds, ...oldCoverIds, ...newDocIds, ...newCoverIds]);
        if (newDocIds.length > 0) {
          const rows = await tx.mediaAsset.findMany({
            where: { id: { in: newDocIds } },
            select: { id: true, mimeType: true, byteSize: true, kind: true },
          });
          assetFacts = new Map(rows.map((r) => [r.id, r]));
        }
      } catch (err) {
        throw toMediaError(err);
      }

      const publications: PublikasiItem[] = input.publications.map((item) => {
        const next: PublikasiItem = { ...item, id: item.id ?? randomUUID() };
        if (next.documentAssetId) {
          const facts = assetFacts.get(next.documentAssetId);
          if (!facts) {
            throw new HierarchyServiceError(
              'Salah satu berkas tidak ditemukan atau sudah dihapus. Unggah ulang berkasnya.',
              400,
            );
          }
          next.fileType = FILE_TYPE_BY_MIME[facts.mimeType] ?? next.fileType;
          next.fileSizeBytes = facts.byteSize;
        }
        if (!next.coverAssetId) delete next.coverIsAuto;
        return next;
      });

      // Keep any other stored key: this endpoint owns `publications` only.
      const metadata = JSON.parse(
        JSON.stringify({
          ...((existing.metadata as Record<string, unknown> | null) ?? {}),
          publications,
        }),
      ) as Record<string, unknown>;
      const title = input.title;
      const body = input.body;

      const metadataChanged = hasFieldChanged(existing.metadata, metadata);
      const changes: Record<string, { before: unknown; after: unknown; items?: unknown }> = {};
      if (hasFieldChanged(existing.title, title)) {
        changes.title = { before: existing.title, after: title };
      }
      if (hasFieldChanged(existing.body, body)) {
        changes.body = { before: existing.body, after: body };
      }
      if (metadataChanged) {
        const oldItems = ((existing.metadata as { publications?: PublikasiItem[] } | null)
          ?.publications ?? []) as PublikasiItem[];
        changes.metadata = {
          before: auditSummary(oldItems),
          after: auditSummary(publications),
          items: auditItemDiff(oldItems, publications),
        };
      }

      // Unchanged: nothing is written, audited or invalidated, but the attachment is re-asserted
      // (idempotent) so a link lost behind our back is repaired by a plain re-save.
      if (Object.keys(changes).length === 0) {
        try {
          await attachMedia(asMediaTx(tx), newDocIds, documentRef(existing.id));
          await attachMedia(asMediaTx(tx), newCoverIds, coverRef(existing.id));
        } catch (err) {
          throw toMediaError(err);
        }
        return withChangeResult(formatContentBlock(existing), false);
      }

      const block = await tx.contentBlock.update({
        where: { id: existing.id },
        data: {
          title,
          body,
          metadata: metadata as Prisma.InputJsonValue,
          updatedById: actorId,
        },
      });

      try {
        await detachMedia(
          asMediaTx(tx),
          oldDocIds.filter((id) => !newDocIds.includes(id)),
          documentRef(block.id),
          new Date(),
          { lenient: true },
        );
        await detachMedia(
          asMediaTx(tx),
          oldCoverIds.filter((id) => !newCoverIds.includes(id)),
          coverRef(block.id),
          new Date(),
          { lenient: true },
        );
        await attachMedia(asMediaTx(tx), newDocIds, documentRef(block.id));
        await attachMedia(asMediaTx(tx), newCoverIds, coverRef(block.id));
      } catch (err) {
        throw toMediaError(err);
      }

      await buildAuditLog(
        {
          action: AUDIT_ACTIONS.CONTENT_BLOCK_UPDATED,
          actor,
          target: { type: 'content_block', id: block.id, label: block.slug },
          metadata: { slug: block.slug, type: block.type, changes },
          context: reqContext,
        },
        tx,
      );

      return formatContentBlock(block);
    },
    onCommit: (committed, didChange) => {
      if (didChange) invalidateContentBlocksCache(committed.slug);
    },
  });
};
