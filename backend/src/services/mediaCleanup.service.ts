import { lstat, readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import prisma from '../utils/prisma.js';
import { DERIVATIVES_DIR, STAGING_DIR, lexicalResolve } from '../utils/mediaStorage.js';
import { isInsideOrEqual } from '../utils/uploadRoot.js';
import { AUDIT_ACTIONS, recordAuditLog, type AuditEntry } from './audit.service.js';

type ErrnoError = Error & { code?: string };

export const DEFAULT_MEDIA_CLEANUP_GRACE_HOURS = 24;
const ASSET_BATCH_SIZE = 200;

/**
 * Unattached AND past the grace period. An unattached asset's age runs from the moment it was
 * detached (COALESCE(detachedAt, createdAt) < cutoff); one that was never attached is aged from
 * its upload. Shared by the scan and the guarded delete so both agree on what is collectable.
 */
function collectableWhere(cutoff: Date) {
  return {
    attachedAt: null,
    OR: [{ detachedAt: { lt: cutoff } }, { detachedAt: null, createdAt: { lt: cutoff } }],
  };
}

export interface MediaCleanupClient {
  mediaAsset: Pick<typeof prisma.mediaAsset, 'findMany' | 'count' | 'deleteMany'>;
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
  /**
   * Assets that content attached after their files were already removed (the residual window
   * documented on runMediaCleanup). They now serve 404 MEDIA_FILE_MISSING and need re-uploading.
   */
  assetsRaced: number;
  dryRun: boolean;
}

/** Removes a root-relative file or directory, refusing anything that resolves outside the root. */
async function removeInsideRoot(
  root: string,
  key: string,
  recursive: boolean,
): Promise<'removed' | 'failed'> {
  const lexical = lexicalResolve(root, key);
  if (!lexical) return 'failed';
  try {
    // A symlinked parent could redirect the delete elsewhere; check the real parent first.
    const parent = await realpath(path.dirname(lexical)).catch((error: ErrnoError) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (parent === null) return 'removed'; // nothing there
    if (!isInsideOrEqual(root, parent)) return 'failed';
    await rm(path.join(parent, path.basename(lexical)), { recursive, force: true });
    return 'removed';
  } catch (error) {
    console.error(`Gagal menghapus berkas media (${key}):`, (error as Error).message);
    return 'failed';
  }
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
 * their files whose grace period (measured from detachment, else upload) has passed. Safe to
 * re-run: every step tolerates already-missing files.
 *
 * Ordering per asset: files first, row second. Deleting the row first would turn a failed file
 * delete into a permanent orphan (nothing references the file any more, so no later run finds
 * it). With files first, a failed delete keeps the row and the next run simply retries.
 *
 * Race safety: `attachMedia` and `detachMedia` take an exclusive `SELECT ... FOR UPDATE` row lock
 * in ascending id order, serializing concurrent attachments against database mutations. The cleanup
 * job deletes files before deleting the database row so that failed file deletions do not produce
 * uncollectable orphans. Because cleanup intentionally does not hold database row locks across
 * disk I/O, the row is re-verified as still collectable (`attached_at IS NULL`, age condition)
 * immediately before any file is touched, and the final row delete repeats that condition. If an
 * `attachMedia` transaction acquires its `FOR UPDATE` lock after cleanup re-verification but commits
 * before the row delete, the row delete matches nothing, the asset is counted in `assetsRaced` and
 * logged, and `attachMedia`'s recount ensures safety. The asset serves a plain 404
 * (MEDIA_FILE_MISSING) until re-uploaded. That is the deliberate trade-off of removing files before
 * the DB row without holding database locks across slow file I/O.
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
  let assetsRaced = 0;
  let lastId = '';

  for (;;) {
    const batch = await client.mediaAsset.findMany({
      where: { ...collectableWhere(cutoff), id: { gt: lastId } },
      orderBy: { id: 'asc' },
      take: ASSET_BATCH_SIZE,
      select: { id: true, storageKey: true },
    });
    if (batch.length === 0) break;

    for (const asset of batch) {
      lastId = asset.id;
      if (dryRun) {
        assetsRemoved += 1;
        continue;
      }

      // Re-verify right before touching files: attached (or re-detached) since the scan -> skip.
      const stillCollectable = await client.mediaAsset.count({
        where: { id: asset.id, ...collectableWhere(cutoff) },
      });
      if (stillCollectable !== 1) continue;

      const results = await Promise.all([
        removeInsideRoot(options.root, asset.storageKey, false),
        removeInsideRoot(options.root, `${DERIVATIVES_DIR}/${asset.id}`, true),
      ]);
      const failed = results.filter((r) => r === 'failed').length;
      if (failed > 0) {
        // Keep the row so the next run retries; nothing is orphaned.
        filesFailed += failed;
        assetsRetained += 1;
        continue;
      }

      const { count } = await client.mediaAsset.deleteMany({
        where: { id: asset.id, ...collectableWhere(cutoff) },
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

  if (!dryRun && stagingRemoved + assetsRemoved + filesFailed + assetsRaced > 0) {
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
        assetsRaced,
        graceHours: Math.round(options.graceMs / 3_600_000),
      },
    });
  }

  return { stagingRemoved, assetsRemoved, filesFailed, assetsRetained, assetsRaced, dryRun };
}
