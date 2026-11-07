import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import sharp from 'sharp';
import {
  MediaServiceError,
  attachMedia,
  detachMedia,
  ingestStagedUpload,
  toMediaAssetDto,
  type MediaTransactionClient,
} from '../services/media.service.js';
import { MediaValidationError } from '../utils/mediaSignature.js';
import { UPLOAD_SUBDIRS } from '../utils/uploadRoot.js';
import { installMediaDbStub, makeAsset, type MediaDbStub } from './helpers/mediaDbStub.js';
import { PDF_BYTES, buildDocx, buildXlsx, makeImage } from './helpers/mediaFixtures.js';

const actor = { id: 'editor-1', email: 'editor@example.com', role: 'editor' };
const context = { ipAddress: '127.0.0.1', userAgent: 'TestAgent/1.0' };

let sandbox: string;
let root: string;
let db: MediaDbStub;
let counter = 0;

beforeEach(async () => {
  sandbox = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sidata-mediasvc-')));
  root = path.join(sandbox, 'uploads');
  for (const sub of UPLOAD_SUBDIRS) await mkdir(path.join(root, sub), { recursive: true });
  db = installMediaDbStub();
});

afterEach(async () => {
  db.restore();
  await rm(sandbox, { recursive: true, force: true });
});

async function stage(bytes: Buffer): Promise<string> {
  const dir = path.join(root, '_staging', `up-${(counter += 1)}`);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, 'upload.bin');
  await writeFile(file, bytes);
  return file;
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

describe('ingestStagedUpload: photos', () => {
  it('re-encodes to WebP, strips EXIF, writes a thumbnail, and returns a path-free DTO', async () => {
    const input = await makeImage('jpeg', 400, 300, true);
    assert.ok((await sharp(input).metadata()).exif, 'fixture must carry EXIF to prove stripping');

    const dto = await ingestStagedUpload({
      root,
      stagedPath: await stage(input),
      originalName: 'IMG_0001.JPG',
      purpose: 'cerita',
      actor,
      context,
    });

    assert.equal(dto.kind, 'photo');
    assert.equal(dto.mimeType, 'image/webp');
    assert.equal(dto.width, 400);
    assert.equal(dto.height, 300);
    assert.equal(dto.originalName, 'IMG_0001.JPG');
    assert.equal(dto.previewUrl, `/api/media/${dto.id}/preview`);
    assert.deepEqual(Object.keys(dto).sort(), [
      'byteSize',
      'height',
      'id',
      'kind',
      'mimeType',
      'originalName',
      'previewUrl',
      'width',
    ]);

    const stored = [...db.assets.values()][0]!;
    assert.equal(stored.storageKey, `photos/cerita/${actor.id}/${dto.id}.webp`);
    assert.equal(stored.attachedAt, null, 'new uploads are private until attached');
    assert.equal(stored.createdById, actor.id);

    const bytes = await readFile(path.join(root, stored.storageKey));
    const meta = await sharp(bytes).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.exif, undefined, 'EXIF/GPS must not survive re-encoding');
    assert.equal(bytes.includes(Buffer.from('secret-camera')), false);
    assert.equal(stored.byteSize, bytes.length);

    const thumb = await sharp(path.join(root, 'derivatives', dto.id, 'thumbnail.webp')).metadata();
    assert.equal(thumb.format, 'webp');
    assert.ok(Math.max(thumb.width ?? 0, thumb.height ?? 0) <= 320);
  });

  it('caps the long edge at 2560px without upscaling smaller images', async () => {
    const big = await ingestStagedUpload({
      root,
      stagedPath: await stage(await makeImage('png', 3000, 1000)),
      originalName: 'wide.png',
      purpose: 'cerita',
      actor,
      context,
    });
    assert.equal(big.width, 2560);
    assert.equal(big.height, Math.round((1000 * 2560) / 3000));

    const small = await ingestStagedUpload({
      root,
      stagedPath: await stage(await makeImage('webp', 100, 80)),
      originalName: 'small.webp',
      purpose: 'cerita',
      actor,
      context,
    });
    assert.equal(small.width, 100);
  });

  it('bounds input pixels before decoding', async () => {
    await assert.rejects(
      async () =>
        ingestStagedUpload({
          root,
          stagedPath: await stage(await makeImage('png', 200, 200)),
          originalName: 'bomb.png',
          purpose: 'cerita',
          actor,
          context,
          photoOptions: { limitInputPixels: 1000 },
        }),
      (error: unknown) => error instanceof MediaValidationError && error.code === 'INVALID_IMAGE',
    );
    assert.equal(db.assets.size, 0);
    assert.deepEqual(await walk(path.join(root, 'photos')), [], 'no bytes may be left behind');
    assert.deepEqual(await walk(path.join(root, 'derivatives')), []);
  });

  it('rejects an image that has a valid signature but a corrupt body, leaving no files', async () => {
    const real = await makeImage('jpeg', 100, 100);
    const corrupt = Buffer.concat([real.subarray(0, 40), Buffer.alloc(200, 0x11)]);
    await assert.rejects(
      async () =>
        ingestStagedUpload({
          root,
          stagedPath: await stage(corrupt),
          originalName: 'corrupt.jpg',
          purpose: 'cerita',
          actor,
          context,
        }),
      (error: unknown) => error instanceof MediaValidationError && error.code === 'INVALID_IMAGE',
    );
    assert.deepEqual(await walk(path.join(root, 'photos')), []);
    assert.deepEqual(await walk(path.join(root, 'derivatives')), []);
  });

  it('removes the written files again when the database write fails', async () => {
    db.failCreateWith = new Error('db down');
    await assert.rejects(
      async () =>
        ingestStagedUpload({
          root,
          stagedPath: await stage(await makeImage('jpeg')),
          originalName: 'a.jpg',
          purpose: 'cerita',
          actor,
          context,
        }),
      /db down/,
    );
    assert.deepEqual(await walk(path.join(root, 'photos')), []);
    assert.deepEqual(await walk(path.join(root, 'derivatives')), []);
    assert.equal(db.auditRows.length, 0);
  });
});

describe('ingestStagedUpload: documents and data', () => {
  it('stores a PDF unchanged under documents/<purpose>/<ownerKey>/<id>.pdf', async () => {
    const dto = await ingestStagedUpload({
      root,
      stagedPath: await stage(PDF_BYTES),
      originalName: 'Laporan 2025.pdf',
      purpose: 'publikasi-document',
      actor,
      context,
    });
    assert.equal(dto.kind, 'document');
    assert.equal(dto.mimeType, 'application/pdf');
    assert.equal(dto.width, null);
    const stored = [...db.assets.values()][0]!;
    assert.equal(stored.storageKey, `documents/publikasi-document/${actor.id}/${dto.id}.pdf`);
    assert.deepEqual(await readFile(path.join(root, stored.storageKey)), PDF_BYTES);
  });

  it('stores DOCX, XLSX and CSV with their stored extension and server-chosen MIME', async () => {
    const docx = await ingestStagedUpload({
      root,
      stagedPath: await stage(buildDocx()),
      originalName: 'surat.docx',
      purpose: 'publikasi-document',
      actor,
      context,
    });
    assert.match(docx.mimeType, /wordprocessingml/);

    const xlsx = await ingestStagedUpload({
      root,
      stagedPath: await stage(buildXlsx()),
      originalName: 'data.xlsx',
      purpose: 'sumber-daya-data',
      actor,
      context,
    });
    assert.equal(xlsx.kind, 'data');

    const csv = await ingestStagedUpload({
      root,
      stagedPath: await stage(Buffer.from('a,b\n1,2\n')),
      originalName: 'data.csv',
      purpose: 'sumber-daya-data',
      actor,
      context,
    });
    assert.equal(csv.mimeType, 'text/csv; charset=utf-8');
    assert.equal(
      [...db.assets.values()].every((a) => a.byteSize > 0),
      true,
    );
  });
});

describe('ingestStagedUpload: purpose and policy', () => {
  it('rejects an unknown or hostile purpose before touching the disk', async () => {
    for (const purpose of [
      undefined,
      '',
      '../etc',
      'hero',
      ['cerita'],
      { toString: () => 'cerita' },
    ]) {
      await assert.rejects(
        async () =>
          ingestStagedUpload({
            root,
            stagedPath: await stage(await makeImage('jpeg')),
            originalName: 'a.jpg',
            purpose,
            actor,
            context,
          }),
        (error: unknown) => error instanceof MediaServiceError && error.code === 'INVALID_PURPOSE',
      );
    }
    assert.deepEqual(await walk(path.join(root, 'photos')), []);
  });

  it('rejects a kind the purpose does not allow (photo to a document slot and vice versa)', async () => {
    await assert.rejects(
      async () =>
        ingestStagedUpload({
          root,
          stagedPath: await stage(await makeImage('jpeg')),
          originalName: 'a.jpg',
          purpose: 'publikasi-document',
          actor,
          context,
        }),
      (error: unknown) =>
        error instanceof MediaServiceError && error.code === 'PURPOSE_KIND_MISMATCH',
    );
    await assert.rejects(
      async () =>
        ingestStagedUpload({
          root,
          stagedPath: await stage(PDF_BYTES),
          originalName: 'a.pdf',
          purpose: 'portal-hero',
          actor,
          context,
        }),
      (error: unknown) =>
        error instanceof MediaServiceError && error.code === 'PURPOSE_KIND_MISMATCH',
    );
    assert.equal(db.assets.size, 0);
  });

  it('uses fixed owner keys for singleton purposes regardless of who uploads', async () => {
    await ingestStagedUpload({
      root,
      stagedPath: await stage(await makeImage('jpeg')),
      originalName: 'a.jpg',
      purpose: 'portal-hero',
      actor,
      context,
    });
    assert.match([...db.assets.values()][0]!.storageKey, /^photos\/portal-hero\/hero\//);
  });

  it('never lets a client-supplied name reach the storage path', async () => {
    await ingestStagedUpload({
      root,
      stagedPath: await stage(PDF_BYTES),
      originalName: '../../../etc/passwd.pdf',
      purpose: 'publikasi-document',
      actor,
      context,
    });
    const stored = [...db.assets.values()][0]!;
    assert.equal(stored.originalName, 'passwd.pdf');
    assert.doesNotMatch(stored.storageKey, /passwd|\.\./);
  });
});

describe('ingestStagedUpload: audit trail', () => {
  it('records media.uploaded with ids, purpose, kind and size only', async () => {
    const input = await makeImage('jpeg', 64, 64);
    const dto = await ingestStagedUpload({
      root,
      stagedPath: await stage(input),
      originalName: 'rahasia-nama-berkas.jpg',
      purpose: 'cerita',
      actor,
      context,
    });

    assert.equal(db.auditRows.length, 1);
    const row = db.auditRows[0]!;
    assert.equal(row['action'], 'media.uploaded');
    assert.equal(row['severity'], 'info');
    assert.equal(row['actorId'], actor.id);
    assert.equal(row['targetType'], 'media_asset');
    assert.equal(row['targetId'], dto.id);
    assert.deepEqual(Object.keys(row['metadata'] as object).sort(), [
      'assetId',
      'byteSize',
      'kind',
      'mimeType',
      'purpose',
    ]);

    const serialized = JSON.stringify(row);
    assert.equal(serialized.includes(root), false, 'no server path in the audit row');
    assert.equal(serialized.includes(sandbox), false);
    assert.equal(serialized.includes('upload.bin'), false);
    assert.equal(serialized.includes('rahasia-nama-berkas'), false, 'no original filename');
    assert.equal(serialized.includes('storageKey'), false);
    assert.equal(serialized.includes('photos/'), false);
    assert.equal(existsSync(path.join(root, 'photos')), true);
  });
});

describe('toMediaAssetDto', () => {
  it('never exposes the storage key, owner key or provider', () => {
    const dto = toMediaAssetDto(makeAsset());
    const serialized = JSON.stringify(dto);
    for (const leak of ['storageKey', 'photos/', 'ownerKey', 'provider', 'local', 'createdById']) {
      assert.equal(serialized.includes(leak), false, `${leak} must not appear`);
    }
  });
});

describe('attachMedia / detachMedia', () => {
  const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  function fakeTx(assets: ReturnType<typeof makeAsset>[]) {
    const rows = new Map(assets.map((a) => [a.id, { ...a }]));
    const calls: Array<{ method: string; args: unknown }> = [];
    const tx = {
      mediaAsset: {
        findMany: async (args: { where: { id: { in: string[] } } }) => {
          calls.push({ method: 'findMany', args });
          return args.where.id.in.flatMap((id) => (rows.has(id) ? [rows.get(id)!] : []));
        },
        updateMany: async (args: {
          where: { id: { in: string[] }; attachedAt?: null | { not: null } };
          data: { attachedAt: Date | null; detachedAt?: Date | null };
        }) => {
          calls.push({ method: 'updateMany', args });
          let count = 0;
          for (const id of args.where.id.in) {
            const row = rows.get(id);
            if (!row) continue;
            if (args.where.attachedAt === null && row.attachedAt !== null) continue;
            if (
              args.where.attachedAt !== undefined &&
              args.where.attachedAt !== null &&
              row.attachedAt === null
            ) {
              continue;
            }
            row.attachedAt = args.data.attachedAt;
            if (args.data.detachedAt !== undefined) row.detachedAt = args.data.detachedAt;
            count += 1;
          }
          return { count };
        },
        count: async (args: { where: { id: { in: string[] } } }) =>
          args.where.id.in.filter((id) => rows.has(id)).length,
      },
    };
    return { tx: tx as unknown as MediaTransactionClient, rows, calls };
  }

  it('sets attachedAt for assets whose purpose matches the context', async () => {
    const { tx, rows } = fakeTx([
      makeAsset({ id: ID_A, purpose: 'cerita' }),
      makeAsset({ id: ID_B, purpose: 'cerita' }),
    ]);
    const now = new Date('2026-05-05T00:00:00Z');
    await attachMedia(tx, [ID_A, ID_B, ID_A], { purpose: 'cerita' }, now);
    assert.equal(rows.get(ID_A)!.attachedAt?.toISOString(), now.toISOString());
    assert.equal(rows.get(ID_B)!.attachedAt?.toISOString(), now.toISOString());
  });

  it('keeps the original attachedAt of an already attached asset (idempotent)', async () => {
    const earlier = new Date('2026-01-01T00:00:00Z');
    const { tx, rows } = fakeTx([makeAsset({ id: ID_A, attachedAt: earlier })]);
    await attachMedia(tx, [ID_A], { purpose: 'cerita' }, new Date('2026-06-06T00:00:00Z'));
    assert.equal(rows.get(ID_A)!.attachedAt?.toISOString(), earlier.toISOString());
  });

  it('refuses a purpose mismatch and leaves every asset untouched', async () => {
    const { tx, rows, calls } = fakeTx([
      makeAsset({ id: ID_A, purpose: 'cerita' }),
      makeAsset({ id: ID_B, purpose: 'portal-hero' }),
    ]);
    await assert.rejects(
      () => attachMedia(tx, [ID_A, ID_B], { purpose: 'cerita' }),
      (error: unknown) =>
        error instanceof MediaServiceError &&
        error.code === 'MEDIA_PURPOSE_MISMATCH' &&
        error.statusCode === 400,
    );
    assert.equal(rows.get(ID_A)!.attachedAt, null);
    assert.equal(
      calls.some((c) => c.method === 'updateMany'),
      false,
    );
  });

  it('refuses unknown ids, malformed ids and unknown purposes', async () => {
    const { tx } = fakeTx([makeAsset({ id: ID_A })]);
    await assert.rejects(
      () => attachMedia(tx, [ID_B], { purpose: 'cerita' }),
      (e: unknown) => e instanceof MediaServiceError && e.code === 'MEDIA_NOT_FOUND',
    );
    await assert.rejects(
      () => attachMedia(tx, ['../../x'], { purpose: 'cerita' }),
      (e: unknown) => e instanceof MediaServiceError && e.code === 'MEDIA_NOT_FOUND',
    );
    await assert.rejects(
      () => attachMedia(tx, [ID_A], { purpose: 'nope' as never }),
      (e: unknown) => e instanceof MediaServiceError && e.code === 'MEDIA_PURPOSE_MISMATCH',
    );
  });

  it('is a no-op for an empty id list', async () => {
    const { tx, calls } = fakeTx([]);
    await attachMedia(tx, [], { purpose: 'cerita' });
    assert.equal(calls.length, 0);
  });

  it('fails (rolling the caller back) when cleanup deleted a row mid-attach', async () => {
    const { tx, rows } = fakeTx([makeAsset({ id: ID_A })]);
    const original = tx.mediaAsset.updateMany;
    (tx.mediaAsset as { updateMany: unknown }).updateMany = async (args: never) => {
      rows.delete(ID_A); // the cleanup script wins the race between the read and the update
      return original(args);
    };
    await assert.rejects(
      () => attachMedia(tx, [ID_A], { purpose: 'cerita' }),
      (e: unknown) => e instanceof MediaServiceError && e.code === 'MEDIA_NOT_FOUND',
    );
  });

  it('detachMedia clears attachedAt and also enforces the purpose', async () => {
    const { tx, rows } = fakeTx([makeAsset({ id: ID_A, attachedAt: new Date() })]);
    await assert.rejects(
      () => detachMedia(tx, [ID_A], { purpose: 'portal-hero' }),
      (e: unknown) => e instanceof MediaServiceError && e.code === 'MEDIA_PURPOSE_MISMATCH',
    );
    assert.notEqual(rows.get(ID_A)!.attachedAt, null);
    const when = new Date('2026-07-01T00:00:00Z');
    await detachMedia(tx, [ID_A], { purpose: 'cerita' }, when);
    assert.equal(rows.get(ID_A)!.attachedAt, null);
    assert.equal(rows.get(ID_A)!.detachedAt?.toISOString(), when.toISOString());
  });

  it('detachMedia does not move detachedAt of an asset that is already unattached', async () => {
    const first = new Date('2026-07-01T00:00:00Z');
    const { tx, rows } = fakeTx([makeAsset({ id: ID_A, detachedAt: first })]);
    await detachMedia(tx, [ID_A], { purpose: 'cerita' }, new Date('2026-08-01T00:00:00Z'));
    assert.equal(rows.get(ID_A)!.detachedAt?.toISOString(), first.toISOString());
  });

  it('attachMedia clears detachedAt again', async () => {
    const { tx, rows } = fakeTx([
      makeAsset({ id: ID_A, detachedAt: new Date('2026-07-01T00:00:00Z') }),
    ]);
    await attachMedia(tx, [ID_A], { purpose: 'cerita' }, new Date('2026-07-02T00:00:00Z'));
    assert.notEqual(rows.get(ID_A)!.attachedAt, null);
    assert.equal(rows.get(ID_A)!.detachedAt, null);
  });
});
