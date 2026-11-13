import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { putSectionFigure, deleteSectionFigure } from '../services/sectionFigure.service.js';
import { createProseBlock, reorderProseBlocks } from '../services/proseBlocks.service.js';
import { updateContentBlock, contentBlocksCache } from '../services/contentBlocks.service.js';
import { deleteSection } from '../services/sections.service.js';
import { deleteProseBlock } from '../services/proseBlocks.service.js';
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
const STALE = '2026-09-30T00:00:00.000Z';
const ID = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;

const expectError = (statusCode: number, code?: string) => (err: unknown) => {
  assert.ok(err instanceof HierarchyServiceError, `expected HierarchyServiceError, got ${err}`);
  assert.equal(err.statusCode, statusCode);
  if (code) assert.equal(err.code, code);
  return true;
};

const photo = (n: number, extra: Record<string, unknown> = {}) => ({
  mediaId: ID(n),
  alt: `Foto contoh ${n}`,
  ...extra,
});
const single = (n: number) => ({ kind: 'photo', photos: [photo(n)] });
const group = (...ns: number[]) => ({ kind: 'photos', photos: ns.map((n) => photo(n)) });
const put = (figure: unknown, expectedUpdatedAt = T0_ISO, sectionId = 'sec-1') =>
  putSectionFigure(sectionId, { expectedUpdatedAt, figure }, actor, ctx);

describe('sectionFigure.service', () => {
  let handle: FakeHierarchyHandle;
  let db: FakeHierarchyDb;

  const asset = (n: number) => db.mediaAsset.rows.find((a) => a.id === ID(n))!;
  const refs = (n: number) => db.mediaAssetReference.rows.filter((r) => r.assetId === ID(n));
  const figureRow = (sectionId = 'sec-1') =>
    db.contentBlock.rows.find((b) => b.type === 'figure' && b.sectionId === sectionId);

  beforeEach(() => {
    handle = installFakeHierarchyDb();
    db = handle.db;
    db.addPage();
    db.addChapter();
    db.addSection({ id: 'sec-1' });
    for (const n of [1, 2, 3, 4]) db.addMedia({ id: ID(n) });
  });
  afterEach(() => handle.restore());

  describe('putSectionFigure: create', () => {
    it('creates a figure block with the deterministic slug, null sortOrder and empty body', async () => {
      const result = await put(single(1));

      assert.equal(result.block.type, 'figure');
      assert.equal(result.block.slug, 'figure-sec-1');
      assert.equal(result.block.sectionId, 'sec-1');
      assert.equal(result.block.sortOrder, null);
      assert.equal(result.block.title, null);
      assert.equal(result.block.body, '');
      assert.deepEqual(result.block.metadata, single(1));
      assert.equal(result.section.id, 'sec-1');
      assert.notEqual(result.section.updatedAt, T0_ISO);
      assert.deepEqual(Object.keys(result.section).sort(), ['id', 'updatedAt']);
    });

    it('attaches the media through the media service with a figure reference', async () => {
      const result = await put(group(1, 2));

      for (const n of [1, 2]) {
        assert.notEqual(asset(n).attachedAt, null, `asset ${n} attached`);
        assert.deepEqual(
          refs(n).map((r) => [r.referenceType, r.referenceId, r.slot]),
          [['content_block', figureRow()!.id, 'figure']],
        );
      }
      assert.equal(asset(3).attachedAt, null);
      assert.equal(result.block.id, figureRow()!.id);
    });

    it('accepts a bars-only diagram (no media)', async () => {
      await put({
        kind: 'diagram',
        title: 'Usia',
        bars: { unit: 'jiwa', items: [{ label: 'A', value: 4 }] },
      });
      assert.equal(db.mediaAssetReference.rows.length, 0);
      assert.equal(figureRow()!.metadata.kind, 'diagram');
    });

    it('stores blank optional fields as absent keys', async () => {
      await put({ kind: 'photo', photos: [photo(1, { caption: ' ', credit: '' })] });
      assert.deepEqual(Object.keys(figureRow()!.metadata.photos[0]).sort(), ['alt', 'mediaId']);
    });

    it('audits kind and photo count only, never alt text or captions', async () => {
      await put({ kind: 'photos', photos: [photo(1, { caption: 'Sangat rahasia' }), photo(2)] });

      assert.equal(db.auditRows.length, 1);
      const row = db.auditRows[0]!;
      assert.equal(row.action, 'section.figure_saved');
      assert.equal(row.severity, 'info');
      assert.deepEqual(row.metadata, { sectionId: 'sec-1', kind: 'photos', photoCount: 2 });
      assert.equal(JSON.stringify(row).includes('rahasia'), false);
      assert.equal(JSON.stringify(row).includes('Foto contoh'), false);
    });

    it('invalidates the public content-block cache after commit', async () => {
      contentBlocksCache.setCommitted([]);
      assert.equal(contentBlocksCache.has(), true);
      await put(single(1));
      assert.equal(contentBlocksCache.has(), false);
    });

    it('runs ReadCommitted so post-lock reads (reference counts) are current', async () => {
      await put(single(1));
      assert.deepEqual(db.transactionOptions, [{ isolationLevel: 'ReadCommitted' }]);
    });

    it('locks the section before the figure block', async () => {
      await put(single(1));
      assert.match(db.lockLog[0]!, /FROM sections WHERE id = \? FOR UPDATE/);
      assert.match(db.lockLog[1]!, /FROM content_blocks WHERE slug = \? FOR UPDATE/);
      assert.match(db.lockLog[2]!, /FROM media_assets WHERE id IN .* ORDER BY id FOR UPDATE/);
    });
  });

  describe('putSectionFigure: replace', () => {
    it('swaps media: kept stays attached, removed is detached, added is attached', async () => {
      const first = await put(group(1, 2));
      const t1 = first.section.updatedAt;

      const second = await put(group(2, 3), t1);

      assert.equal(second.block.id, first.block.id, 'same block is replaced in place');
      assert.equal(db.contentBlock.rows.filter((b) => b.type === 'figure').length, 1);
      assert.equal(asset(1).attachedAt, null, 'removed photo is unpublished');
      assert.notEqual(asset(1).detachedAt, null, 'removed photo starts its grace period');
      assert.equal(refs(1).length, 0);
      assert.notEqual(asset(2).attachedAt, null);
      assert.equal(asset(2).detachedAt, null);
      assert.equal(refs(2).length, 1);
      assert.notEqual(asset(3).attachedAt, null);
      assert.notEqual(second.section.updatedAt, t1);
    });

    it('switching from photos to a bars-only diagram detaches everything', async () => {
      const first = await put(group(1, 2));
      await put(
        { kind: 'diagram', title: 'T', bars: { items: [{ label: 'A', value: 1 }] } },
        first.section.updatedAt,
      );
      assert.equal(asset(1).attachedAt, null);
      assert.equal(asset(2).attachedAt, null);
      assert.equal(db.mediaAssetReference.rows.length, 0);
    });

    it('saving the identical figure again is a no-op: nothing written, audited or invalidated', async () => {
      const first = await put(single(1));
      const auditCount = db.auditRows.length;
      contentBlocksCache.setCommitted([]);

      const again = await put(single(1), first.section.updatedAt);

      assert.equal(again.section.updatedAt, first.section.updatedAt);
      assert.equal(db.auditRows.length, auditCount);
      assert.equal(contentBlocksCache.has(), true);
    });

    describe('re-saving the identical figure re-asserts the photo attachment', () => {
      /** Bookkeeping lost behind the figure's back (e.g. cleanup unpublished the photo). */
      const loseBookkeeping = (n: number) => {
        asset(n).attachedAt = null;
        asset(n).detachedAt = T0;
        db.mediaAssetReference.rows = db.mediaAssetReference.rows.filter(
          (r) => r.assetId !== ID(n),
        );
      };

      it('re-attaches an unpublished photo while writing, auditing and bumping nothing', async () => {
        const first = await put(group(1, 2));
        const auditCount = db.auditRows.length;
        const blockBefore = JSON.stringify(figureRow());
        loseBookkeeping(1);
        contentBlocksCache.setCommitted([]);

        const again = await put(group(1, 2), first.section.updatedAt);

        assert.notEqual(asset(1).attachedAt, null, 'photo is published again');
        assert.equal(asset(1).detachedAt, null);
        assert.deepEqual(
          refs(1).map((r) => [r.referenceType, r.referenceId, r.slot]),
          [['content_block', figureRow()!.id, 'figure']],
        );
        assert.equal(refs(2).length, 1, 'the healthy photo keeps a single reference');
        assert.equal(again.section.updatedAt, first.section.updatedAt);
        assert.equal(again.block.id, first.block.id);
        assert.equal(db.auditRows.length, auditCount);
        assert.equal(JSON.stringify(figureRow()), blockBefore);
        assert.equal(contentBlocksCache.has(), true);
      });

      it('a photo claimed for deletion answers the same plain 400 as a normal save, writing nothing', async () => {
        const first = await put(single(1));
        loseBookkeeping(1);
        asset(1).cleanupClaimedAt = T0;
        const auditCount = db.auditRows.length;

        await assert.rejects(put(single(1), first.section.updatedAt), (err) => {
          expectError(400)(err);
          assert.match((err as Error).message, /tidak ditemukan/);
          return true;
        });
        assert.equal(db.auditRows.length, auditCount);
        assert.equal(asset(1).attachedAt, null);
      });

      it('a bars-only diagram has nothing to attach and stays a plain no-op', async () => {
        const diagram = {
          kind: 'diagram',
          title: 'T',
          bars: { items: [{ label: 'A', value: 1 }] },
        };
        const first = await put(diagram);
        const again = await put(diagram, first.section.updatedAt);
        assert.equal(again.section.updatedAt, first.section.updatedAt);
      });
    });

    it('a photo shared with another section stays attached when one figure drops it', async () => {
      db.addSection({ id: 'sec-2', slug: 'lain', sortOrder: 1 });
      const a = await put(single(1));
      await put(single(1), T0_ISO, 'sec-2');
      assert.equal(refs(1).length, 2);

      await put(single(2), a.section.updatedAt);

      assert.equal(refs(1).length, 1);
      assert.notEqual(asset(1).attachedAt, null, 'still referenced by the other section');
    });
  });

  describe('putSectionFigure: refusals', () => {
    it('409 STALE_WRITE with the current token; nothing changes', async () => {
      await assert.rejects(put(single(1), STALE), (err) => {
        expectError(409, 'STALE_WRITE')(err);
        assert.equal((err as HierarchyServiceError).details?.currentUpdatedAt, T0_ISO);
        return true;
      });
      assert.equal(figureRow(), undefined);
      assert.equal(asset(1).attachedAt, null);
    });

    it('404 for an unknown section', async () => {
      await assert.rejects(put(single(1), T0_ISO, 'nope'), expectError(404));
    });

    it('400 for a missing figure, a missing token, and unknown body keys', async () => {
      await assert.rejects(
        putSectionFigure('sec-1', { expectedUpdatedAt: T0_ISO }, actor, ctx),
        expectError(400),
      );
      await assert.rejects(
        putSectionFigure('sec-1', { figure: single(1) }, actor, ctx),
        expectError(400),
      );
      await assert.rejects(
        putSectionFigure(
          'sec-1',
          { expectedUpdatedAt: T0_ISO, figure: single(1), x: 1 },
          actor,
          ctx,
        ),
        expectError(400),
      );
      await assert.rejects(putSectionFigure('sec-1', [], actor, ctx), expectError(400));
    });

    it('400 for an invalid figure with a plain sentence and no database writes', async () => {
      await assert.rejects(put({ kind: 'photo', photos: [{ mediaId: ID(1) }] }), (err) => {
        expectError(400)(err);
        assert.match((err as Error).message, /Teks alternatif foto/);
        return true;
      });
      assert.equal(figureRow(), undefined);
      assert.equal(db.auditRows.length, 0);
    });

    it('400 for media that was uploaded for another purpose; the whole write rolls back', async () => {
      db.mediaAsset.rows.find((a) => a.id === ID(2))!.purpose = 'portal-hero';
      await assert.rejects(put(group(1, 2)), (err) => {
        expectError(400)(err);
        assert.match((err as Error).message, /tidak dapat dipakai/);
        assert.equal(/purpose|MEDIA_/.test((err as Error).message), false);
        return true;
      });
      assert.equal(figureRow(), undefined);
      assert.equal(asset(1).attachedAt, null, 'the valid photo was not attached either');
      assert.equal(db.mediaAssetReference.rows.length, 0);
      assert.equal(db.auditRows.length, 0);
    });

    it('400 for media that does not exist or is claimed for deletion', async () => {
      await assert.rejects(put(single(9)), (err) => {
        expectError(400)(err);
        assert.match((err as Error).message, /tidak ditemukan/);
        return true;
      });
      asset(1).cleanupClaimedAt = T0;
      await assert.rejects(put(single(1)), expectError(400));
      assert.equal(figureRow(), undefined);
    });

    it('a failed audit write rolls the figure and the attach back', async () => {
      db.failAudit = true;
      await assert.rejects(put(single(1)));
      assert.equal(figureRow(), undefined);
      assert.equal(asset(1).attachedAt, null);
      assert.equal(db.mediaAssetReference.rows.length, 0);
      assert.equal(db.section.rows[0]!.updatedAt.getTime(), T0.getTime());
    });

    it('409 when a prose block already holds the reserved figure slug', async () => {
      db.addBlock({ id: 'squat', slug: 'figure-sec-1', type: 'prose' });
      await assert.rejects(put(single(1)), expectError(409));
      assert.equal(asset(1).attachedAt, null);
    });
  });

  describe('putSectionFigure: lost race on the figure slug', () => {
    it('turns a unique violation on insert into a 409 conflict with the current token', async () => {
      // The other writer's figure is committed by the time we look after the rollback.
      let raced = false;
      const originalFind = db.contentBlock.findUnique;
      db.contentBlock.findUnique = (async (args: unknown) =>
        raced ? { id: 'winner' } : originalFind.call(db.contentBlock, args as never)) as never;
      db.contentBlock.create = async () => {
        raced = true;
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      };

      await assert.rejects(put(single(1)), (err) => {
        expectError(409, 'STALE_WRITE')(err);
        assert.match((err as Error).message, /pengguna lain/);
        assert.equal(/P2002|unique/i.test((err as Error).message), false);
        assert.equal((err as HierarchyServiceError).details?.currentUpdatedAt, T0_ISO);
        return true;
      });
      assert.equal(asset(1).attachedAt, null);
      assert.equal(db.mediaAssetReference.rows.length, 0);
    });

    it('does not relabel a unique violation that is not the figure-slug race', async () => {
      // e.g. the media reference tuple: no figure exists for the section afterwards.
      db.contentBlock.create = async () => {
        throw Object.assign(new Error('Unique constraint failed on tuple'), { code: 'P2002' });
      };
      await assert.rejects(put(single(1)), /Unique constraint failed on tuple/);
    });

    it('does not mask other insert failures', async () => {
      db.contentBlock.create = async () => {
        throw new Error('disk full');
      };
      await assert.rejects(put(single(1)), /disk full/);
    });
  });

  describe('deleteSectionFigure', () => {
    const del = (expected: string, sectionId = 'sec-1') =>
      deleteSectionFigure(sectionId, expected, actor, ctx);

    it('removes the block, detaches its media, bumps the section token and audits at warning', async () => {
      const saved = await put(group(1, 2));

      const result = await del(saved.section.updatedAt);

      assert.equal(figureRow(), undefined);
      for (const n of [1, 2]) {
        assert.equal(asset(n).attachedAt, null);
        assert.notEqual(asset(n).detachedAt, null);
        assert.equal(refs(n).length, 0);
      }
      assert.notEqual(result.section.updatedAt, saved.section.updatedAt);
      assert.deepEqual(Object.keys(result).sort(), ['section']);
      const audit = db.auditRows.at(-1)!;
      assert.equal(audit.action, 'section.figure_deleted');
      assert.equal(audit.severity, 'warning');
      assert.deepEqual(audit.metadata, { sectionId: 'sec-1', kind: 'photos' });
    });

    it('404 FIGURE_NOT_FOUND when the section has no figure', async () => {
      await assert.rejects(del(T0_ISO), expectError(404, 'FIGURE_NOT_FOUND'));
    });

    it('404 for an unknown section; 400 for a missing or invalid token', async () => {
      await assert.rejects(del(T0_ISO, 'nope'), expectError(404));
      await assert.rejects(deleteSectionFigure('sec-1', undefined, actor, ctx), expectError(400));
      await assert.rejects(deleteSectionFigure('sec-1', 'soon', actor, ctx), expectError(400));
    });

    it('409 STALE_WRITE and nothing deleted when the token is old', async () => {
      await put(single(1));
      await assert.rejects(del(T0_ISO), expectError(409, 'STALE_WRITE'));
      assert.notEqual(figureRow(), undefined);
      assert.notEqual(asset(1).attachedAt, null);
    });

    it("does not touch another section's figure", async () => {
      db.addSection({ id: 'sec-2', slug: 'lain', sortOrder: 1 });
      const a = await put(single(1));
      await put(single(2), T0_ISO, 'sec-2');

      await del(a.section.updatedAt);

      assert.equal(figureRow('sec-1'), undefined);
      assert.notEqual(figureRow('sec-2'), undefined);
      assert.notEqual(asset(2).attachedAt, null);
    });

    it('a figure on another section does not satisfy this section delete', async () => {
      db.addSection({ id: 'sec-2', slug: 'lain', sortOrder: 1 });
      await put(single(1), T0_ISO, 'sec-2');
      await assert.rejects(del(T0_ISO, 'sec-1'), expectError(404, 'FIGURE_NOT_FOUND'));
    });

    it('a failed audit write rolls the delete and the detach back', async () => {
      const saved = await put(single(1));
      db.failAudit = true;
      await assert.rejects(del(saved.section.updatedAt));
      assert.notEqual(figureRow(), undefined);
      assert.notEqual(asset(1).attachedAt, null);
      assert.equal(refs(1).length, 1);
    });

    it('invalidates the public content-block cache after commit', async () => {
      const saved = await put(single(1));
      contentBlocksCache.setCommitted([]);
      await del(saved.section.updatedAt);
      assert.equal(contentBlocksCache.has(), false);
    });
  });

  describe('a damaged stored figure can always be removed or replaced', () => {
    /** A stored figure whose photos no longer pass the save-time checks: asset 1 belongs to another
     * purpose, asset 9 does not exist, asset 2 is healthy. */
    const seedDamagedFigure = () => {
      db.mediaAsset.rows.find((a) => a.id === ID(1))!.purpose = 'portal-hero';
      for (const n of [1, 2]) {
        asset(n).attachedAt = T0;
        db.mediaAssetReference.rows.push({
          id: `ref-${n}`,
          assetId: ID(n),
          referenceType: 'content_block',
          referenceId: 'blk-fig',
          slot: 'figure',
        });
      }
      db.addBlock({
        id: 'blk-fig',
        slug: 'figure-sec-1',
        type: 'figure',
        title: null,
        body: '',
        sortOrder: null,
        metadata: { kind: 'photos', photos: [photo(1), photo(9), photo(2)] },
      });
    };

    it('DELETE removes the block and releases what it can, without the save-time sentence', async () => {
      seedDamagedFigure();

      const result = await deleteSectionFigure('sec-1', T0_ISO, actor, ctx);

      assert.equal(figureRow(), undefined);
      assert.notEqual(result.section.updatedAt, T0_ISO);
      assert.equal(asset(2).attachedAt, null, 'the healthy photo is released');
      assert.notEqual(asset(2).detachedAt, null);
      assert.equal(refs(1).length, 0, 'the wrong-purpose reference is dropped too');
      assert.equal(refs(2).length, 0);
      const audit = db.auditRows.at(-1)!;
      assert.equal(audit.action, 'section.figure_deleted');
      assert.deepEqual(audit.metadata, { sectionId: 'sec-1', kind: 'photos' });
    });

    it('DELETE tolerates a photo already claimed for deletion', async () => {
      seedDamagedFigure();
      asset(2).cleanupClaimedAt = T0;
      await deleteSectionFigure('sec-1', T0_ISO, actor, ctx);
      assert.equal(figureRow(), undefined);
    });

    it('PUT can replace a damaged figure (the repair path)', async () => {
      seedDamagedFigure();

      const result = await put(single(3));

      assert.equal(result.block.id, 'blk-fig');
      assert.deepEqual(figureRow()!.metadata, single(3));
      assert.equal(refs(1).length, 0);
      assert.equal(refs(2).length, 0);
      assert.equal(refs(3).length, 1);
      assert.notEqual(asset(3).attachedAt, null);
    });

    it('a delete failure is never worded as a re-upload request', async () => {
      seedDamagedFigure();
      db.failAudit = true;
      await assert.rejects(deleteSectionFigure('sec-1', T0_ISO, actor, ctx), (err) => {
        assert.equal(/unggah ulang/i.test((err as Error).message), false);
        return true;
      });
    });
  });

  describe('interaction with the rest of the hierarchy', () => {
    it('a section that holds a figure cannot be deleted: HAS_DEPENDENTS counts it as a figure and names it', async () => {
      const saved = await put(single(1));
      await assert.rejects(deleteSection('sec-1', saved.section.updatedAt, actor, ctx), (err) => {
        expectError(409, 'HAS_DEPENDENTS')(err);
        assert.deepEqual((err as HierarchyServiceError).details?.dependencies, {
          contentBlocks: 0,
          figures: 1,
          indicators: 0,
          indicatorTables: 0,
        });
        assert.match((err as Error).message, /gambar: 1/);
        return true;
      });
      assert.notEqual(figureRow(), undefined);
    });

    it('prose creation ignores the figure: sortOrder continues from prose siblings only', async () => {
      db.addBlock({ id: 'p1', slug: 'pendahuluan', sortOrder: 0 });
      const saved = await put(single(1));

      const created = await createProseBlock(
        'sec-1',
        { title: 'Penutup', body: 'Isi.' },
        actor,
        ctx,
      );

      assert.equal(created.block.sortOrder, 1);
      assert.notEqual(created.section.updatedAt, saved.section.updatedAt);
      assert.equal(figureRow()!.sortOrder, null);
    });

    it('prose reorder names only prose blocks; the figure is neither required nor accepted', async () => {
      db.addBlock({ id: 'p1', slug: 'satu', sortOrder: 0 });
      db.addBlock({ id: 'p2', slug: 'dua', sortOrder: 1 });
      const saved = await put(single(1));
      const figureId = figureRow()!.id;

      const swapped = await reorderProseBlocks(
        'sec-1',
        {
          expectedUpdatedAt: saved.section.updatedAt,
          items: [
            { id: 'p1', sortOrder: 1 },
            { id: 'p2', sortOrder: 0 },
          ],
        },
        actor,
        ctx,
      );
      assert.deepEqual(
        swapped.blocks.map((b) => b.id),
        ['p2', 'p1'],
        'the figure is not part of the reordered list',
      );
      assert.equal(figureRow()!.sortOrder, null);

      await assert.rejects(
        reorderProseBlocks(
          'sec-1',
          {
            expectedUpdatedAt: swapped.section.updatedAt,
            items: [
              { id: 'p1', sortOrder: 0 },
              { id: 'p2', sortOrder: 1 },
              { id: figureId, sortOrder: 2 },
            ],
          },
          actor,
          ctx,
        ),
        expectError(400),
      );
    });

    it('prose edits and figure saves do not disturb each other', async () => {
      db.addBlock({ id: 'p1', slug: 'satu', sortOrder: 0 });
      await put(single(1));
      const updated = await updateContentBlock('satu', { body: 'Baru' }, actor, ctx);
      assert.equal(updated.body, 'Baru');
      assert.deepEqual(figureRow()!.metadata, single(1));
    });
  });

  describe('generic content-block endpoints refuse figure blocks', () => {
    it('PATCH is 409 FIGURE_BLOCK_PROTECTED and changes nothing', async () => {
      await put(single(1));
      const before = JSON.stringify(figureRow());

      for (const payload of [
        { body: 'Teks' },
        { metadata: { kind: 'photo', photos: [photo(2)] } },
        { title: 'Judul', expectedUpdatedAt: STALE },
      ]) {
        await assert.rejects(updateContentBlock('figure-sec-1', payload, actor, ctx), (err) => {
          expectError(409, 'FIGURE_BLOCK_PROTECTED')(err);
          assert.match((err as Error).message, /pengaturan gambar/);
          return true;
        });
      }
      assert.equal(JSON.stringify(figureRow()), before);
      assert.equal(asset(2).attachedAt, null);
    });

    it('DELETE is 409 FIGURE_BLOCK_PROTECTED and the media stays attached', async () => {
      const saved = await put(single(1));
      await assert.rejects(
        deleteProseBlock('figure-sec-1', saved.section.updatedAt, actor, ctx),
        expectError(409, 'FIGURE_BLOCK_PROTECTED'),
      );
      assert.notEqual(figureRow(), undefined);
      assert.notEqual(asset(1).attachedAt, null);
      assert.equal(refs(1).length, 1);
    });
  });
});
