import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  createProseBlock,
  deleteProseBlock,
  reorderProseBlocks,
} from '../services/proseBlocks.service.js';
import {
  updateContentBlock,
  contentBlocksCache,
  getSlugCache,
  DEFAULT_CONTENT_BLOCKS,
} from '../services/contentBlocks.service.js';
import { HierarchyServiceError } from '../utils/hierarchyAuthoring.js';
import prisma from '../utils/prisma.js';
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

const expectError = (statusCode: number, code?: string) => (err: unknown) => {
  assert.ok(err instanceof HierarchyServiceError, `expected HierarchyServiceError, got ${err}`);
  assert.equal(err.statusCode, statusCode);
  if (code) assert.equal(err.code, code);
  return true;
};

describe('contentBlocks authoring (section prose blocks)', () => {
  let handle: FakeHierarchyHandle;
  let db: FakeHierarchyDb;

  beforeEach(() => {
    handle = installFakeHierarchyDb();
    db = handle.db;
    db.addPage();
    db.addChapter();
    db.addSection({ id: 'sec-1' });
  });
  afterEach(() => handle.restore());

  describe('createProseBlock', () => {
    it('creates a prose block attached to the section with generated slug and sortOrder max+1', async () => {
      db.addBlock({ id: 'b1', slug: 'pendahuluan', sortOrder: 0 });
      db.addBlock({ id: 'b2', slug: 'penutup', sortOrder: 6 });

      const result = await createProseBlock(
        'sec-1',
        { title: 'Metodologi Survei', body: 'Isi metodologi.' },
        actor,
        ctx,
      );

      assert.equal(result.block.slug, 'metodologi-survei');
      assert.equal(result.block.type, 'prose');
      assert.equal(result.block.sectionId, 'sec-1');
      assert.equal(result.block.sortOrder, 7);
      assert.equal(result.block.title, 'Metodologi Survei');
      assert.notEqual(result.section.updatedAt, T0_ISO);
      assert.equal(
        db.contentBlock.rows.find((b) => b.slug === 'metodologi-survei')!.updatedById,
        'u1',
      );
    });

    it('resolves collisions globally with -2/-3, including across sections', async () => {
      db.addSection({ id: 'sec-2', chapterId: 'ch-1', slug: 'lain', sortOrder: 1 });
      db.addBlock({ id: 'b1', sectionId: 'sec-2', slug: 'pendahuluan' });
      db.addBlock({ id: 'b2', sectionId: 'sec-2', slug: 'pendahuluan-2', sortOrder: 1 });

      const result = await createProseBlock(
        'sec-1',
        { title: 'Pendahuluan', body: 'x' },
        actor,
        ctx,
      );
      assert.equal(result.block.slug, 'pendahuluan-3');
    });

    it('suffixes a slug that already exists at the 100-character cap', async () => {
      const long = 'a'.repeat(100);
      db.addBlock({ id: 'b1', slug: long });
      db.addBlock({ id: 'b2', slug: `${'a'.repeat(98)}-2`, sortOrder: 1 });

      const result = await createProseBlock('sec-1', { title: long, body: 'x' }, actor, ctx);
      assert.equal(result.block.slug, `${'a'.repeat(98)}-3`);
      assert.equal(result.block.slug.length, 100);
    });

    it('never mints a slug that equals a standalone singleton slot (picks a free one instead)', async () => {
      const standalone = new Set(DEFAULT_CONTENT_BLOCKS.map((b) => b.slug));
      for (const block of DEFAULT_CONTENT_BLOCKS) {
        const { block: created } = await createProseBlock(
          'sec-1',
          { title: block.slug.replace(/-/g, ' '), body: 'x' },
          actor,
          ctx,
        );
        assert.equal(created.slug, `${block.slug}-2`);
        assert.equal(standalone.has(created.slug), false);
      }
    });

    it('accepts an ordinary title that is a reserved page word', async () => {
      const { block } = await createProseBlock('sec-1', { title: 'Public', body: 'x' }, actor, ctx);
      assert.equal(block.slug, 'public');
    });

    it('rejects HTML titles, empty bodies, unknown/standalone-shaped fields', async () => {
      for (const payload of [
        { title: '<h1>x</h1>', body: 'b' },
        { title: 'Ok', body: '   ' },
        { title: 'Ok' },
        { title: 'Ok', body: 'b', slug: 'sendiri' },
        { title: 'Ok', body: 'b', type: 'hero' },
        { title: 'Ok', body: 'b', sectionId: 'sec-2' },
        { title: 'Ok', body: 'x'.repeat(50_001) },
      ]) {
        await assert.rejects(createProseBlock('sec-1', payload, actor, ctx), expectError(400));
      }
      assert.equal(db.contentBlock.rows.length, 0);
    });

    it('404s for an unknown section', async () => {
      await assert.rejects(
        createProseBlock('nope', { title: 'T', body: 'b' }, actor, ctx),
        expectError(404),
      );
    });

    it('writes an info audit row without the body, in the same transaction', async () => {
      await createProseBlock('sec-1', { title: 'Baru', body: 'Rahasia isi' }, actor, ctx);

      const row = db.auditRows[0]!;
      assert.equal(row.action, 'content_block.created');
      assert.equal(row.severity, 'info');
      assert.equal(JSON.stringify(row.metadata).includes('Rahasia'), false);
      assert.equal((row.metadata as { bodyLength: number }).bodyLength, 11);

      db.failAudit = true;
      await assert.rejects(createProseBlock('sec-1', { title: 'Lain', body: 'x' }, actor, ctx));
      assert.equal(db.contentBlock.rows.length, 1);
      assert.equal(db.section.rows[0]!.updatedAt.getTime() > T0.getTime(), true);
    });

    it('retries on a slug unique violation raced by another section', async () => {
      // First attempt: a concurrent writer wins the slug between our read and our insert, so the
      // insert hits the unique index and the transaction rolls back; the winner stays committed.
      const originalTx = prisma.$transaction;
      let attempts = 0;
      prisma.$transaction = (async (...args: unknown[]) => {
        attempts += 1;
        try {
          return await (originalTx as (...a: unknown[]) => Promise<unknown>)(...args);
        } catch (err) {
          if (attempts === 1) db.addBlock({ id: 'race', sectionId: 'sec-9', slug: 'balapan' });
          throw err;
        }
      }) as unknown as typeof prisma.$transaction;
      const originalCreate = db.contentBlock.create;
      db.contentBlock.create = async (args) => {
        if (attempts === 1)
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        return originalCreate(args);
      };

      const result = await createProseBlock('sec-1', { title: 'Balapan', body: 'x' }, actor, ctx);

      assert.equal(attempts, 2);
      assert.equal(result.block.slug, 'balapan-2');
    });

    it('gives up with 409 after repeated unique violations', async () => {
      db.contentBlock.create = async () => {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      };
      await assert.rejects(
        createProseBlock('sec-1', { title: 'Balapan', body: 'x' }, actor, ctx),
        expectError(409),
      );
    });

    it('invalidates the list cache and the new slug cache after commit', async () => {
      const listBefore = contentBlocksCache.getVersion();
      const slugCache = getSlugCache('cache-baru');
      const slugBefore = slugCache.getVersion();

      await createProseBlock('sec-1', { title: 'Cache Baru', body: 'x' }, actor, ctx);

      assert.equal(contentBlocksCache.getVersion() > listBefore, true);
      assert.equal(slugCache.getVersion() > slugBefore, true);
    });
  });

  describe('deleteProseBlock', () => {
    beforeEach(() => {
      db.addBlock({ id: 'b1', slug: 'pendahuluan', title: 'Pendahuluan', sortOrder: 0 });
    });

    it('runs the delete transaction at READ COMMITTED', async () => {
      await deleteProseBlock('pendahuluan', T0_ISO, actor, ctx);
      assert.deepEqual(db.transactionOptions, [{ isolationLevel: 'ReadCommitted' }]);
    });

    it('deletes a section prose block, bumps the section token, audits at warning without the body', async () => {
      const result = await deleteProseBlock('pendahuluan', T0_ISO, actor, ctx);

      assert.equal(result.block.slug, 'pendahuluan');
      assert.notEqual(result.section.updatedAt, T0_ISO);
      assert.equal(db.contentBlock.rows.length, 0);
      const row = db.auditRows[0]!;
      assert.equal(row.action, 'content_block.deleted');
      assert.equal(row.severity, 'warning');
      assert.equal(JSON.stringify(row.metadata).includes('Isi pendahuluan'), false);
    });

    it('409 STALE_WRITE on a stale token; 400 without a token; 404 unknown', async () => {
      await assert.rejects(
        deleteProseBlock('pendahuluan', STALE, actor, ctx),
        expectError(409, 'STALE_WRITE'),
      );
      await assert.rejects(
        deleteProseBlock('pendahuluan', undefined, actor, ctx),
        expectError(400),
      );
      await assert.rejects(deleteProseBlock('tiada', T0_ISO, actor, ctx), expectError(404));
      assert.equal(db.contentBlock.rows.length, 1);
    });

    it('refuses every standalone singleton block (section_id NULL) with 409 STANDALONE_BLOCK_PROTECTED', async () => {
      for (const def of DEFAULT_CONTENT_BLOCKS) {
        db.addBlock({
          id: `s-${def.slug}`,
          sectionId: null,
          slug: def.slug,
          type: def.type,
          sortOrder: null,
        });
      }

      for (const def of DEFAULT_CONTENT_BLOCKS) {
        await assert.rejects(
          deleteProseBlock(def.slug, T0_ISO, actor, ctx),
          expectError(409, 'STANDALONE_BLOCK_PROTECTED'),
        );
      }
      assert.equal(db.contentBlock.rows.length, DEFAULT_CONTENT_BLOCKS.length + 1);
      assert.equal(db.auditRows.length, 0);
    });

    it('also protects a singleton slug if it were ever attached to a section', async () => {
      db.addBlock({
        id: 'odd',
        slug: 'landing-hero',
        type: 'hero',
        sectionId: 'sec-1',
        sortOrder: 5,
      });
      await assert.rejects(
        deleteProseBlock('landing-hero', T0_ISO, actor, ctx),
        expectError(409, 'STANDALONE_BLOCK_PROTECTED'),
      );
    });

    it('invalidates list and slug caches only on commit', async () => {
      const listBefore = contentBlocksCache.getVersion();
      const slugCache = getSlugCache('pendahuluan');
      const slugBefore = slugCache.getVersion();

      await assert.rejects(deleteProseBlock('pendahuluan', STALE, actor, ctx));
      assert.equal(contentBlocksCache.getVersion(), listBefore);

      await deleteProseBlock('pendahuluan', T0_ISO, actor, ctx);
      assert.equal(contentBlocksCache.getVersion() > listBefore, true);
      assert.equal(slugCache.getVersion() > slugBefore, true);
    });

    it('locks section before block and rolls back on audit failure', async () => {
      db.failAudit = true;
      await assert.rejects(deleteProseBlock('pendahuluan', T0_ISO, actor, ctx));
      const locks = db.lockLog.filter((l) => l.includes('FOR UPDATE'));
      assert.match(locks[0]!, /FROM sections WHERE id = \? FOR UPDATE/);
      assert.match(locks[1]!, /FROM content_blocks WHERE slug = \? FOR UPDATE/);
      assert.equal(db.contentBlock.rows.length, 1);
      assert.equal(db.section.rows[0]!.updatedAt.getTime(), T0.getTime());
    });
  });

  describe('reorderProseBlocks', () => {
    beforeEach(() => {
      db.addBlock({ id: 'b1', slug: 'satu', sortOrder: 0 });
      db.addBlock({ id: 'b2', slug: 'dua', sortOrder: 1 });
      db.addBlock({ id: 'b3', slug: 'tiga', sortOrder: 2 });
      // A standalone singleton must never be part of a section reorder.
      db.addBlock({
        id: 'hero',
        sectionId: null,
        slug: 'landing-hero',
        type: 'hero',
        sortOrder: null,
      });
    });

    const reversed = {
      expectedUpdatedAt: T0_ISO,
      items: [
        { id: 'b1', sortOrder: 2 },
        { id: 'b2', sortOrder: 1 },
        { id: 'b3', sortOrder: 0 },
      ],
    };

    it('reorders within the section, bumps the token, audits changed rows only', async () => {
      const result = await reorderProseBlocks('sec-1', reversed, actor, ctx);

      assert.deepEqual(
        result.blocks.map((b) => b.slug),
        ['tiga', 'dua', 'satu'],
      );
      assert.notEqual(result.section.updatedAt, T0_ISO);
      const row = db.auditRows[0]!;
      assert.equal(row.action, 'content_block.reordered');
      assert.equal(row.severity, 'info');
      assert.equal((row.metadata as { changes: unknown[] }).changes.length, 2);
    });

    it('no-op reorder writes nothing, audits nothing and drops no caches', async () => {
      const listBefore = contentBlocksCache.getVersion();

      const result = await reorderProseBlocks(
        'sec-1',
        {
          expectedUpdatedAt: T0_ISO,
          items: [
            { id: 'b1', sortOrder: 0 },
            { id: 'b2', sortOrder: 1 },
            { id: 'b3', sortOrder: 2 },
          ],
        },
        actor,
        ctx,
      );

      assert.equal(result.section.updatedAt, T0_ISO);
      assert.equal(db.auditRows.length, 0);
      assert.equal(contentBlocksCache.getVersion(), listBefore);
    });

    it('409 STALE_WRITE on a stale section token', async () => {
      await assert.rejects(
        reorderProseBlocks('sec-1', { ...reversed, expectedUpdatedAt: STALE }, actor, ctx),
        expectError(409, 'STALE_WRITE'),
      );
    });

    it('rejects a standalone block id in the items (400) and partial lists', async () => {
      await assert.rejects(
        reorderProseBlocks(
          'sec-1',
          {
            expectedUpdatedAt: T0_ISO,
            items: [
              { id: 'b1', sortOrder: 0 },
              { id: 'b2', sortOrder: 1 },
              { id: 'hero', sortOrder: 2 },
            ],
          },
          actor,
          ctx,
        ),
        expectError(400),
      );
      await assert.rejects(
        reorderProseBlocks(
          'sec-1',
          { expectedUpdatedAt: T0_ISO, items: [{ id: 'b1', sortOrder: 0 }] },
          actor,
          ctx,
        ),
        expectError(400),
      );
    });

    it('invalidates the per-slug caches of the section after commit', async () => {
      const slugCache = getSlugCache('satu');
      const before = slugCache.getVersion();
      await reorderProseBlocks('sec-1', reversed, actor, ctx);
      assert.equal(slugCache.getVersion() > before, true);
    });

    it('writes changed rows in ascending id order after locking section then blocks; rolls back on audit failure', async () => {
      const order: string[] = [];
      const original = db.contentBlock.update;
      db.contentBlock.update = async (args) => {
        order.push((args.where as { id: string }).id);
        return original(args);
      };
      db.failAudit = true;

      await assert.rejects(reorderProseBlocks('sec-1', reversed, actor, ctx));

      assert.deepEqual(order, ['b1', 'b3']);
      assert.match(db.lockLog[0]!, /FROM sections WHERE id = \? FOR UPDATE/);
      assert.match(
        db.lockLog[1]!,
        /FROM content_blocks WHERE section_id = \? ORDER BY id FOR UPDATE/,
      );
      assert.deepEqual(
        db.contentBlock.rows.filter((b) => b.sectionId === 'sec-1').map((b) => b.sortOrder),
        [0, 1, 2],
      );
    });

    it('404s for an unknown section', async () => {
      await assert.rejects(reorderProseBlocks('nope', reversed, actor, ctx), expectError(404));
    });
  });

  describe('updateContentBlock optional expectedUpdatedAt', () => {
    beforeEach(() => {
      db.addBlock({ id: 'b1', slug: 'pendahuluan', body: 'Lama' });
    });

    it('enforces the precondition when supplied: stale -> 409 STALE_WRITE, nothing written', async () => {
      await assert.rejects(
        updateContentBlock('pendahuluan', { body: 'Baru', expectedUpdatedAt: STALE }, actor, ctx),
        expectError(409, 'STALE_WRITE'),
      );
      assert.equal(db.contentBlock.rows[0]!.body, 'Lama');
      assert.equal(db.auditRows.length, 0);
    });

    it('applies the edit when the token matches', async () => {
      const updated = await updateContentBlock(
        'pendahuluan',
        { body: 'Baru', expectedUpdatedAt: T0_ISO },
        actor,
        ctx,
      );
      assert.equal(updated.body, 'Baru');
      assert.equal(db.auditRows[0]!.action, 'content_block.updated');
    });

    it('rejects an HTML or control-character title with 400, nothing written', async () => {
      for (const title of ['<b>Judul</b>', 'Judul\u0000', 'Judul\u202Eterbalik']) {
        await assert.rejects(
          updateContentBlock('pendahuluan', { title }, actor, ctx),
          expectError(400),
        );
      }
      assert.equal(db.contentBlock.rows[0]!.title, 'Pendahuluan');
      assert.equal(db.auditRows.length, 0);
    });

    it('accepts a clean title and still allows null to clear it', async () => {
      const renamed = await updateContentBlock('pendahuluan', { title: 'Judul Baru' }, actor, ctx);
      assert.equal(renamed.title, 'Judul Baru');
      const cleared = await updateContentBlock('pendahuluan', { title: null }, actor, ctx);
      assert.equal(cleared.title, null);
    });

    it('stays optional for existing clients', async () => {
      const updated = await updateContentBlock('pendahuluan', { body: 'Tanpa token' }, actor, ctx);
      assert.equal(updated.body, 'Tanpa token');
    });
  });
});
