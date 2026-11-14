import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { putPublikasiCatalog } from '../services/publikasiCatalog.service.js';
import { updateContentBlock, contentBlocksCache } from '../services/contentBlocks.service.js';
import { HierarchyServiceError } from '../utils/hierarchyAuthoring.js';
import {
  installFakeHierarchyDb,
  T0,
  type FakeHierarchyDb,
  type FakeHierarchyHandle,
} from './helpers/fakeHierarchyDb.js';

const actor = { id: 'u1', email: 'editor@manggar.go.id', role: 'editor' };
const ctx = { ipAddress: '127.0.0.1', userAgent: 'test-agent' };
const T0_ISO = T0.toISOString();
const ID = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const PDF = 'application/pdf';

const expectError = (statusCode: number, code?: string) => (err: unknown) => {
  assert.ok(err instanceof HierarchyServiceError, `expected HierarchyServiceError, got ${err}`);
  assert.equal(err.statusCode, statusCode);
  if (code) assert.equal(err.code, code);
  return true;
};

const item = (extra: Record<string, unknown> = {}) => ({
  category: 'Statistik',
  title: 'Manggar dalam Angka',
  description: 'Kompilasi data statistik.',
  isAvailableOnline: false,
  ...extra,
});
const withDoc = (n: number, extra: Record<string, unknown> = {}) =>
  item({ documentAssetId: ID(n), isAvailableOnline: true, ...extra });

const put = (publications: unknown[], expectedUpdatedAt = T0_ISO) =>
  putPublikasiCatalog(
    { title: 'Katalog', body: 'Koleksi dokumen.', publications, expectedUpdatedAt },
    actor,
    ctx,
  );

describe('publikasiCatalog.service', () => {
  let handle: FakeHierarchyHandle;
  let db: FakeHierarchyDb;

  const asset = (n: number) => db.mediaAsset.rows.find((a) => a.id === ID(n))!;
  const refs = (n: number) => db.mediaAssetReference.rows.filter((r) => r.assetId === ID(n));
  const block = () => db.contentBlock.rows.find((b) => b.slug === 'publikasi-katalog')!;
  const stored = () =>
    (block().metadata as { publications: Array<Record<string, unknown>> }).publications;

  beforeEach(() => {
    contentBlocksCache.invalidate();
    handle = installFakeHierarchyDb();
    db = handle.db;
    db.addBlock({
      id: 'blk-pub',
      sectionId: null,
      slug: 'publikasi-katalog',
      title: 'Katalog',
      body: 'Koleksi dokumen.',
      metadata: { publications: [] },
      sortOrder: null,
    });
    db.addMedia({
      id: ID(1),
      purpose: 'publikasi-document',
      kind: 'document',
      mimeType: PDF,
      byteSize: 2048,
    });
    db.addMedia({
      id: ID(2),
      purpose: 'publikasi-document',
      kind: 'document',
      mimeType: PDF,
      byteSize: 4096,
    });
    db.addMedia({ id: ID(3), purpose: 'publikasi-cover' });
    db.addMedia({ id: ID(4), purpose: 'cerita' });
  });
  afterEach(() => handle.restore());

  it('attaches the document and cover and derives file type and size from the asset', async () => {
    await put([withDoc(1, { coverAssetId: ID(3), coverIsAuto: true, fileSizeBytes: 1 })]);
    const [saved] = stored();
    assert.equal(saved!.fileType, 'PDF');
    assert.equal(saved!.fileSizeBytes, 2048);
    assert.equal(saved!.coverIsAuto, true);
    assert.match(String(saved!.id), /^[0-9a-f-]{36}$/);
    assert.ok(asset(1).attachedAt);
    assert.ok(asset(3).attachedAt);
    assert.equal(refs(1)[0]!.slot, 'publikasi-document');
    assert.equal(refs(3)[0]!.slot, 'publikasi-cover');
  });

  it('detaches an asset when its item is removed or its document is swapped', async () => {
    await put([withDoc(1)]);
    const id = stored()[0]!.id;
    await put([withDoc(2, { id })], block().updatedAt.toISOString());
    assert.equal(refs(1).length, 0);
    assert.equal(asset(1).attachedAt, null);
    assert.ok(asset(2).attachedAt);
    await put([], block().updatedAt.toISOString());
    assert.equal(refs(2).length, 0);
    assert.equal(asset(2).attachedAt, null);
  });

  it('audits which publications were added, changed, removed or reordered, by title', async () => {
    await put([item({ title: 'Satu' }), item({ title: 'Dua' })]);
    const [one, two] = stored();
    await put(
      [{ ...two!, title: 'Dua (revisi)' }, { ...one! }, item({ title: 'Tiga' })],
      block().updatedAt.toISOString(),
    );
    const metadata = (
      db.auditRows.at(-1)!.metadata as {
        changes: { metadata: { items: Record<string, unknown> } };
      }
    ).changes.metadata;
    assert.deepEqual(metadata.items, {
      added: ['Tiga'],
      removed: [],
      changed: ['Dua (revisi)'],
      reordered: true,
    });
  });

  it('keeps other stored metadata keys when saving the catalog', async () => {
    block().metadata = { publications: [], catatan: 'dipertahankan' };
    await put([item()]);
    assert.equal((block().metadata as Record<string, unknown>).catatan, 'dipertahankan');
  });

  it('audits counts only, never file names or ids', async () => {
    await put([withDoc(1, { coverAssetId: ID(3) })]);
    assert.equal(db.auditRows.length, 1);
    const json = JSON.stringify(db.auditRows[0]);
    assert.ok(!json.includes(ID(1)));
    assert.match(json, /"withDocument":1/);
  });

  it('a no-op save writes and audits nothing but keeps the attachment', async () => {
    await put([withDoc(1)]);
    const audits = db.auditRows.length;
    const token = block().updatedAt.toISOString();
    asset(1).attachedAt = null; // link lost behind our back
    refs(1).forEach((r) =>
      db.mediaAssetReference.rows.splice(db.mediaAssetReference.rows.indexOf(r), 1),
    );
    await put([{ ...stored()[0]! }], token);
    assert.equal(db.auditRows.length, audits);
    assert.ok(asset(1).attachedAt);
  });

  it('stores Zod-cleaned values (trimmed https href), not the raw input', async () => {
    await put([
      item({
        category: ' Infografis ',
        title: ' Dokumen ',
        href: '  https://example.com/dokumen.pdf  ',
        isAvailableOnline: true,
      }),
    ]);
    const [saved] = stored();
    assert.equal(saved!.href, 'https://example.com/dokumen.pdf');
    assert.equal(saved!.category, 'Infografis');
    assert.equal(saved!.title, 'Dokumen');
  });

  it('rejects a stale write with 409 STALE_WRITE', async () => {
    await assert.rejects(
      () => put([], '2026-09-30T00:00:00.000Z'),
      expectError(409, 'STALE_WRITE'),
    );
  });

  it('rejects an asset of the wrong purpose', async () => {
    await assert.rejects(() => put([withDoc(4)]), expectError(400));
    assert.equal(asset(4).attachedAt, null);
  });

  it('rejects a link together with an uploaded file', async () => {
    await assert.rejects(
      () => put([withDoc(1, { href: 'https://example.org/a.pdf' })]),
      expectError(400),
    );
  });

  it('rejects an online flag that disagrees with the source', async () => {
    await assert.rejects(() => put([item({ documentAssetId: ID(1) })]), expectError(400));
  });

  it('rejects an automatic-cover flag without a document, or without a cover', async () => {
    await assert.rejects(
      () =>
        put([
          item({
            href: 'https://example.com/a.pdf',
            isAvailableOnline: true,
            coverAssetId: ID(3),
            coverIsAuto: true,
          }),
        ]),
      expectError(400),
    );
    await assert.rejects(() => put([withDoc(1, { coverIsAuto: true })]), expectError(400));
  });

  it('rejects one asset shared by two items', async () => {
    await assert.rejects(() => put([withDoc(1), withDoc(1)]), expectError(400));
  });

  it('rejects more than 25 items', async () => {
    await assert.rejects(() => put(Array.from({ length: 26 }, () => item())), expectError(400));
  });

  it('generic content-block PATCH refuses catalog metadata changes but allows title', async () => {
    await assert.rejects(
      () =>
        updateContentBlock(
          'publikasi-katalog',
          { metadata: { publications: [item()] } },
          actor,
          ctx,
        ),
      expectError(409, 'PUBLIKASI_BLOCK_PROTECTED'),
    );
    const res = await updateContentBlock('publikasi-katalog', { title: 'Baru' }, actor, ctx);
    assert.equal(res.title, 'Baru');
  });
});
