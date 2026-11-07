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

function fakeClient(assets: MediaAsset[], opts: { raceLoses?: Set<string> } = {}) {
  const rows = new Map(assets.map((a) => [a.id, a]));
  const deletes: string[] = [];
  const client: MediaCleanupClient = {
    mediaAsset: {
      findMany: (async (args: {
        where: { attachedAt: null; createdAt: { lt: Date }; id: { gt: string } };
        take: number;
      }) =>
        [...rows.values()]
          .filter(
            (a) =>
              a.attachedAt === null &&
              a.createdAt < args.where.createdAt.lt &&
              a.id > args.where.id.gt,
          )
          .sort((x, y) => x.id.localeCompare(y.id))
          .slice(0, args.take)) as never,
      deleteMany: (async (args: { where: { id: string; attachedAt: null } }) => {
        const row = rows.get(args.where.id);
        if (opts.raceLoses?.has(args.where.id)) {
          if (row) row.attachedAt = NOW; // attached between the read and the delete
        }
        if (!row || row.attachedAt !== null) return { count: 0 };
        rows.delete(args.where.id);
        deletes.push(args.where.id);
        return { count: 1 };
      }) as never,
    },
  };
  return { client, rows, deletes };
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

  it('leaves files alone when the attach race is lost by the cleanup (count 0)', async () => {
    const racy = asset(ID_OLD);
    const files = await putAssetFiles(racy);
    const { client } = fakeClient([racy], { raceLoses: new Set([ID_OLD]) });
    const result = await runMediaCleanup({
      root,
      graceMs: GRACE,
      now: NOW,
      client,
      recordAudit: noAudit().record,
    });
    assert.equal(result.assetsRemoved, 0);
    assert.equal(existsSync(files.file), true);
    assert.equal(existsSync(files.derivative), true);
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

  it('refuses to delete outside the root when a row carries a hostile storage key', async () => {
    const victim = path.join(sandbox, 'victim.webp');
    await writeFile(victim, 'keep');
    const hostile = asset(ID_OLD, { storageKey: '../victim.webp' });
    const { client } = fakeClient([hostile]);
    const result = await runMediaCleanup({
      root,
      graceMs: GRACE,
      now: NOW,
      client,
      recordAudit: noAudit().record,
    });
    assert.equal(existsSync(victim), true);
    assert.equal(result.filesFailed, 1);
  });

  it('does not follow a symlinked parent directory out of the root', async () => {
    const victimDir = path.join(sandbox, 'victim-dir');
    await mkdir(victimDir);
    await writeFile(path.join(victimDir, `${ID_OLD}.webp`), 'keep');
    await symlink(victimDir, path.join(root, 'photos', 'cerita'));
    const { client } = fakeClient([asset(ID_OLD, { storageKey: `photos/cerita/${ID_OLD}.webp` })]);
    const result = await runMediaCleanup({
      root,
      graceMs: GRACE,
      now: NOW,
      client,
      recordAudit: noAudit().record,
    });
    assert.equal(existsSync(path.join(victimDir, `${ID_OLD}.webp`)), true);
    assert.equal(result.filesFailed, 1);
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
