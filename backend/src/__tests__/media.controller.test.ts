import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import jwt from 'jsonwebtoken';
import mediaRouter from '../routes/media.routes.js';
import { JWT_SECRET } from '../configs/index.js';
import prisma from '../utils/prisma.js';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { Request, Response } from 'express';
import {
  previewMediaHandler,
  publicMediaDownloadHandler,
  publicMediaImageHandler,
  uploadMediaHandler,
} from '../controllers/media.controller.js';
import {
  acceptMediaUpload,
  type MediaUploadRequest,
} from '../middlewares/mediaUpload.middleware.js';
import { DOCUMENT_MAX_BYTES } from '../utils/mediaPolicy.js';
import { createUploadRootProvider, setUploadRootForTesting } from '../utils/mediaStorage.js';
import { UploadRootError } from '../utils/uploadRoot.js';
import { UPLOAD_SUBDIRS } from '../utils/uploadRoot.js';
import { photoProcessingSemaphore } from '../utils/mediaImage.js';
import { installMediaDbStub, makeAsset, type MediaDbStub } from './helpers/mediaDbStub.js';
import {
  PDF_BYTES,
  buildDocx,
  buildMultipartRequest,
  makeImage,
  makeMediaRes,
  type MediaFakeRes,
  type MultipartPart,
} from './helpers/mediaFixtures.js';

const ID = '11111111-1111-4111-8111-111111111111';
const ID_DOC = '22222222-2222-4222-8222-222222222222';

let sandbox: string;
let root: string;
let db: MediaDbStub;

beforeEach(async () => {
  sandbox = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sidata-mediactl-')));
  root = path.join(sandbox, 'uploads');
  for (const sub of UPLOAD_SUBDIRS) await mkdir(path.join(root, sub), { recursive: true });
  setUploadRootForTesting(root);
  db = installMediaDbStub();
});

afterEach(async () => {
  photoProcessingSemaphore.configure();
  db.restore();
  setUploadRootForTesting(null);
  await rm(sandbox, { recursive: true, force: true });
});

async function stagingEntries(): Promise<string[]> {
  return readdir(path.join(root, '_staging'));
}

/** Runs the real transport middleware, then the handler, as the router would. */
async function postUpload(parts: MultipartPart[]): Promise<MediaFakeRes> {
  const req = buildMultipartRequest(parts) as unknown as MediaUploadRequest;
  const res = makeMediaRes();
  let proceeded = false;
  await new Promise<void>((resolve) => {
    const finish = () => resolve();
    // The middleware either calls next() (success) or answers the response itself (error).
    const originalJson = res.json.bind(res);
    res.json = (data: unknown) => {
      const out = originalJson(data);
      finish();
      return out;
    };
    void acceptMediaUpload(req, res as unknown as Response, () => {
      proceeded = true;
      finish();
    });
  });
  if (proceeded) {
    await uploadMediaHandler(req, res as unknown as Response);
  }
  return res;
}

const filePart = (filename: string, data: Buffer, contentType = 'application/octet-stream') =>
  ({ name: 'file', filename, data, contentType }) satisfies MultipartPart;
const purposePart = (value: string) => ({ name: 'purpose', value }) satisfies MultipartPart;

describe('POST /api/media transport + handler', () => {
  it('accepts a photo, answers 201 with a path-free body, and leaves no staging bytes', async () => {
    const res = await postUpload([
      purposePart('cerita'),
      filePart('foto.jpg', await makeImage('jpeg', 120, 90, true), 'image/jpeg'),
    ]);
    assert.equal(res.statusCode, 201);
    const media = (res.body as { media: Record<string, unknown> }).media;
    assert.equal(media['kind'], 'photo');
    assert.equal(media['mimeType'], 'image/webp');
    assert.match(String(media['previewUrl']), /^\/api\/media\/[0-9a-f-]{36}\/preview$/);
    const serialized = JSON.stringify(res.body);
    assert.equal(serialized.includes(root), false);
    assert.equal(serialized.includes('_staging'), false);
    assert.equal(serialized.includes('photos/'), false);
    assert.deepEqual(await stagingEntries(), []);
    assert.equal(db.assets.size, 1);
  });

  it('accepts the purpose field even when it arrives after the file part', async () => {
    const res = await postUpload([
      filePart('laporan.pdf', PDF_BYTES, 'application/pdf'),
      purposePart('publikasi-document'),
    ]);
    assert.equal(res.statusCode, 201);
  });

  it('rejects an executable renamed to .jpg and deletes its staging bytes', async () => {
    const res = await postUpload([
      purposePart('cerita'),
      filePart('virus.jpg', Buffer.from('MZ\x90\x00\x03\x00\x00\x00 fake exe body'), 'image/jpeg'),
    ]);
    assert.equal(res.statusCode, 415);
    assert.equal((res.body as { code: string }).code, 'UNSUPPORTED_TYPE');
    assert.deepEqual(await stagingEntries(), []);
    assert.equal(db.assets.size, 0);
  });

  it('rejects a macro-enabled DOCX and cleans staging', async () => {
    const res = await postUpload([
      purposePart('publikasi-document'),
      filePart('makro.docx', buildDocx([{ name: 'word/vbaProject.bin', data: 'x' }])),
    ]);
    assert.equal(res.statusCode, 415);
    assert.equal((res.body as { code: string }).code, 'MACRO_ENABLED');
    assert.deepEqual(await stagingEntries(), []);
  });

  it('rejects an unsupported extension at the transport before any bytes are staged', async () => {
    const res = await postUpload([
      purposePart('cerita'),
      filePart(
        'logo.svg',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        'image/svg+xml',
      ),
    ]);
    assert.equal(res.statusCode, 415);
    assert.deepEqual(await stagingEntries(), []);
  });

  it('rejects a file over the transport ceiling with 413 and removes the partial staging file', async () => {
    const oversize = Buffer.concat([PDF_BYTES, Buffer.alloc(DOCUMENT_MAX_BYTES + 1024)]);
    const res = await postUpload([
      purposePart('publikasi-document'),
      filePart('big.pdf', oversize),
    ]);
    assert.equal(res.statusCode, 413);
    assert.equal((res.body as { code: string }).code, 'FILE_TOO_LARGE');
    assert.deepEqual(await stagingEntries(), []);
    assert.equal(db.assets.size, 0);
  });

  it('rejects a photo over its own 5 MiB limit even though it is under the transport ceiling', async () => {
    const jpegHead = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const big = Buffer.concat([jpegHead, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await postUpload([purposePart('cerita'), filePart('big.jpg', big, 'image/jpeg')]);
    assert.equal(res.statusCode, 413);
    assert.equal((res.body as { code: string }).code, 'FILE_TOO_LARGE');
    assert.deepEqual(await stagingEntries(), []);
  });

  it('rejects more than one file part', async () => {
    const res = await postUpload([
      purposePart('cerita'),
      filePart('a.jpg', await makeImage('jpeg'), 'image/jpeg'),
      filePart('b.jpg', await makeImage('jpeg'), 'image/jpeg'),
    ]);
    assert.equal(res.statusCode, 400);
    assert.equal((res.body as { code: string }).code, 'INVALID_UPLOAD');
    assert.deepEqual(await stagingEntries(), []);
    assert.equal(db.assets.size, 0);
  });

  it('rejects a file under the wrong field name', async () => {
    const res = await postUpload([
      purposePart('cerita'),
      { name: 'attachment', filename: 'a.jpg', data: await makeImage('jpeg') },
    ]);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(await stagingEntries(), []);
  });

  it('answers 400 FILE_REQUIRED when the request has no file', async () => {
    const res = await postUpload([purposePart('cerita')]);
    assert.equal(res.statusCode, 400);
    assert.equal((res.body as { code: string }).code, 'FILE_REQUIRED');
    assert.deepEqual(await stagingEntries(), []);
  });

  it('rejects an invalid purpose and cleans staging', async () => {
    const res = await postUpload([
      purposePart('../../etc'),
      filePart('a.jpg', await makeImage('jpeg'), 'image/jpeg'),
    ]);
    assert.equal(res.statusCode, 400);
    assert.equal((res.body as { code: string }).code, 'INVALID_PURPOSE');
    assert.deepEqual(await stagingEntries(), []);
    assert.deepEqual(await readdir(path.join(root, 'photos')), []);
  });

  it('never uses the client filename on disk: traversal names are neutralised', async () => {
    const res = await postUpload([
      purposePart('publikasi-document'),
      filePart('../../../../tmp/pwn.pdf', PDF_BYTES, 'application/pdf'),
    ]);
    assert.equal(res.statusCode, 201);
    const stored = [...db.assets.values()][0]!;
    assert.equal(stored.originalName, 'pwn.pdf');
    assert.equal(existsSync(path.join(sandbox, 'pwn.pdf')), false);
    assert.equal(existsSync(path.join(os.tmpdir(), 'pwn.pdf')), false);
  });

  it('sets Retry-After header and returns 503 when photo processing queue is full', async () => {
    photoProcessingSemaphore.configure(1, 0);
    const release = await photoProcessingSemaphore.acquire();
    try {
      const res = await postUpload([
        purposePart('cerita'),
        filePart('a.jpg', await makeImage('jpeg'), 'image/jpeg'),
      ]);
      assert.equal(res.statusCode, 503);
      assert.equal((res.body as { code: string }).code, 'MEDIA_PROCESSING_BUSY');
      assert.equal(res.headers['retry-after'], '5');
      assert.deepEqual(await stagingEntries(), []);
    } finally {
      release();
      photoProcessingSemaphore.configure();
    }
  });
});

describe('media delivery routes', () => {
  async function putFile(key: string, bytes: Buffer | string): Promise<string> {
    const full = path.join(root, ...key.split('/'));
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes);
    return full;
  }

  const req = (id: string, query: Record<string, unknown> = {}) =>
    ({ params: { id }, query }) as unknown as Request;
  const asRes = (r: MediaFakeRes) => r as unknown as Response;

  it('public image: refuses an unattached asset with 404 and no detail', async () => {
    const asset = makeAsset({ id: ID, attachedAt: null });
    db.assets.set(asset.id, asset);
    await putFile(asset.storageKey, 'webp-bytes');
    const res = makeMediaRes();
    await publicMediaImageHandler(req(ID), asRes(res));
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: 'Media tidak ditemukan.', code: 'MEDIA_NOT_FOUND' });
    assert.equal(res.sentFile, undefined);
  });

  it('public image: unattached is indistinguishable from nonexistent and malformed ids', async () => {
    const missing = makeMediaRes();
    await publicMediaImageHandler(req('99999999-9999-4999-8999-999999999999'), asRes(missing));
    const malformed = makeMediaRes();
    await publicMediaImageHandler(req('../../etc/passwd'), asRes(malformed));
    const unattachedAsset = makeAsset({ id: ID, attachedAt: null });
    db.assets.set(unattachedAsset.id, unattachedAsset);
    const unattached = makeMediaRes();
    await publicMediaImageHandler(req(ID), asRes(unattached));
    assert.deepEqual(missing.body, unattached.body);
    assert.deepEqual(malformed.body, unattached.body);
    assert.equal(missing.statusCode, 404);
    assert.equal(malformed.statusCode, 404);
  });

  it('public image: serves an attached photo with nosniff and one-hour revalidated caching', async () => {
    const asset = makeAsset({ id: ID, attachedAt: new Date() });
    db.assets.set(asset.id, asset);
    const file = await putFile(asset.storageKey, 'webp-bytes');
    const res = makeMediaRes();
    await publicMediaImageHandler(req(ID), asRes(res));
    assert.equal(res.statusCode, 200);
    assert.equal(res.sentFile, file);
    assert.equal(res.headers['content-type'], 'image/webp');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['cache-control'], 'public, max-age=3600, must-revalidate');
    assert.match(res.headers['content-security-policy'] ?? '', /default-src 'none'/);
    assert.equal(res.headers['content-disposition'], undefined);
  });

  it('public image: serves the thumbnail variant for attached photos only', async () => {
    const asset = makeAsset({ id: ID, attachedAt: new Date() });
    db.assets.set(asset.id, asset);
    const thumb = await putFile(`derivatives/${ID}/thumbnail.webp`, 'thumb');
    const res = makeMediaRes();
    await publicMediaImageHandler(req(ID, { variant: 'thumbnail' }), asRes(res));
    assert.equal(res.sentFile, thumb);

    const doc = makeAsset({
      id: ID_DOC,
      kind: 'document',
      storageKey: `documents/publikasi-document/u1/${ID_DOC}.pdf`,
      attachedAt: new Date(),
    });
    db.assets.set(doc.id, doc);
    const bad = makeMediaRes();
    await publicMediaDownloadHandler(req(ID_DOC, { variant: 'thumbnail' }), asRes(bad));
    assert.equal(bad.statusCode, 404);
  });

  it('public image route never serves documents or data, attached or not', async () => {
    const doc = makeAsset({
      id: ID_DOC,
      kind: 'document',
      storageKey: `documents/publikasi-document/u1/${ID_DOC}.pdf`,
      attachedAt: new Date(),
    });
    db.assets.set(doc.id, doc);
    await putFile(doc.storageKey, PDF_BYTES);
    const res = makeMediaRes();
    await publicMediaImageHandler(req(ID_DOC), asRes(res));
    assert.equal(res.statusCode, 404);
  });

  it('download: refuses unattached documents and photos', async () => {
    const doc = makeAsset({
      id: ID_DOC,
      kind: 'document',
      storageKey: `documents/publikasi-document/u1/${ID_DOC}.pdf`,
      attachedAt: null,
    });
    db.assets.set(doc.id, doc);
    await putFile(doc.storageKey, PDF_BYTES);
    const unattached = makeMediaRes();
    await publicMediaDownloadHandler(req(ID_DOC), asRes(unattached));
    assert.equal(unattached.statusCode, 404);

    const photo = makeAsset({ id: ID, attachedAt: new Date() });
    db.assets.set(photo.id, photo);
    await putFile(photo.storageKey, 'x');
    const photoRes = makeMediaRes();
    await publicMediaDownloadHandler(req(ID), asRes(photoRes));
    assert.equal(photoRes.statusCode, 404);
  });

  it('download: serves an attached document as an attachment with a safe filename', async () => {
    const doc = makeAsset({
      id: ID_DOC,
      kind: 'document',
      mimeType: 'text/html', // a tampered DB value must not decide the served type
      storageKey: `documents/publikasi-document/u1/${ID_DOC}.pdf`,
      originalName: 'Laporan "2025"\r\n.exe',
      attachedAt: new Date(),
    });
    db.assets.set(doc.id, doc);
    const file = await putFile(doc.storageKey, PDF_BYTES);
    const res = makeMediaRes();
    await publicMediaDownloadHandler(req(ID_DOC), asRes(res));
    assert.equal(res.statusCode, 200);
    assert.equal(res.sentFile, file);
    assert.equal(res.headers['content-type'], 'application/pdf');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['cache-control'], 'public, max-age=3600, must-revalidate');
    const disposition = res.headers['content-disposition'] ?? '';
    assert.match(disposition, /^attachment; filename="[A-Za-z0-9._-]+\.pdf"; filename\*=UTF-8''/);
    assert.doesNotMatch(disposition, /[\r\n]/);
    assert.doesNotMatch(disposition, /exe/);
  });

  it('preview: serves unattached assets, privately, and documents only as attachments', async () => {
    const photo = makeAsset({ id: ID, attachedAt: null });
    db.assets.set(photo.id, photo);
    await putFile(photo.storageKey, 'x');
    const photoRes = makeMediaRes();
    await previewMediaHandler(req(ID), asRes(photoRes));
    assert.equal(photoRes.statusCode, 200);
    assert.equal(photoRes.headers['cache-control'], 'private, no-store');
    assert.equal(photoRes.headers['content-disposition'], undefined);

    const doc = makeAsset({
      id: ID_DOC,
      kind: 'data',
      storageKey: `documents/sumber-daya-data/u1/${ID_DOC}.csv`,
      attachedAt: null,
    });
    db.assets.set(doc.id, doc);
    await putFile(doc.storageKey, 'a,b\n');
    const docRes = makeMediaRes();
    await previewMediaHandler(req(ID_DOC), asRes(docRes));
    assert.equal(docRes.statusCode, 200);
    assert.equal(docRes.headers['content-type'], 'text/csv; charset=utf-8');
    assert.match(docRes.headers['content-disposition'] ?? '', /^attachment;/);
    assert.equal(docRes.headers['cache-control'], 'private, no-store');
  });

  it('preview: attached assets are still not cached publicly through the editor route', async () => {
    const photo = makeAsset({ id: ID, attachedAt: new Date() });
    db.assets.set(photo.id, photo);
    await putFile(photo.storageKey, 'x');
    const res = makeMediaRes();
    await previewMediaHandler(req(ID), asRes(res));
    assert.equal(res.headers['cache-control'], 'private, no-store');
  });

  it('refuses to serve assets that are claimed for deletion or quarantined', async () => {
    const deletingPhoto = makeAsset({
      id: ID,
      attachedAt: new Date(),
      cleanupClaimedAt: new Date(),
    });
    db.assets.set(deletingPhoto.id, deletingPhoto);
    await putFile(deletingPhoto.storageKey, 'x');

    const prevRes1 = makeMediaRes();
    await previewMediaHandler(req(ID), asRes(prevRes1));
    assert.equal(prevRes1.statusCode, 404);

    const pubRes1 = makeMediaRes();
    await publicMediaImageHandler(req(ID), asRes(pubRes1));
    assert.equal(pubRes1.statusCode, 404);

    const quarantinedPhoto = makeAsset({
      id: ID,
      attachedAt: new Date(),
      cleanupQuarantineReason: 'invalid-path',
    });
    db.assets.set(quarantinedPhoto.id, quarantinedPhoto);

    const prevRes2 = makeMediaRes();
    await previewMediaHandler(req(ID), asRes(prevRes2));
    assert.equal(prevRes2.statusCode, 404);

    const pubRes2 = makeMediaRes();
    await publicMediaImageHandler(req(ID), asRes(pubRes2));
    assert.equal(pubRes2.statusCode, 404);
  });

  it('answers a friendly 404 with no path when the file is missing on disk', async () => {
    const asset = makeAsset({ id: ID, attachedAt: new Date() });
    db.assets.set(asset.id, asset);
    const res = makeMediaRes();
    await publicMediaImageHandler(req(ID), asRes(res));
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, {
      error: 'Berkas media tidak tersedia saat ini.',
      code: 'MEDIA_FILE_MISSING',
    });
    const serialized = JSON.stringify(res.body);
    assert.equal(serialized.includes(root), false);
    assert.equal(serialized.includes('photos'), false);
  });

  it('contains path traversal in a corrupted storageKey', async () => {
    await writeFile(path.join(sandbox, 'secret.webp'), 'secret');
    for (const storageKey of ['../secret.webp', '/etc/passwd', 'photos/../../secret.webp']) {
      const asset = makeAsset({ id: ID, storageKey, attachedAt: new Date() });
      db.assets.set(asset.id, asset);
      const res = makeMediaRes();
      await publicMediaImageHandler(req(ID), asRes(res));
      assert.equal(res.statusCode, 404, `must not serve ${storageKey}`);
      assert.equal(res.sentFile, undefined);
      assert.equal(JSON.stringify(res.body).includes('secret'), false);
    }
  });

  it('contains a symlink planted inside the root that points outside it', async () => {
    const secret = path.join(sandbox, 'secret.webp');
    await writeFile(secret, 'secret');
    const asset = makeAsset({ id: ID, attachedAt: new Date() });
    db.assets.set(asset.id, asset);
    await mkdir(path.dirname(path.join(root, asset.storageKey)), { recursive: true });
    await symlink(secret, path.join(root, asset.storageKey));
    const res = makeMediaRes();
    await publicMediaImageHandler(req(ID), asRes(res));
    assert.equal(res.statusCode, 404);
    assert.equal(res.sentFile, undefined);
  });

  it('refuses to serve a stored extension the policy does not define', async () => {
    const asset = makeAsset({
      id: ID,
      storageKey: `photos/cerita/u1/${ID}.html`,
      attachedAt: new Date(),
    });
    db.assets.set(asset.id, asset);
    await putFile(asset.storageKey, '<script>alert(1)</script>');
    const res = makeMediaRes();
    await publicMediaImageHandler(req(ID), asRes(res));
    assert.equal(res.statusCode, 404);
    assert.equal(res.sentFile, undefined);
  });
});

describe('media delivery: sendFile failures map to honest statuses', () => {
  const req = (id: string) => ({ params: { id }, query: {} }) as unknown as Request;
  const asRes = (r: MediaFakeRes) => r as unknown as Response;

  async function attachedPhoto(bytes: string | Buffer = 'webp-bytes') {
    const asset = makeAsset({ id: ID, attachedAt: new Date() });
    db.assets.set(asset.id, asset);
    const full = path.join(root, ...asset.storageKey.split('/'));
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes);
    return { asset, full };
  }

  it('answers 416 (not 500) and logs nothing when the library reports a bad Range', async () => {
    await attachedPhoto();
    const res = makeMediaRes();
    res.sendFileError = Object.assign(new Error('Requested Range Not Satisfiable'), {
      status: 416,
      headers: { 'Content-Range': 'bytes */11' },
    });
    const logged: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void logged.push(args);
    try {
      await publicMediaImageHandler(req(ID), asRes(res));
    } finally {
      console.error = original;
    }
    assert.equal(res.statusCode, 416);
    assert.equal(res.headers['content-range'], 'bytes */11');
    assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
    assert.deepEqual(res.body, { error: 'Permintaan berkas tidak dapat dipenuhi.' });
    assert.deepEqual(logged, []);
  });

  it('answers 404 with the friendly missing-file body for ENOENT, and 500 for real failures', async () => {
    await attachedPhoto();
    const gone = makeMediaRes();
    gone.sendFileError = Object.assign(new Error(`ENOENT: no such file ${root}/x`), {
      code: 'ENOENT',
    });
    await publicMediaImageHandler(req(ID), asRes(gone));
    assert.equal(gone.statusCode, 404);
    assert.equal(gone.headers['content-type'], 'application/json; charset=utf-8');
    assert.deepEqual(gone.body, {
      error: 'Berkas media tidak tersedia saat ini.',
      code: 'MEDIA_FILE_MISSING',
    });

    const broken = makeMediaRes();
    broken.sendFileError = new Error('EIO: disk on fire');
    const original = console.error;
    const logged: unknown[][] = [];
    console.error = (...args: unknown[]) => void logged.push(args);
    try {
      await publicMediaImageHandler(req(ID), asRes(broken));
    } finally {
      console.error = original;
    }
    assert.equal(broken.statusCode, 500);
    assert.equal(broken.headers['content-type'], 'application/json; charset=utf-8');
    assert.deepEqual(broken.body, { error: 'Terjadi kesalahan internal server' });
    assert.equal(logged.length, 1);
  });

  async function withServer<T>(
    beforeSend: ((file: string) => Promise<void>) | null,
    run: (base: string) => Promise<T>,
  ): Promise<T> {
    const app = express();
    app.get('/:id', (request, response) => {
      if (beforeSend) {
        const real = response.sendFile.bind(response) as (...a: unknown[]) => void;
        (response as unknown as { sendFile: unknown }).sendFile = (
          file: string,
          ...rest: unknown[]
        ) => {
          void beforeSend(file).then(() => real(file, ...rest));
        };
      }
      return publicMediaImageHandler(request, response);
    });
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      return await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }

  it('real sendFile: an unsatisfiable Range on a real small file is 416 JSON', async () => {
    await attachedPhoto('0123456789');
    await withServer(null, async (base) => {
      const ok = await fetch(`${base}/${ID}`, { headers: { Range: 'bytes=2-4' } });
      assert.equal(ok.status, 206);
      assert.equal(await ok.text(), '234');

      const bad = await fetch(`${base}/${ID}`, { headers: { Range: 'bytes=999-9999' } });
      assert.equal(bad.status, 416);
      assert.equal(bad.headers.get('content-range'), 'bytes */10');
      assert.match(bad.headers.get('content-type') ?? '', /application\/json/);
      assert.doesNotMatch(bad.headers.get('content-type') ?? '', /image\/webp/);
      assert.deepEqual(await bad.json(), { error: 'Permintaan berkas tidak dapat dipenuhi.' });
    });
  });

  it('real sendFile: a file removed after the DB lookup answers 404, not 500', async () => {
    await attachedPhoto();
    await withServer(
      (file) => unlink(file),
      async (base) => {
        const res = await fetch(`${base}/${ID}`);
        assert.equal(res.status, 404);
        assert.match(res.headers.get('content-type') ?? '', /application\/json/);
        assert.doesNotMatch(res.headers.get('content-type') ?? '', /image\/webp/);
        const body = (await res.json()) as { code: string };
        assert.equal(body.code, 'MEDIA_FILE_MISSING');
        assert.equal(JSON.stringify(body).includes(root), false);
      },
    );
  });
});

describe('media storage under a dot-directory upload root', () => {
  it('uploads, previews and downloads when UPLOAD_DIR sits inside a hidden directory', async () => {
    const hiddenRoot = path.join(sandbox, '.hidden', '.local', 'uploads');
    for (const sub of UPLOAD_SUBDIRS) await mkdir(path.join(hiddenRoot, sub), { recursive: true });
    setUploadRootForTesting(hiddenRoot);

    const res = await postUpload([
      purposePart('publikasi-document'),
      filePart('laporan.pdf', PDF_BYTES, 'application/pdf'),
    ]);
    assert.equal(res.statusCode, 201);
    const id = (res.body as { media: { id: string } }).media.id;
    // Content owns the attach in production; do it directly on the stub row here.
    db.assets.set(id, { ...db.assets.get(id)!, attachedAt: new Date() });

    const app = express();
    app.get('/preview/:id', previewMediaHandler);
    app.get('/download/:id', publicMediaDownloadHandler);
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      for (const route of ['preview', 'download']) {
        const response = await fetch(`${base}/${route}/${id}`);
        assert.equal(response.status, 200, route);
        assert.equal(response.headers.get('content-type'), 'application/pdf');
        assert.equal(Buffer.from(await response.arrayBuffer()).equals(PDF_BYTES), true);
      }
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('still refuses stored keys with dot or traversal segments', async () => {
    for (const storageKey of ['photos/./x.webp', 'photos/../x.webp']) {
      const asset = makeAsset({ id: ID, storageKey, attachedAt: new Date() });
      db.assets.set(asset.id, asset);
      const res = makeMediaRes();
      await publicMediaImageHandler(
        { params: { id: ID }, query: {} } as unknown as Request,
        res as unknown as Response,
      );
      assert.equal(res.statusCode, 404, storageKey);
      assert.equal(res.sentFile, undefined);
    }
  });
});

describe('GET /api/media/:id/preview authentication contract', () => {
  it('answers 401 without a token and 200 with an editor Bearer token', async () => {
    const asset = makeAsset({ id: ID, attachedAt: null });
    db.assets.set(asset.id, asset);
    const full = path.join(root, ...asset.storageKey.split('/'));
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, 'webp-bytes');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only stub of the singleton
    const p = prisma as any;
    const originalFindUser = p.user.findUnique;
    p.user.findUnique = async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      email: 'editor@example.com',
      deletedAt: null,
      role: { name: 'editor' },
    });

    const app = express();
    app.use('/api/media', mediaRouter);
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/media/${ID}`;

      const anonymous = await fetch(`${base}/preview`);
      assert.equal(anonymous.status, 401);

      const token = jwt.sign({ id: 'editor-1' }, JWT_SECRET, { expiresIn: '5m' });
      const authed = await fetch(`${base}/preview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(authed.status, 200);
      assert.equal(authed.headers.get('cache-control'), 'private, no-store');
      assert.equal(await authed.text(), 'webp-bytes');

      // The same unattached asset stays invisible on the public route.
      const publicRoute = await fetch(base);
      assert.equal(publicRoute.status, 404);
    } finally {
      p.user.findUnique = originalFindUser;
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe('unusable upload root degrades media cleanly', () => {
  const broken = () => new UploadRootError('UPLOAD_DIR is not usable (EACCES).');
  const EXPECTED = {
    error: 'Penyimpanan media sedang tidak tersedia.',
    code: 'MEDIA_STORAGE_UNAVAILABLE',
  };

  async function silently<T>(fn: () => Promise<T>): Promise<T> {
    const original = console.error;
    console.error = () => undefined;
    try {
      return await fn();
    } finally {
      console.error = original;
    }
  }

  it('uploads answer 503 MEDIA_STORAGE_UNAVAILABLE', async () => {
    setUploadRootForTesting(broken());
    const res = await silently(() =>
      postUpload([
        purposePart('publikasi-document'),
        filePart('laporan.pdf', PDF_BYTES, 'application/pdf'),
      ]),
    );
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, EXPECTED);
    assert.equal(db.assets.size, 0);
  });

  it('public and preview routes answer a clean 503 JSON with no path, not a 500', async () => {
    setUploadRootForTesting(broken());
    db.assets.set(ID, makeAsset({ id: ID, attachedAt: new Date() }));
    const request = { params: { id: ID }, query: {} } as unknown as Request;
    for (const handler of [publicMediaImageHandler, previewMediaHandler]) {
      const res = makeMediaRes();
      await silently(async () => handler(request, res as unknown as Response));
      assert.equal(res.statusCode, 503);
      assert.deepEqual(res.body, EXPECTED);
      assert.equal(JSON.stringify(res.body).includes(root), false);
    }
    // Unattached/unknown assets still answer the indistinguishable 404 before storage is consulted.
    db.assets.set(ID_DOC, makeAsset({ id: ID_DOC, attachedAt: null }));
    const res = makeMediaRes();
    await publicMediaImageHandler(
      { params: { id: ID_DOC }, query: {} } as unknown as Request,
      res as unknown as Response,
    );
    assert.equal(res.statusCode, 404);
  });

  it('a failed root init is never cached: the next call retries and succeeds', async () => {
    let calls = 0;
    const provider = createUploadRootProvider(async () => {
      calls += 1;
      if (calls < 3) throw new UploadRootError('UPLOAD_DIR is not usable (EACCES).');
      return '/srv/uploads';
    });
    await assert.rejects(provider.get(), UploadRootError);
    await assert.rejects(provider.get(), UploadRootError);
    assert.equal(await provider.get(), '/srv/uploads');
    // Success is cached: no further init.
    assert.equal(await provider.get(), '/srv/uploads');
    assert.equal(calls, 3);
  });

  it('concurrent callers share one in-flight init and a rejection clears it exactly once', async () => {
    let calls = 0;
    const provider = createUploadRootProvider(async () => {
      calls += 1;
      throw new UploadRootError('nope');
    });
    const results = await Promise.allSettled([provider.get(), provider.get(), provider.get()]);
    assert.equal(calls, 1);
    assert.equal(
      results.every((r) => r.status === 'rejected'),
      true,
    );
    await Promise.allSettled([provider.get()]);
    assert.equal(calls, 2);
  });

  it('media works again once the storage becomes usable', async () => {
    setUploadRootForTesting(broken());
    const failed = await silently(() =>
      postUpload([
        purposePart('publikasi-document'),
        filePart('laporan.pdf', PDF_BYTES, 'application/pdf'),
      ]),
    );
    assert.equal(failed.statusCode, 503);
    setUploadRootForTesting(root); // what a fixed mount looks like to the next request
    const ok = await postUpload([
      purposePart('publikasi-document'),
      filePart('laporan.pdf', PDF_BYTES, 'application/pdf'),
    ]);
    assert.equal(ok.statusCode, 201);
  });
});
