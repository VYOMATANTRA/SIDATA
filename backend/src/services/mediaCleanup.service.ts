import { lstat, readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { Prisma } from '../../generated/prisma/client.js';
import prisma from '../utils/prisma.js';
import { DERIVATIVES_DIR, STAGING_DIR, lexicalResolve } from '../utils/mediaStorage.js';
import { isInsideOrEqual } from '../utils/uploadRoot.js';
import { AUDIT_ACTIONS, recordAuditLog, type AuditEntry } from './audit.service.js';

type ErrnoError = Error & { code?: string };

export const DEFAULT_MEDIA_CLEANUP_GRACE_HOURS = 24;
const ASSET_BATCH_SIZE = 200;

/**
 * Candidates for cleanup:
 * (a) rows already irreversibly claimed (`cleanupClaimedAt IS NOT NULL`) on an earlier interrupted
 *     or failed run, and
 * (b) unclaimed unattached rows whose grace period (measured from `COALESCE(detachedAt, createdAt)`)
 *     has elapsed.
 * Quarantined rows (`cleanupQuarantineReason IS NOT NULL`) are always excluded.
 */
function collectableWhere(cutoff: Date) {
  return {
    cleanupQuarantineReason: null,
    OR: [
      { cleanupClaimedAt: { not: null } },
      {
        attachedAt: null,
        cleanupClaimedAt: null,
        OR: [{ detachedAt: { lt: cutoff } }, { detachedAt: null, createdAt: { lt: cutoff } }],
      },
    ],
  };
}

export interface MediaCleanupTransactionClient {
  $queryRaw?: Prisma.TransactionClient['$queryRaw'];
  mediaAsset: Pick<typeof prisma.mediaAsset, 'findMany' | 'count' | 'updateMany' | 'deleteMany'>;
  mediaAssetReference?: Pick<typeof prisma.mediaAssetReference, 'count'>;
}

export interface MediaCleanupClient extends MediaCleanupTransactionClient {
  $transaction?: <T>(fn: (tx: MediaCleanupTransactionClient) => Promise<T>) => Promise<T>;
}

export interface MediaCleanupOptions {
  /** Canonical upload root (realpath). */
  root: string;
  graceMs: number;
  now?: Date;
  dryRun?: boolean;
  client?: MediaCleanupClient;
  recordAudit?: (entry: AuditEntry) => Promise<void>;
}

export interface MediaCleanupResult {
  stagingRemoved: number;
  /** Rows deleted together with all their files. */
  assetsRemoved: number;
  /** File/directory removals that failed. The row is kept and the next run retries. */
  filesFailed: number;
  /** Rows kept because at least one of their files could not be removed (retried next run). */
  assetsRetained: number;
  /** Assets quarantined due to invalid storage paths outside root. */
  assetsQuarantined: number;
  /**
   * Assets that content attached after their files were already removed (the residual window
   * documented on runMediaCleanup). They now serve 404 MEDIA_FILE_MISSING and need re-uploading.
   */
  assetsRaced: number;
  dryRun: boolean;
}

/** Validates that a root-relative path resolves inside `root` before claiming deletion. */
async function validateInsideRoot(root: string, key: string): Promise<'valid' | 'invalid-path'> {
  const lexical = lexicalResolve(root, key);
  if (!lexical) {
    console.warn(`Jalur berkas media (${key}) tidak valid secara leksikal.`);
    return 'invalid-path';
  }
  try {
    const parent = await realpath(path.dirname(lexical)).catch((error: ErrnoError) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (parent !== null && !isInsideOrEqual(root, parent)) {
      console.warn(`Jalur berkas media (${key}) berada di luar direktori upload.`);
      return 'invalid-path';
    }
    return 'valid';
  } catch {
    return 'valid';
  }
}

/** Removes a root-relative file or directory, refusing anything that resolves outside the root. */
async function removeInsideRoot(
  root: string,
  key: string,
  recursive: boolean,
): Promise<'removed' | 'failed' | 'invalid-path'> {
  const lexical = lexicalResolve(root, key);
  if (!lexical) {
    console.warn(`Jalur berkas media (${key}) tidak valid secara leksikal.`);
    return 'invalid-path';
  }
  try {
    // A symlinked parent could redirect the delete elsewhere; check the real parent first.
    const parent = await realpath(path.dirname(lexical)).catch((error: ErrnoError) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (parent === null) return 'removed'; // nothing there
    if (!isInsideOrEqual(root, parent)) {
      console.warn(`Jalur berkas media (${key}) berada di luar direktori upload.`);
      return 'invalid-path';
    }
    await rm(path.join(parent, path.basename(lexical)), { recursive, force: true });
    return 'removed';
  } catch (error) {
    console.error(`Gagal menghapus berkas media (${key}):`, (error as Error).message);
    return 'failed';
  }
}

async function claimAssetForCleanup(
  client: MediaCleanupClient,
  assetId: string,
  cutoff: Date,
  now: Date,
): Promise<boolean> {
  const runClaim = async (tx: MediaCleanupTransactionClient): Promise<boolean> => {
    if (tx.$queryRaw) {
      const locked = await tx.$queryRaw<
        Array<{
          id: string;
          attachedAt?: Date | null;
          detachedAt?: Date | null;
          createdAt?: Date;
          cleanupClaimedAt?: Date | null;
          cleanupQuarantineReason?: string | null;
        }>
      >(
        Prisma.sql`SELECT id, attached_at AS attachedAt, detached_at AS detachedAt, created_at AS createdAt, cleanup_claimed_at AS cleanupClaimedAt, cleanup_quarantine_reason AS cleanupQuarantineReason FROM media_assets WHERE id = ${assetId} FOR UPDATE`,
      );
      if (locked.length === 0) return false;
      const row = locked[0]!;
      if ('attachedAt' in row && 'createdAt' in row) {
        if (row.cleanupQuarantineReason !== null && row.cleanupQuarantineReason !== undefined) {
          return false;
        }
        if (row.cleanupClaimedAt !== null && row.cleanupClaimedAt !== undefined) {
          return true;
        }
        if (row.attachedAt !== null && row.attachedAt !== undefined) {
          return false;
        }
        const detachedAt = row.detachedAt ?? null;
        const createdAt = row.createdAt!;
        const graceElapsed = detachedAt !== null ? detachedAt < cutoff : createdAt < cutoff;
        if (!graceElapsed) return false;
      }
    }

    if (tx.mediaAssetReference) {
      const refCount = await tx.mediaAssetReference.count({ where: { assetId } });
      if (refCount > 0) return false;
    }

    const claimed = await tx.mediaAsset.updateMany({
      where: {
        id: assetId,
        attachedAt: null,
        cleanupClaimedAt: null,
        cleanupQuarantineReason: null,
        OR: [{ detachedAt: { lt: cutoff } }, { detachedAt: null, createdAt: { lt: cutoff } }],
      },
      data: { cleanupClaimedAt: now },
    });
    return claimed.count === 1;
  };

  if (client.$transaction) {
    return client.$transaction(runClaim);
  }
  return runClaim(client);
}

async function cleanStaging(root: string, cutoffMs: number, dryRun: boolean): Promise<number> {
  const stagingRoot = path.join(root, STAGING_DIR);
  let entries: string[];
  try {
    entries = await readdir(stagingRoot);
  } catch (error) {
    if ((error as ErrnoError).code === 'ENOENT') return 0;
    throw error;
  }

  let removed = 0;
  for (const name of entries) {
    const entryPath = path.join(stagingRoot, name);
    try {
      const info = await lstat(entryPath);
      if (info.mtimeMs >= cutoffMs) continue;
      if (!dryRun) await rm(entryPath, { recursive: true, force: true });
      removed += 1;
    } catch (error) {
      console.error(`Gagal membersihkan staging (${name}):`, (error as Error).message);
    }
  }
  return removed;
}

/**
 * Deletes (a) staging directories older than the grace period and (b) unattached asset rows and
 * their files whose grace period (measured from detachment, else upload) has passed, as well as
 * previously claimed rows whose file deletion was interrupted. Safe to re-run: every step
 * tolerates already-missing files.
 *
 * Ordering per asset:
 * 1. Validate paths inside root; if invalid, quarantine (`cleanupQuarantineReason = 'invalid-path'`)
 *    without claiming deletion.
 * 2. If not yet claimed, lock the row `FOR UPDATE` in a short transaction, verify zero references
 *    in `media_asset_references`, `attachedAt === null`, and elapsed grace, and commit an
 *    irreversible `cleanupClaimedAt = now` BEFORE unlinking any files.
 * 3. Remove original and derivative files. If unlink fails, keep `cleanupClaimedAt` set (never
 *    reset to null) so a partially deleted asset cannot be attached and will be retried on the
 *    next cleanup run.
 * 4. Once all files are absent, delete the `media_assets` row.
 */
export async function runMediaCleanup(options: MediaCleanupOptions): Promise<MediaCleanupResult> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const client: MediaCleanupClient = options.client ?? prisma;
  const cutoff = new Date(now.getTime() - options.graceMs);

  const stagingRemoved = await cleanStaging(options.root, cutoff.getTime(), dryRun);

  let assetsRemoved = 0;
  let filesFailed = 0;
  let assetsRetained = 0;
  let assetsQuarantined = 0;
  let assetsRaced = 0;
  let lastId = '';

  for (;;) {
    const batch = await client.mediaAsset.findMany({
      where: { ...collectableWhere(cutoff), id: { gt: lastId } },
      orderBy: { id: 'asc' },
      take: ASSET_BATCH_SIZE,
      select: { id: true, storageKey: true, cleanupClaimedAt: true },
    });
    if (batch.length === 0) break;

    for (const asset of batch) {
      lastId = asset.id;
      if (dryRun) {
        assetsRemoved += 1;
        continue;
      }

      // 1. Validate paths before claiming deletion.
      const pathChecks = await Promise.all([
        validateInsideRoot(options.root, asset.storageKey),
        validateInsideRoot(options.root, `${DERIVATIVES_DIR}/${asset.id}`),
      ]);
      if (pathChecks.some((r) => r === 'invalid-path')) {
        await client.mediaAsset.updateMany({
          where: { id: asset.id },
          data: { cleanupQuarantineReason: 'invalid-path' },
        });
        assetsQuarantined += 1;
        continue;
      }

      // 2. Irreversibly claim the row inside a locking transaction before unlinking files.
      if (asset.cleanupClaimedAt === null) {
        const claimed = await claimAssetForCleanup(client, asset.id, cutoff, now);
        if (!claimed) continue;
      }

      // 3. Remove files inside root.
      const results = await Promise.all([
        removeInsideRoot(options.root, asset.storageKey, false),
        removeInsideRoot(options.root, `${DERIVATIVES_DIR}/${asset.id}`, true),
      ]);

      const hasInvalidPath = results.some((r) => r === 'invalid-path');
      if (hasInvalidPath) {
        await client.mediaAsset.updateMany({
          where: { id: asset.id },
          data: { cleanupQuarantineReason: 'invalid-path' },
        });
        assetsQuarantined += 1;
        continue;
      }

      const failed = results.filter((r) => r === 'failed').length;
      if (failed > 0) {
        // Keep cleanupClaimedAt set (never clear an irreversible deletion claim) so a partially
        // deleted asset cannot be attached and will be retried on the next cleanup run.
        filesFailed += failed;
        assetsRetained += 1;
        continue;
      }

      // 4. Delete metadata row once files are absent.
      const { count } = await client.mediaAsset.deleteMany({
        where: { id: asset.id, attachedAt: null, cleanupClaimedAt: { not: null } },
      });
      if (count === 1) {
        assetsRemoved += 1;
      } else {
        assetsRaced += 1;
        console.error(
          `Aset media ${asset.id} dilampirkan saat pembersihan berjalan; berkasnya sudah terhapus dan perlu diunggah ulang.`,
        );
      }
    }
  }

  if (
    !dryRun &&
    stagingRemoved + assetsRemoved + filesFailed + assetsRaced + assetsQuarantined > 0
  ) {
    const record = options.recordAudit ?? recordAuditLog;
    await record({
      action: AUDIT_ACTIONS.MEDIA_CLEANUP,
      actor: null,
      target: { type: 'media_asset', id: null, label: 'cleanup' },
      // Counts only: never ids, names or paths.
      metadata: {
        stagingRemoved,
        assetsRemoved,
        filesFailed,
        assetsRetained,
        assetsQuarantined,
        assetsRaced,
        graceHours: Math.round(options.graceMs / 3_600_000),
      },
    });
  }

  return {
    stagingRemoved,
    assetsRemoved,
    filesFailed,
    assetsRetained,
    assetsQuarantined,
    assetsRaced,
    dryRun,
  };
}
