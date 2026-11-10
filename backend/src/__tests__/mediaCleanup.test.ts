import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  DEFAULT_MEDIA_CLEANUP_GRACE_HOURS,
  runMediaCleanup,
  type MediaCleanupClient,
} from '../services/mediaCleanup.service.js';
import type { AuditEntry } from '../services/audit.service.js';
import { UPLOAD_SUBDIRS } from '../utils/uploadRoot.js';
import { parseGraceHours } from '../../scripts/cleanup-media.js';
import {
  attachMedia,
  detachMedia,
  type MediaTransactionClient,
} from '../services/media.service.js';
import { makeAsset } from './helpers/mediaDbStub.js';
import type { MediaAsset } from '../../generated/prisma/client.js';

const HOUR = 3_600_000;
const NOW = new Date('2026-06-10T12:00:00Z');
const GRACE = 24 * HOUR;

let sandbox: string;
let root: string;

beforeEach(async () => {
  sandbox = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sidata-cleanup-')));
  root = path.join(sandbox, 'uploads');
  for (const sub of UPLOAD_SUBDIRS) await mkdir(path.join(root, sub), { recursive: true });
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

async function stagingDir(name: string, ageMs: number): Promise<string> {
  const dir = path.join(root, '_staging', name);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'upload.bin'), 'x');
  const when = new Date(NOW.getTime() - ageMs);
  await utimes(dir, when, when);
  return dir;
}

async function putAssetFiles(asset: MediaAsset): Promise<{ file: string; derivative: string }> {
  const file = path.join(root, ...asset.storageKey.split('/'));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, 'bytes');
  const derivative = path.join(root, 'derivatives', asset.id, 'thumbnail.webp');
  await mkdir(path.dirname(derivative), { recursive: true });
  await writeFile(derivative, 'thumb');
  return { file, derivative };
}

interface CollectableClause {
  cleanupClaimedAt?: null | { not: null };
  attachedAt?: null | Date;
  detachedAt?: null | { lt: Date };
  createdAt?: { lt: Date };
  OR?: CollectableClause[];
}

interface CollectableWhere {
  attachedAt?: null | Date;
  cleanupClaimedAt?: null | { not: null };
  cleanupQuarantineReason?: string | null;
  OR?: CollectableClause[];
  id?: string | { gt?: string; in?: string[] };
}

function matchAgeOr(row: MediaAsset, clauses: CollectableClause[]): boolean {
  return clauses.some((c) =>
    c.createdAt
      ? row.detachedAt === null && row.createdAt < c.createdAt.lt
      : c.detachedAt && 'lt' in c.detachedAt
        ? row.detachedAt !== null && row.detachedAt < c.detachedAt.lt
        : false,
  );
}

/** Evaluates the cleanup's where-clause the way MySQL would. */
function collectable(row: MediaAsset, where: CollectableWhere): boolean {
  if (where.attachedAt === null && row.attachedAt !== null) return false;
  if (where.cleanupClaimedAt === null && row.cleanupClaimedAt !== null) return false;
  if (
    where.cleanupClaimedAt &&
    typeof where.cleanupClaimedAt === 'object' &&
    'not' in where.cleanupClaimedAt &&
    row.cleanupClaimedAt === null
  ) {
    return false;
  }
  if (where.cleanupQuarantineReason === null && row.cleanupQuarantineReason !== null) return false;

  if (Array.isArray(where.OR)) {
    return where.OR.some((clause) => {
      if (
        clause.cleanupClaimedAt &&
        typeof clause.cleanupClaimedAt === 'object' &&
        'not' in clause.cleanupClaimedAt
      ) {
        return row.cleanupClaimedAt !== null;
      }
      if (clause.cleanupClaimedAt === null || clause.attachedAt === null) {
        if (clause.attachedAt === null && row.attachedAt !== null) return false;
        if (clause.cleanupClaimedAt === null && row.cleanupClaimedAt !== null) return false;
        if (Array.isArray(clause.OR)) {
          return matchAgeOr(row, clause.OR);
        }
        return true;
      }
      if (clause.createdAt) {
        return row.detachedAt === null && row.createdAt < clause.createdAt.lt;
      }
      if (clause.detachedAt && 'lt' in clause.detachedAt) {
        return row.detachedAt !== null && row.detachedAt < clause.detachedAt.lt;
      }
      return false;
    });
  }

  return true;
}

interface StoredRef {
  assetId: string;
  referenceType: string;
  referenceId: string;
  slot: string;
}

function fakeClient(assets: MediaAsset[], opts: { raceLoses?: Set<string> } = {}) {
  const rows = new Map(assets.map((a) => [a.id, a]));
  const references = new Map<string, StoredRef>();
  const deletes: string[] = [];
  const client: MediaCleanupClient = {
    $transaction: async (fn) => fn(client),
    $queryRaw: (async (query: unknown) => {
      const values = (query as { values?: unknown[] })?.values ?? [];
      const requestedIds = values.filter((v): v is string => typeof v === 'string');
      return requestedIds.flatMap((id) => {
        const row = rows.get(id);
        if (!row) return [];
        return [
          {
            id: row.id,
            attachedAt: row.attachedAt,
            detachedAt: row.detachedAt,
            createdAt: row.createdAt,
            cleanupClaimedAt: row.cleanupClaimedAt,
            cleanupQuarantineReason: row.cleanupQuarantineReason,
          },
        ];
      });
    }) as never,
    mediaAssetReference: {
      count: (async (args: { where: { assetId: string } }) =>
        [...references.values()].filter((r) => r.assetId === args.where.assetId).length) as never,
    },
    mediaAsset: {
      findMany: (async (args: {
        where: CollectableWhere & { id?: { gt: string } };
        take: number;
      }) =>
        [...rows.values()]
          .filter(
            (a) => collectable(a, args.where) && (!args.where.id?.gt || a.id > args.where.id.gt),
          )
          .sort((x, y) => x.id.localeCompare(y.id))
          .slice(0, args.take)) as never,
      count: (async (args: { where: CollectableWhere & { id: string } }) => {
        const row = rows.get(args.where.id);
        return row && collectable(row, args.where) ? 1 : 0;
      }) as never,
      updateMany: (async (args: { where: CollectableWhere; data: Partial<MediaAsset> }) => {
        const idVal = args.where.id;
        const targetIds =
          typeof idVal === 'string'
            ? [idVal]
            : idVal && typeof idVal === 'object' && Array.isArray(idVal.in)
              ? idVal.in
              : [];
        let count = 0;
        for (const targetId of targetIds) {
          const row = rows.get(targetId);
          if (!row) continue;
          if (!collectable(row, args.where)) continue;
          if (args.data.cleanupClaimedAt !== undefined)
            row.cleanupClaimedAt = args.data.cleanupClaimedAt;
          if (args.data.cleanupQuarantineReason !== undefined)
            row.cleanupQuarantineReason = args.data.cleanupQuarantineReason;
          count += 1;
        }
        return { count };
      }) as never,
      deleteMany: (async (args: {
        where: CollectableWhere & { id: string; cleanupClaimedAt?: { not: null } };
      }) => {
        const row = rows.get(args.where.id);
        if (opts.raceLoses?.has(args.where.id)) {
          if (row) row.attachedAt = NOW; // attached between the read and the delete
        }
        if (!row) return { count: 0 };
        if (args.where.attachedAt !== undefined && row.attachedAt !== args.where.attachedAt)
          return { count: 0 };
        if (args.where.cleanupClaimedAt?.not !== undefined && row.cleanupClaimedAt === null)
          return { count: 0 };
        rows.delete(args.where.id);
        deletes.push(args.where.id);
        return { count: 1 };
      }) as never,
    },
  };
  return { client, rows, references, deletes };
}

const noAudit = () => {
  const entries: AuditEntry[] = [];
  return { entries, record: async (entry: AuditEntry) => void entries.push(entry) };
};

const ID_OLD = '00000000-0000-4000-8000-000000000001';
const ID_NEW = '00000000-0000-4000-8000-000000000002';
const ID_ATT = '00000000-0000-4000-8000-000000000003';
const OLD = new Date(NOW.getTime() - 48 * HOUR);
const FRESH = new Date(NOW.getTime() - 1 * HOUR);

const asset = (id: string, extra: Partial<MediaAsset> = {}) =>
  makeAsset({ id, storageKey: `photos/cerita/u1/${id}.webp`, createdAt: OLD, ...extra });

describe('runMediaCleanup: staging', () => {
  it('removes staging directories older than the grace period and keeps recent ones', async () => {
    const stale = await stagingDir('stale', 30 * HOUR);
    const recent = await stagingDir('recent', 2 * HOUR);
    const { client } = fakeClient([]);
    const audit = noAudit();
    const result = await runMediaCleanup({
      root,
      graceMs: GRACE,
      now: NOW,
      client,
      recordAudit: audit.record,
    });
    assert.equal(result.stagingRemoved, 1);
    assert.equal(existsSync(stale), false);
    assert.equal(existsSync(recent), true);
  });

  it('is safe to re-run: the second pass finds nothing', async () => {
    await stagingDir('stale', 30 * HOUR);
    const { client } = fakeClient([asset(ID_OLD)]);
    await putAssetFiles(asset(ID_OLD));
    const audit = noAudit();
    const options = { root, graceMs: GRACE, now: NOW, client, recordAudit: audit.record };
    const first = await runMediaCleanup(options);
    const second = await runMediaCleanup(options);
    assert.deepEqual([first.stagingRemoved, first.assetsRemoved], [1, 1]);
    assert.deepEqual([second.stagingRemoved, second.assetsRemoved], [0, 0]);
    assert.equal(audit.entries.length, 1, 'a no-op run writes no audit row');
  });

  it('copes with a missing _staging directory', async () => {
    await rm(path.join(root, '_staging'), { recursive: true });
    const { client } = fakeClient([]);
    const result = await runMediaCleanup({ root, graceMs: GRACE, now: NOW, client });
    assert.equal(result.stagingRemoved, 0);
  });

  it('never follows a symlink planted in _staging', async () => {
    const victim = path.join(sandbox, 'victim');
    await mkdir(victim);
    await writeFile(path.join(victim, 'keep.txt'), 'keep');
    const link = path.join(root, '_staging', 'link');
    await symlink(victim, link);
    const old = new Date(NOW.getTime() - 40 * HOUR);
    const { lutimes } = await import('node:fs/promises');
    await lutimes(link, old, old);
    const { client } = fakeClient([]);
    await runMediaCleanup({
      root,
      graceMs: GRACE,
      now: NOW,
      client,
      recordAudit: noAudit().record,
    });
    assert.equal(existsSync(link), false, 'the link itself is removed');
    assert.equal(existsSync(path.join(victim, 'keep.txt')), true, 'its target is untouched');
  });
});

describe('runMediaCleanup: unattached assets', () => {
  it('deletes old unattached rows with their file and derivatives; keeps fresh and attached ones', async () => {
    const oldAsset = asset(ID_OLD);
    const freshAsset = asset(ID_NEW, { createdAt: FRESH });
    const attached = asset(ID_ATT, { attachedAt: new Date(NOW.getTime() - 40 * HOUR) });
    const oldFiles = await putAssetFiles(oldAsset);
    const freshFiles = await putAssetFiles(freshAsset);
    const attachedFiles = await putAssetFiles(attached);
    const { client, deletes } = fakeClient([oldAsset, freshAsset, attached]);
    const audit = noAudit();

    const result = await runMediaCleanup({
      root,
      graceMs: GRACE,
      now: NOW,
      client,
      recordAudit: audit.record,
    });

    assert.equal(result.assetsRemoved, 1);
    assert.deepEqual(deletes, [ID_OLD]);
    assert.equal(existsSync(oldFiles.file), false);
    assert.equal(existsSync(oldFiles.derivative), false);
    assert.equal(existsSync(path.dirname(oldFiles.derivative)), false);
    assert.equal(existsSync(freshFiles.file), true);
    assert.equal(existsSync(attachedFiles.file), true);
    assert.equal(existsSync(attachedFiles.derivative), true);
  });

  it('never deletes an asset attached before its files are touched (re-verified under FOR UPDATE lock)', async () => {
    const attachedMeanwhile = asset(ID_OLD);
    const files = await putAssetFiles(attachedMeanwhile);
    const { client, rows } = fakeClient([attachedMeanwhile]);
    // Attached after the scan but before the locking claim transaction reads the row.
    const originalQueryRaw = client.$queryRaw!;
    client.$queryRaw = (async (...args: unknown[]) => {
      rows.get(ID_OLD)!.attachedAt = NOW;
      return (originalQueryRaw as (...a: unknown[]) => Promise<unknown>)(...args);
    }) as never;
    const result = await runMediaCleanup({
      root,
      graceMs: GRACE,
      now: NOW,
      client,
      recordAudit: noAudit().record,
    });
    assert.equal(result.assetsRemoved, 0);
    assert.equal(result.assetsRaced, 0);
    assert.equal(rows.get(ID_OLD)!.cleanupClaimedAt, null, 'claim was rejected');
    assert.equal(existsSync(files.file), true, 'files untouched');
    assert.equal(existsSync(files.derivative), true);
    assert.equal(rows.has(ID_OLD), true);
  });

  it('reports (and keeps the row of) an asset attached in the residual window after file removal', async () => {
    const racy = asset(ID_OLD);
    const files = await putAssetFiles(racy);
    const { client, rows } = fakeClient([racy], { raceLoses: new Set([ID_OLD]) });
    const audit = noAudit();
    const logged: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void logged.push(args);
    let result;
    try {
      result = await runMediaCleanup({
        root,
        graceMs: GRACE,
        now: NOW,
        client,
        recordAudit: audit.record,
      });
    } finally {
      console.error = original;
    }
    assert.equal(result.assetsRemoved, 0);
    assert.equal(result.assetsRaced, 1);
    assert.equal(rows.has(ID_OLD), true, 'the attached row is never deleted');
    assert.equal(existsSync(files.file), false, 'documented residual window: files already gone');
    assert.equal(logged.length, 1);
    assert.equal(audit.entries.length, 1);
    assert.equal(audit.entries[0]!.metadata?.['assetsRaced'], 1);
  });

  it('tolerates files that are already gone', async () => {
    const { client } = fakeClient([asset(ID_OLD)]);
    const result = await runMediaCleanup({
      root,
      graceMs: GRACE,
      now: NOW,
      client,
      recordAudit: noAudit().record,
    });
    assert.equal(result.assetsRemoved, 1);
    assert.equal(result.filesFailed, 0);
  });

  it('refuses to delete outside the root when a row carries a hostile storage key and quarantines it without claiming deletion', async () => {
    const victim = path.join(sandbox, 'victim.webp');
    await writeFile(victim, 'keep');
    const hostile = asset(ID_OLD, { storageKey: '../victim.webp' });
    const { client, rows } = fakeClient([hostile]);
    const result = await runMediaCleanup({
      root,
      graceMs: GRACE,
      now: NOW,
      client,
      recordAudit: noAudit().record,
    });
    assert.equal(existsSync(victim), true);
    assert.equal(result.filesFailed, 0);
    assert.equal(result.assetsQuarantined, 1);
    assert.equal(rows.get(ID_OLD)?.cleanupQuarantineReason, 'invalid-path');
    assert.equal(
      rows.get(ID_OLD)?.cleanupClaimedAt,
      null,
      'invalid path is quarantined without setting cleanupClaimedAt',
    );

    // Subsequent run skips the quarantined asset
    const second = await runMediaCleanup({
      root,
      graceMs: GRACE,
      now: NOW,
      client,
      recordAudit: noAudit().record,
    });
    assert.equal(second.assetsQuarantined, 0);
    assert.equal(second.assetsRemoved, 0);
  });

  it('does not follow a symlinked parent directory out of the root and quarantines the row', async () => {
    const victimDir = path.join(sandbox, 'victim-dir');
    await mkdir(victimDir);
    await writeFile(path.join(victimDir, `${ID_OLD}.webp`), 'keep');
    await symlink(victimDir, path.join(root, 'photos', 'cerita'));
    const { client, rows } = fakeClient([
      asset(ID_OLD, { storageKey: `photos/cerita/${ID_OLD}.webp` }),
    ]);
    const result = await runMediaCleanup({
      root,
      graceMs: GRACE,
      now: NOW,
      client,
      recordAudit: noAudit().record,
    });
    assert.equal(existsSync(path.join(victimDir, `${ID_OLD}.webp`)), true);
    assert.equal(result.filesFailed, 0);
    assert.equal(result.assetsQuarantined, 1);
    assert.equal(rows.get(ID_OLD)?.cleanupQuarantineReason, 'invalid-path');
    assert.equal(rows.get(ID_OLD)?.cleanupClaimedAt, null);
  });

  it('dry run reports counts and changes nothing', async () => {
    const oldAsset = asset(ID_OLD);
    const files = await putAssetFiles(oldAsset);
    const stale = await stagingDir('stale', 30 * HOUR);
    const { client, deletes } = fakeClient([oldAsset]);
    const audit = noAudit();
    const result = await runMediaCleanup({
      root,
      graceMs: GRACE,
      now: NOW,
      client,
      dryRun: true,
      recordAudit: audit.record,
    });
    assert.deepEqual([result.stagingRemoved, result.assetsRemoved, result.dryRun], [1, 1, true]);
    assert.deepEqual(deletes, []);
    assert.equal(existsSync(files.file), true);
    assert.equal(existsSync(stale), true);
    assert.equal(audit.entries.length, 0);
  });

  it('pages through more rows than one batch', async () => {
    const many = Array.from({ length: 450 }, (_, i) =>
      asset(`00000000-0000-4000-8000-${String(i + 100).padStart(12, '0')}`),
    );
    const { client, deletes } = fakeClient(many);
    const result = await runMediaCleanup({
      root,
      graceMs: GRACE,
      now: NOW,
      client,
      recordAudit: noAudit().record,
    });
    assert.equal(result.assetsRemoved, 450);
    assert.equal(deletes.length, 450);
  });
});

describe('runMediaCleanup: files before row and irreversible cleanup claim', () => {
  function txOver(
    rows: Map<string, MediaAsset>,
    references: Map<string, StoredRef> = new Map(),
  ): MediaTransactionClient {
    const keyOf = (r: StoredRef) => `${r.referenceType}:${r.referenceId}:${r.slot}:${r.assetId}`;
    return {
      $queryRaw: async (query: unknown) => {
        const values = (query as { values?: unknown[] })?.values ?? [];
        const requestedIds = values.filter((v): v is string => typeof v === 'string');
        return requestedIds.flatMap((id) => {
          const row = rows.get(id);
          if (!row) return [];
          return [
            {
              id: row.id,
              purpose: row.purpose,
              attachedAt: row.attachedAt,
              detachedAt: row.detachedAt,
              cleanupClaimedAt: row.cleanupClaimedAt,
              cleanupQuarantineReason: row.cleanupQuarantineReason,
            },
          ];
        });
      },
      mediaAsset: {
        findMany: async (args: { where: { id: { in: string[] } } }) =>
          args.where.id.in.flatMap((id) => (rows.has(id) ? [rows.get(id)!] : [])),
        updateMany: async (args: {
          where: {
            id: string | { in: string[] };
            attachedAt?: null | { not: null };
            cleanupClaimedAt?: null;
          };
          data: { attachedAt?: Date | null; detachedAt?: Date | null };
        }) => {
          let count = 0;
          const ids =
            typeof args.where.id === 'string' ? [args.where.id] : (args.where.id?.in ?? []);
          for (const id of ids) {
            const row = rows.get(id);
            if (!row) continue;
            if (args.where.cleanupClaimedAt === null && row.cleanupClaimedAt !== null) continue;
            if (args.where.attachedAt === null && row.attachedAt !== null) continue;
            if (args.where.attachedAt && row.attachedAt === null) continue;
            if (args.data.attachedAt !== undefined) row.attachedAt = args.data.attachedAt;
            if (args.data.detachedAt !== undefined) row.detachedAt = args.data.detachedAt;
            count += 1;
          }
          return { count };
        },
        count: async (args: { where: { id: { in: string[] }; cleanupClaimedAt?: null } }) =>
          args.where.id.in.filter((id) => {
            const row = rows.get(id);
            if (!row) return false;
            if (args.where.cleanupClaimedAt === null && row.cleanupClaimedAt !== null) return false;
            return true;
          }).length,
      },
      mediaAssetReference: {
        createMany: async (args: { data: StoredRef[]; skipDuplicates?: boolean }) => {
          let count = 0;
          for (const item of args.data) {
            const k = keyOf(item);
            if (references.has(k)) {
              if (args.skipDuplicates) continue;
              throw new Error(`Duplicate ${k}`);
            }
            references.set(k, { ...item });
            count += 1;
          }
          return { count };
        },
        deleteMany: async (args: {
          where: {
            assetId: { in: string[] };
            referenceType: string;
            referenceId: string;
            slot: string;
          };
        }) => {
          let count = 0;
          for (const assetId of args.where.assetId.in) {
            const k = keyOf({
              assetId,
              referenceType: args.where.referenceType,
              referenceId: args.where.referenceId,
              slot: args.where.slot,
            });
            if (references.delete(k)) count += 1;
          }
          return { count };
        },
        count: async (args: { where: { assetId: string } }) =>
          [...references.values()].filter((r) => r.assetId === args.where.assetId).length,
      },
    } as unknown as MediaTransactionClient;
  }

  it('keeps cleanupClaimedAt set when a file cannot be removed, blocks attach, and a rerun finishes deletion', async () => {
    const oldAsset = asset(ID_OLD);
    const files = await putAssetFiles(oldAsset);
    const { client, rows, references, deletes } = fakeClient([oldAsset]);
    const audit = noAudit();
    const options = { root, graceMs: GRACE, now: NOW, client, recordAudit: audit.record };

    // A directory where the file should be makes rm(..., { recursive: false }) fail (EISDIR).
    await rm(files.file);
    await mkdir(path.join(files.file, 'blocker'), { recursive: true });
    const original = console.error;
    console.error = () => undefined;
    let first;
    try {
      first = await runMediaCleanup(options);
    } finally {
      console.error = original;
    }
    assert.equal(first.assetsRemoved, 0);
    assert.equal(first.filesFailed, 1);
    assert.equal(first.assetsRetained, 1);
    assert.deepEqual(deletes, [], 'row kept so nothing is orphaned');
    assert.equal(rows.has(ID_OLD), true);
    assert.equal(
      rows.get(ID_OLD)?.cleanupClaimedAt?.toISOString(),
      NOW.toISOString(),
      'cleanupClaimedAt remains irreversibly set after unlink failure',
    );
    assert.equal(audit.entries.length, 1, 'failures are audited with counts');
    assert.equal(audit.entries[0]!.metadata?.['filesFailed'], 1);
    assert.equal(audit.entries[0]!.metadata?.['assetsRetained'], 1);

    // Attempting to attach the claimed asset after partial unlink failure must fail
    const tx = txOver(rows, references);
    await assert.rejects(
      () => attachMedia(tx, [ID_OLD], { purpose: 'cerita' }, NOW),
      (err: unknown) => (err as { code?: string })?.code === 'MEDIA_NOT_FOUND',
    );

    // Storage becomes healthy again: the rerun picks the previously claimed row up and finishes the job.
    await rm(files.file, { recursive: true, force: true });
    const second = await runMediaCleanup(options);
    assert.equal(second.assetsRemoved, 1);
    assert.equal(second.filesFailed, 0);
    assert.deepEqual(deletes, [ID_OLD]);
    assert.equal(existsSync(files.derivative), false);
  });

  it('deletes both the files and the row on success, and removes files before the row', async () => {
    const oldAsset = asset(ID_OLD);
    const files = await putAssetFiles(oldAsset);
    const { client } = fakeClient([oldAsset]);
    let filesGoneAtRowDelete: boolean | null = null;
    const deleteMany = client.mediaAsset.deleteMany;
    (client.mediaAsset as { deleteMany: unknown }).deleteMany = (async (args: never) => {
      filesGoneAtRowDelete = !existsSync(files.file) && !existsSync(files.derivative);
      return (deleteMany as (a: never) => Promise<{ count: number }>)(args);
    }) as never;
    const result = await runMediaCleanup({
      root,
      graceMs: GRACE,
      now: NOW,
      client,
      recordAudit: noAudit().record,
    });
    assert.equal(result.assetsRemoved, 1);
    assert.equal(filesGoneAtRowDelete, true);
    assert.equal(existsSync(files.file), false);
  });

  it('leaves an attached asset and its files completely untouched', async () => {
    const attached = asset(ID_ATT, { attachedAt: new Date(NOW.getTime() - 40 * HOUR) });
    const files = await putAssetFiles(attached);
    const { client, deletes } = fakeClient([attached]);
    const result = await runMediaCleanup({
      root,
      graceMs: GRACE,
      now: NOW,
      client,
      recordAudit: noAudit().record,
    });
    assert.deepEqual([result.assetsRemoved, result.filesFailed, result.assetsRaced], [0, 0, 0]);
    assert.deepEqual(deletes, []);
    assert.equal(existsSync(files.file), true);
    assert.equal(existsSync(files.derivative), true);
  });

  it('an old asset detached just now survives cleanup; it goes only after the grace from detachedAt', async () => {
    // Uploaded 48h ago (older than the grace), attached, then swapped out 1h before NOW.
    const old = asset(ID_OLD, { attachedAt: new Date(NOW.getTime() - 40 * HOUR) });
    const files = await putAssetFiles(old);
    const { client, rows, references, deletes } = fakeClient([old]);
    references.set('default:default:default:' + ID_OLD, {
      assetId: ID_OLD,
      referenceType: 'default',
      referenceId: 'default',
      slot: 'default',
    });
    const tx = txOver(rows, references);
    await detachMedia(tx, [ID_OLD], { purpose: 'cerita' }, new Date(NOW.getTime() - 1 * HOUR));
    const run = (at: Date) =>
      runMediaCleanup({
        root,
        graceMs: GRACE,
        now: at,
        client,
        recordAudit: noAudit().record,
      });

    assert.equal((await run(NOW)).assetsRemoved, 0);
    assert.equal(existsSync(files.file), true);

    // 23h59m after the detach: still inside the grace period.
    assert.equal((await run(new Date(NOW.getTime() + 22 * HOUR + 59 * 60_000))).assetsRemoved, 0);
    assert.deepEqual(deletes, []);

    // Past the grace period measured from detachedAt: collected.
    assert.equal((await run(new Date(NOW.getTime() + 24 * HOUR))).assetsRemoved, 1);
    assert.deepEqual(deletes, [ID_OLD]);
    assert.equal(existsSync(files.file), false);
  });

  it('an asset re-attached after being detached (before cleanup claims it) is never collected', async () => {
    const old = asset(ID_OLD, { attachedAt: new Date(NOW.getTime() - 40 * HOUR) });
    const files = await putAssetFiles(old);
    const { client, rows, references } = fakeClient([old]);
    references.set('default:default:default:' + ID_OLD, {
      assetId: ID_OLD,
      referenceType: 'default',
      referenceId: 'default',
      slot: 'default',
    });
    const tx = txOver(rows, references);
    await detachMedia(tx, [ID_OLD], { purpose: 'cerita' }, new Date(NOW.getTime() - 30 * HOUR));
    await attachMedia(tx, [ID_OLD], { purpose: 'cerita' }, new Date(NOW.getTime() - 2 * HOUR));
    assert.equal(rows.get(ID_OLD)!.detachedAt, null);
    const result = await runMediaCleanup({
      root,
      graceMs: GRACE,
      now: new Date(NOW.getTime() + 100 * HOUR),
      client,
      recordAudit: noAudit().record,
    });
    assert.equal(result.assetsRemoved, 0);
    assert.equal(existsSync(files.file), true);
  });

  it('a never-attached upload is still aged from createdAt', async () => {
    const { client, deletes } = fakeClient([asset(ID_OLD)]);
    await runMediaCleanup({
      root,
      graceMs: GRACE,
      now: NOW,
      client,
      recordAudit: noAudit().record,
    });
    assert.deepEqual(deletes, [ID_OLD]);
  });
});

describe('runMediaCleanup: audit', () => {
  it('records one media.cleanup row with counts only', async () => {
    await stagingDir('stale', 30 * HOUR);
    const oldAsset = asset(ID_OLD);
    await putAssetFiles(oldAsset);
    const { client } = fakeClient([oldAsset]);
    const audit = noAudit();
    await runMediaCleanup({ root, graceMs: GRACE, now: NOW, client, recordAudit: audit.record });
    assert.equal(audit.entries.length, 1);
    const entry = audit.entries[0]!;
    assert.equal(entry.action.action, 'media.cleanup');
    assert.equal(entry.actor, null);
    assert.deepEqual(entry.metadata, {
      stagingRemoved: 1,
      assetsRemoved: 1,
      filesFailed: 0,
      assetsRetained: 0,
      assetsQuarantined: 0,
      assetsRaced: 0,
      graceHours: 24,
    });
    const serialized = JSON.stringify(entry);
    assert.equal(serialized.includes(root), false);
    assert.equal(serialized.includes(ID_OLD), false);
  });
});

describe('cleanup-media script arguments', () => {
  it('defaults to 24 hours, accepts a flag or env value, and rejects nonsense', () => {
    assert.equal(DEFAULT_MEDIA_CLEANUP_GRACE_HOURS, 24);
    assert.equal(parseGraceHours([], {}), 24);
    assert.equal(parseGraceHours(['--grace-hours=48'], {}), 48);
    assert.equal(parseGraceHours([], { MEDIA_CLEANUP_GRACE_HOURS: '72' }), 72);
    assert.equal(parseGraceHours(['--grace-hours=6'], { MEDIA_CLEANUP_GRACE_HOURS: '72' }), 6);
    assert.equal(parseGraceHours([], { MEDIA_CLEANUP_GRACE_HOURS: '  ' }), 24);
    for (const bad of ['0', '-5', 'abc', 'NaN']) {
      assert.throws(() => parseGraceHours([`--grace-hours=${bad}`], {}), /Invalid grace period/);
    }
  });
});
