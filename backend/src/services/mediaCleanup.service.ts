import { lstat, readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import prisma from '../utils/prisma.js';
import { DERIVATIVES_DIR, STAGING_DIR, lexicalResolve } from '../utils/mediaStorage.js';
import { isInsideOrEqual } from '../utils/uploadRoot.js';
import { AUDIT_ACTIONS, recordAuditLog, type AuditEntry } from './audit.service.js';

type ErrnoError = Error & { code?: string };

export const DEFAULT_MEDIA_CLEANUP_GRACE_HOURS = 24;
const ASSET_BATCH_SIZE = 200;

export interface MediaCleanupClient {
  mediaAsset: Pick<typeof prisma.mediaAsset, 'findMany' | 'deleteMany'>;
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
  assetsRemoved: number;
  filesFailed: number;
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
 * their files older than the grace period. Safe to re-run: every step tolerates already-missing
 * files, and a row is deleted with `attached_at IS NULL` in the WHERE so an asset that content
 * attached in the meantime is never removed. The row goes first and files second; the reverse
 * order could leave an attached asset pointing at a deleted file.
 */
export async function runMediaCleanup(options: MediaCleanupOptions): Promise<MediaCleanupResult> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const client: MediaCleanupClient = options.client ?? prisma;
  const cutoff = new Date(now.getTime() - options.graceMs);

  const stagingRemoved = await cleanStaging(options.root, cutoff.getTime(), dryRun);

  let assetsRemoved = 0;
  let filesFailed = 0;
  let lastId = '';

  for (;;) {
    const batch = await client.mediaAsset.findMany({
      where: { attachedAt: null, createdAt: { lt: cutoff }, id: { gt: lastId } },
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
      const { count } = await client.mediaAsset.deleteMany({
        where: { id: asset.id, attachedAt: null },
      });
      if (count !== 1) continue; // attached (or removed) in the meantime
      assetsRemoved += 1;

      const results = await Promise.all([
        removeInsideRoot(options.root, asset.storageKey, false),
        removeInsideRoot(options.root, `${DERIVATIVES_DIR}/${asset.id}`, true),
      ]);
      filesFailed += results.filter((r) => r === 'failed').length;
    }
  }

  if (!dryRun && stagingRemoved + assetsRemoved > 0) {
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
        graceHours: Math.round(options.graceMs / 3_600_000),
      },
    });
  }

  return { stagingRemoved, assetsRemoved, filesFailed, dryRun };
}
