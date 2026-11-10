import { copyFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Prisma, type MediaAsset } from '../../generated/prisma/client.js';
import prisma from '../utils/prisma.js';
import { processPhoto, type PhotoProcessingOptions } from '../utils/mediaImage.js';
import {
  DERIVATIVES_DIR,
  buildStorageKey,
  buildThumbnailKey,
  newAssetId,
  prepareDestination,
  sanitizeOriginalName,
} from '../utils/mediaStorage.js';
import {
  MEDIA_PURPOSES,
  MEDIA_TYPE_POLICY,
  isMediaPurpose,
  resolveOwnerKey,
  type MediaPurpose,
} from '../utils/mediaPolicy.js';
import { validateStagedFile } from '../utils/mediaSignature.js';
import { AUDIT_ACTIONS, buildAuditLog } from './audit.service.js';
import type { AuditRequestContext } from './audit.service.js';
import type { RequestActor } from '../utils/actor.js';

type ErrnoError = Error & { code?: string };

export class MediaServiceError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = 'MediaServiceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface MediaAssetDto {
  id: string;
  kind: MediaAsset['kind'];
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  originalName: string;
  /**
   * API PATH (same origin, e.g. `/api/media/<id>/preview`), not a browser-loadable URL. The route
   * is Editor/Admin-only and authenticates with an `Authorization: Bearer` header, which `<img src>`
   * and `<a href>` cannot send. The CMS must fetch it with the authenticated API client and show
   * the result through a blob URL (`URL.createObjectURL`). There are deliberately no signed
   * preview URLs. Public pages use `/api/media/<id>` and `/api/media/<id>/download` instead, once
   * content has attached the asset.
   */
  previewUrl: string;
}

/** The only shape that leaves the service: no storage key, owner key, provider or paths. */
export function toMediaAssetDto(asset: MediaAsset): MediaAssetDto {
  return {
    id: asset.id,
    kind: asset.kind,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
    width: asset.width,
    height: asset.height,
    originalName: asset.originalName,
    previewUrl: `/api/media/${asset.id}/preview`,
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidAssetId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export async function findMediaAsset(id: string): Promise<MediaAsset | null> {
  if (!isValidAssetId(id)) return null;
  return prisma.mediaAsset.findUnique({ where: { id } });
}

async function moveFile(from: string, to: string): Promise<void> {
  try {
    await rename(from, to);
  } catch (error) {
    if ((error as ErrnoError).code !== 'EXDEV') throw error;
    await copyFile(from, to);
    await rm(from, { force: true });
  }
}

export interface IngestInput {
  root: string;
  stagedPath: string;
  originalName: unknown;
  purpose: unknown;
  actor: RequestActor;
  context: AuditRequestContext;
  /** Test seam for the image pipeline (pixel bound, edge caps). */
  photoOptions?: PhotoProcessingOptions;
}

/**
 * Validates a staged upload, writes it into its final home (re-encoding photos), and records the
 * asset plus its audit row in one transaction. The caller owns the staging directory and removes
 * it whatever happens here. On any failure after bytes reach their destination, they are removed
 * again, so a failed upload leaves no orphan file.
 */
export async function ingestStagedUpload(input: IngestInput): Promise<MediaAssetDto> {
  const { root, stagedPath, actor, context } = input;

  if (!isMediaPurpose(input.purpose)) {
    throw new MediaServiceError('INVALID_PURPOSE', 'Tujuan unggahan tidak dikenal.', 400);
  }
  const purpose: MediaPurpose = input.purpose;

  const displayName = sanitizeOriginalName(input.originalName);
  const detected = await validateStagedFile(stagedPath, displayName);
  const { kind } = detected.policy;

  if (!(MEDIA_PURPOSES[purpose].kinds as readonly string[]).includes(kind)) {
    throw new MediaServiceError(
      'PURPOSE_KIND_MISMATCH',
      'Jenis berkas tidak sesuai dengan tujuan unggahan.',
      400,
    );
  }

  const assetId = newAssetId();
  const ownerKey = resolveOwnerKey(purpose, actor.id);
  const storageKey = buildStorageKey(
    kind,
    purpose,
    ownerKey,
    assetId,
    detected.policy.storedExtension,
  );
  const finalPath = await prepareDestination(root, storageKey);

  let width: number | null = null;
  let height: number | null = null;
  let mimeType = detected.policy.mimeType;

  try {
    if (kind === 'photo') {
      const thumbnailPath = await prepareDestination(root, buildThumbnailKey(assetId));
      const processed = await processPhoto(
        stagedPath,
        finalPath,
        thumbnailPath,
        input.photoOptions,
      );
      width = processed.width;
      height = processed.height;
      mimeType = MEDIA_TYPE_POLICY.webp.mimeType;
    } else {
      await moveFile(stagedPath, finalPath);
    }

    const byteSize = (await stat(finalPath)).size;

    const [asset] = await prisma.$transaction([
      prisma.mediaAsset.create({
        data: {
          id: assetId,
          provider: 'local',
          storageKey,
          kind,
          purpose,
          ownerKey,
          mimeType,
          byteSize,
          width,
          height,
          originalName: displayName,
          createdById: actor.id,
        },
      }),
      buildAuditLog({
        action: AUDIT_ACTIONS.MEDIA_UPLOADED,
        actor,
        target: { type: 'media_asset', id: assetId, label: purpose },
        // Ids, purpose, kind and size only. No bytes, no server paths, no original filename.
        metadata: { assetId, purpose, kind, byteSize, mimeType },
        context,
      }),
    ]);

    return toMediaAssetDto(asset);
  } catch (error) {
    await rm(finalPath, { force: true }).catch(() => undefined);
    await rm(path.join(root, DERIVATIVES_DIR, assetId), { recursive: true, force: true }).catch(
      () => undefined,
    );
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Attach / detach: called by content services INSIDE their own transactions.
// ---------------------------------------------------------------------------------------------

export type MediaTransactionClient = Pick<
  Prisma.TransactionClient,
  'mediaAsset' | 'mediaAssetReference' | '$queryRaw'
>;

export interface MediaReferenceIdentity {
  type: string;
  id: string;
  slot?: string;
}

export interface MediaAttachContext {
  /** The purpose the referencing content slot accepts. Assets of any other purpose are refused. */
  purpose: MediaPurpose;
  /** Stable server-owned identity of the content item and slot referencing the asset. */
  reference?: MediaReferenceIdentity;
}

export interface LockedMediaAssetRow {
  id: string;
  purpose: string;
  attachedAt: Date | null;
  detachedAt: Date | null;
  cleanupClaimedAt: Date | null;
  cleanupQuarantineReason: string | null;
}

interface NormalizedMediaReference {
  referenceType: string;
  referenceId: string;
  slot: string;
}

function normalizeReference(reference?: MediaReferenceIdentity): NormalizedMediaReference {
  const raw = reference ?? { type: 'default', id: 'default', slot: 'default' };
  const referenceType = typeof raw.type === 'string' ? raw.type.trim() : '';
  const referenceId = typeof raw.id === 'string' ? raw.id.trim() : '';
  const slot = typeof (raw.slot ?? 'default') === 'string' ? (raw.slot ?? 'default').trim() : '';
  if (
    !referenceType ||
    referenceType.length > 64 ||
    !referenceId ||
    referenceId.length > 191 ||
    !slot ||
    slot.length > 64
  ) {
    throw new MediaServiceError('INVALID_MEDIA_REFERENCE', 'Referensi media tidak valid.', 400);
  }
  return { referenceType, referenceId, slot };
}

/**
 * Acquires exclusive `FOR UPDATE` row locks in ascending ID order and reads current column values
 * directly from the locking query so InnoDB REPEATABLE READ never returns a stale snapshot.
 */
async function lockAssetsForUpdate(
  tx: MediaTransactionClient,
  sortedIds: readonly string[],
): Promise<LockedMediaAssetRow[]> {
  const locked = await tx.$queryRaw<Array<Partial<LockedMediaAssetRow> & { id: string }>>(
    Prisma.sql`SELECT id, purpose, attached_at AS attachedAt, detached_at AS detachedAt, cleanup_claimed_at AS cleanupClaimedAt, cleanup_quarantine_reason AS cleanupQuarantineReason FROM media_assets WHERE id IN (${Prisma.join(sortedIds)}) FOR UPDATE`,
  );
  if (locked.length === 0) return [];
  if (locked.every((row) => 'attachedAt' in row && 'purpose' in row)) {
    return locked.map((row) => ({
      id: row.id,
      purpose: row.purpose ?? '',
      attachedAt: row.attachedAt ?? null,
      detachedAt: row.detachedAt ?? null,
      cleanupClaimedAt: row.cleanupClaimedAt ?? null,
      cleanupQuarantineReason: row.cleanupQuarantineReason ?? null,
    }));
  }
  const existingIds = locked.map((r) => r.id);
  const assets = await tx.mediaAsset.findMany({ where: { id: { in: existingIds } } });
  return assets.map((a) => ({
    id: a.id,
    purpose: a.purpose,
    attachedAt: a.attachedAt,
    detachedAt: a.detachedAt,
    cleanupClaimedAt: a.cleanupClaimedAt ?? null,
    cleanupQuarantineReason: a.cleanupQuarantineReason ?? null,
  }));
}

/**
 * Publishes assets: records the reference tuple in `media_asset_references` and sets `attachedAt`
 * so the public delivery routes start serving them. Validates that every id exists, has not been
 * claimed for deletion or quarantined, and was uploaded for `context.purpose`.
 *
 * Reference ownership (SPEC.md §7): repeated attachment of the same
 * `(referenceType, referenceId, slot, assetId)` tuple is an idempotent no-op. Attaching an
 * unattached asset sets `attachedAt = now` and clears `detachedAt`; attaching an already-attached
 * asset preserves its original `attachedAt`. Throws MediaServiceError (400) otherwise, which rolls
 * back the caller's transaction.
 */
export async function attachMedia(
  tx: MediaTransactionClient,
  assetIds: readonly string[],
  context: MediaAttachContext,
  now: Date = new Date(),
): Promise<void> {
  const ids = [...new Set(assetIds)];
  if (ids.length === 0) return;
  if (!ids.every(isValidAssetId)) {
    throw new MediaServiceError('MEDIA_NOT_FOUND', 'Media tidak ditemukan.', 400);
  }
  if (!isMediaPurpose(context.purpose)) {
    throw new MediaServiceError(
      'MEDIA_PURPOSE_MISMATCH',
      'Media tidak sesuai dengan tujuan penggunaannya.',
      400,
    );
  }
  const ref = normalizeReference(context.reference);

  const sorted = [...ids].sort();
  const assets = await lockAssetsForUpdate(tx, sorted);
  if (
    assets.length !== sorted.length ||
    assets.some((a) => a.cleanupClaimedAt !== null || a.cleanupQuarantineReason !== null)
  ) {
    throw new MediaServiceError('MEDIA_NOT_FOUND', 'Media tidak ditemukan.', 400);
  }

  if (assets.some((a) => a.purpose !== context.purpose)) {
    throw new MediaServiceError(
      'MEDIA_PURPOSE_MISMATCH',
      'Media tidak sesuai dengan tujuan penggunaannya.',
      400,
    );
  }

  await tx.mediaAssetReference.createMany({
    data: sorted.map((assetId) => ({
      assetId,
      referenceType: ref.referenceType,
      referenceId: ref.referenceId,
      slot: ref.slot,
    })),
    skipDuplicates: true,
  });

  const unattachedIds = assets.filter((a) => a.attachedAt === null).map((a) => a.id);
  if (unattachedIds.length > 0) {
    await tx.mediaAsset.updateMany({
      where: { id: { in: unattachedIds }, cleanupClaimedAt: null },
      data: { attachedAt: now, detachedAt: null },
    });
  }

  const attachedWithDetachedIds = assets
    .filter((a) => a.attachedAt !== null && a.detachedAt !== null)
    .map((a) => a.id);
  if (attachedWithDetachedIds.length > 0) {
    await tx.mediaAsset.updateMany({
      where: { id: { in: attachedWithDetachedIds }, cleanupClaimedAt: null },
      data: { detachedAt: null },
    });
  }

  // Defense-in-depth recount: ensure no row was concurrently claimed or removed.
  const stillThere = await tx.mediaAsset.count({
    where: { id: { in: sorted }, cleanupClaimedAt: null },
  });
  if (stillThere !== sorted.length) {
    throw new MediaServiceError('MEDIA_NOT_FOUND', 'Media tidak ditemukan.', 400);
  }
}

/**
 * Removes the matching `(referenceType, referenceId, slot, assetId)` tuple from
 * `media_asset_references`. When an attached asset's remaining reference count reaches 0, takes
 * the asset out of public delivery (`attachedAt = null`) and stamps `detachedAt = now`. While at
 * least one other reference remains, `attachedAt` stays non-null.
 *
 * If an asset ID was already deleted by cleanup, detachMedia treats it as a no-op instead of throwing
 * MEDIA_NOT_FOUND, allowing content referencing deleted assets to clean up references gracefully.
 * Already-unattached assets keep their existing detachedAt, so repeating a detach never extends the clock.
 */
export async function detachMedia(
  tx: MediaTransactionClient,
  assetIds: readonly string[],
  context: MediaAttachContext,
  now: Date = new Date(),
): Promise<void> {
  const ids = [...new Set(assetIds)];
  if (ids.length === 0) return;
  if (!ids.every(isValidAssetId)) {
    throw new MediaServiceError('MEDIA_NOT_FOUND', 'Media tidak ditemukan.', 400);
  }
  if (!isMediaPurpose(context.purpose)) {
    throw new MediaServiceError(
      'MEDIA_PURPOSE_MISMATCH',
      'Media tidak sesuai dengan tujuan penggunaannya.',
      400,
    );
  }
  const ref = normalizeReference(context.reference);

  const sorted = [...ids].sort();
  const assets = await lockAssetsForUpdate(tx, sorted);
  if (assets.length === 0) return;

  if (assets.some((a) => a.purpose !== context.purpose)) {
    throw new MediaServiceError(
      'MEDIA_PURPOSE_MISMATCH',
      'Media tidak sesuai dengan tujuan penggunaannya.',
      400,
    );
  }

  const existingIds = assets.map((a) => a.id);
  await tx.mediaAssetReference.deleteMany({
    where: {
      assetId: { in: existingIds },
      referenceType: ref.referenceType,
      referenceId: ref.referenceId,
      slot: ref.slot,
    },
  });

  for (const asset of assets) {
    if (asset.attachedAt === null) {
      // Already unattached: leave detachedAt untouched so cleanup clock does not move.
      continue;
    }
    const remainingReferences = await tx.mediaAssetReference.count({
      where: { assetId: asset.id },
    });
    if (remainingReferences === 0) {
      await tx.mediaAsset.updateMany({
        where: { id: asset.id },
        data: { attachedAt: null, detachedAt: now },
      });
    }
  }
}
