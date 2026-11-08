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

export type MediaTransactionClient = Pick<Prisma.TransactionClient, 'mediaAsset' | '$queryRaw'>;

export interface MediaAttachContext {
  /** The purpose the referencing content slot accepts. Assets of any other purpose are refused. */
  purpose: MediaPurpose;
}

async function loadAndCheck(
  tx: MediaTransactionClient,
  assetIds: readonly string[],
  context: MediaAttachContext,
): Promise<string[]> {
  const ids = [...new Set(assetIds)];
  if (ids.length === 0) return ids;
  if (!ids.every(isValidAssetId)) {
    throw new MediaServiceError('MEDIA_NOT_FOUND', 'Media tidak ditemukan.', 400);
  }
  const sorted = [...ids].sort();
  const locked = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM media_assets WHERE id IN (${Prisma.join(sorted)}) FOR UPDATE`,
  );
  if (locked.length !== sorted.length) {
    throw new MediaServiceError('MEDIA_NOT_FOUND', 'Media tidak ditemukan.', 400);
  }
  const assets = await tx.mediaAsset.findMany({ where: { id: { in: sorted } } });
  if (assets.length !== sorted.length) {
    throw new MediaServiceError('MEDIA_NOT_FOUND', 'Media tidak ditemukan.', 400);
  }
  if (!isMediaPurpose(context.purpose) || assets.some((a) => a.purpose !== context.purpose)) {
    throw new MediaServiceError(
      'MEDIA_PURPOSE_MISMATCH',
      'Media tidak sesuai dengan tujuan penggunaannya.',
      400,
    );
  }
  return sorted;
}

/**
 * Publishes assets: sets attachedAt so the public delivery routes start serving them. Validates
 * that every id exists and was uploaded for `context.purpose`. Idempotent for already-attached
 * assets (their original attachedAt is kept). Throws MediaServiceError (400) otherwise, which
 * rolls back the caller's transaction.
 *
 * `loadAndCheck` acquires an exclusive row lock (`SELECT id ... FOR UPDATE`) in ascending id order
 * across all targets. Under InnoDB REPEATABLE READ, this row lock serializes concurrent attachments,
 * detachments, and cleanup's `deleteMany` operations, avoiding concurrency races and deadlock.
 *
 * The recount below is retained as defense-in-depth: if an unattached row was deleted by cleanup
 * before this transaction acquired the row lock, the recount detects the missing row and triggers
 * a rollback instead of leaving a dangling reference.
 */
export async function attachMedia(
  tx: MediaTransactionClient,
  assetIds: readonly string[],
  context: MediaAttachContext,
  now: Date = new Date(),
): Promise<void> {
  const ids = await loadAndCheck(tx, assetIds, context);
  if (ids.length === 0) return;

  await tx.mediaAsset.updateMany({
    where: { id: { in: ids }, attachedAt: null },
    // detachedAt is cleared too: a re-attached asset is no longer in its cleanup grace period.
    data: { attachedAt: now, detachedAt: null },
  });

  // Defense-in-depth recount: ensure no row was concurrently removed before the lock.
  const stillThere = await tx.mediaAsset.count({ where: { id: { in: ids } } });
  if (stillThere !== ids.length) {
    throw new MediaServiceError('MEDIA_NOT_FOUND', 'Media tidak ditemukan.', 400);
  }
}

/**
 * Takes assets back out of public delivery (attachedAt = null) and stamps detachedAt. The next
 * `media:cleanup` run removes them once COALESCE(detachedAt, createdAt) is older than its grace
 * period — measured from the detach, not the upload, so an old asset that content just swapped
 * out keeps its full grace period (e.g. to undo the change). Already-unattached assets keep
 * their existing detachedAt, so repeating a detach never extends the clock.
 */
export async function detachMedia(
  tx: MediaTransactionClient,
  assetIds: readonly string[],
  context: MediaAttachContext,
  now: Date = new Date(),
): Promise<void> {
  const ids = await loadAndCheck(tx, assetIds, context);
  if (ids.length === 0) return;
  await tx.mediaAsset.updateMany({
    where: { id: { in: ids }, attachedAt: { not: null } },
    data: { attachedAt: null, detachedAt: now },
  });
}
