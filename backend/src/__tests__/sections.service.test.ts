import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  createSection,
  updateSection,
  deleteSection,
  reorderSections,
} from '../services/sections.service.js';
import { HierarchyServiceError } from '../utils/hierarchyAuthoring.js';
import { indicatorByIdCache } from '../services/indicators.service.js';
import { VersionedTtlCache } from '../utils/lockTransactionCache.js';
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

describe('sections.service', () => {
  let handle: FakeHierarchyHandle;
  let db: FakeHierarchyDb;

  beforeEach(() => {
    handle = installFakeHierarchyDb();
    db = handle.db;
    db.addPage();
    db.addChapter({ id: 'ch-1' });
  });
  afterEach(() => handle.restore());

  describe('createSection', () => {
    it('creates a section with generated slug, sortOrder max+1 and bumps the chapter token', async () => {
      db.addSection({ id: 's-a', slug: 'ringkasan', sortOrder: 3 });

      const result = await createSection('ch-1', { title: 'Data Rinci' }, actor, ctx);

      assert.equal(result.section.slug, 'data-rinci');
      assert.equal(result.section.sortOrder, 4);
      assert.equal(result.section.chapterId, 'ch-1');
      assert.notEqual(result.chapter.updatedAt, T0_ISO);
      assert.equal(db.auditRows[0]!.action, 'section.created');
      assert.equal(db.auditRows[0]!.severity, 'info');
    });

    it('resolves collisions per chapter with -2/-3 suffixes', async () => {
      db.addChapter({ id: 'ch-2', slug: 'bab-dua', sortOrder: 1 });
      db.addSection({ id: 's-a', slug: 'ringkasan' });
      db.addSection({ id: 's-b', slug: 'ringkasan-2', sortOrder: 1 });
      db.addSection({ id: 's-c', chapterId: 'ch-2', slug: 'ringkasan' });

      const next = await createSection('ch-1', { title: 'Ringkasan' }, actor, ctx);
      assert.equal(next.section.slug, 'ringkasan-3');

      const other = await createSection('ch-2', { title: 'Ringkasan' }, actor, ctx);
      assert.equal(other.section.slug, 'ringkasan-2');
    });

    it('rejects HTML, reserved, empty titles and client-supplied slugs', async () => {
      for (const payload of [
        { title: '<script>x</script>' },
        { title: 'Admin' },
        { title: '' },
        { title: 'Ok', slug: 'x' },
        { title: 'Ok', sortOrder: 5 },
      ]) {
        await assert.rejects(createSection('ch-1', payload, actor, ctx), expectError(400));
      }
      assert.equal(db.section.rows.length, 0);
    });

    it('404s for an unknown chapter and rolls back when the audit write fails', async () => {
      await assert.rejects(createSection('ch-x', { title: 'Baru' }, actor, ctx), expectError(404));

      db.failAudit = true;
      await assert.rejects(createSection('ch-1', { title: 'Baru' }, actor, ctx));
      assert.equal(db.section.rows.length, 0);
      assert.equal(db.chapter.rows[0]!.updatedAt.getTime(), T0.getTime());
    });
  });

  describe('updateSection', () => {
    beforeEach(() => {
      db.addSection({ id: 'sec-1', slug: 'ringkasan', title: 'Ringkasan' });
    });

    it('renames, keeps the slug, audits before/after', async () => {
      const updated = await updateSection(
        'sec-1',
        { title: 'Ikhtisar', expectedUpdatedAt: T0_ISO },
        actor,
        ctx,
      );
      assert.equal(updated.title, 'Ikhtisar');
      assert.equal(updated.slug, 'ringkasan');
      assert.deepEqual((db.auditRows[0]!.metadata as { changes: unknown }).changes, {
        title: { before: 'Ringkasan', after: 'Ikhtisar' },
      });
    });

    it('409 STALE_WRITE on a stale token; 400 when the token is missing', async () => {
      await assert.rejects(
        updateSection('sec-1', { title: 'X', expectedUpdatedAt: STALE }, actor, ctx),
        expectError(409, 'STALE_WRITE'),
      );
      await assert.rejects(updateSection('sec-1', { title: 'X' }, actor, ctx), expectError(400));
    });

    it('no-op rename writes and audits nothing', async () => {
      await updateSection('sec-1', { title: 'Ringkasan', expectedUpdatedAt: T0_ISO }, actor, ctx);
      assert.equal(db.auditRows.length, 0);
      assert.equal(db.section.rows[0]!.updatedAt.getTime(), T0.getTime());
    });

    it('404s for an unknown section', async () => {
      await assert.rejects(
        updateSection('nope', { title: 'X', expectedUpdatedAt: T0_ISO }, actor, ctx),
        expectError(404),
      );
    });
  });

  describe('deleteSection', () => {
    beforeEach(() => {
      db.addSection({ id: 'sec-1', slug: 'ringkasan' });
    });

    it('runs the delete transaction at READ COMMITTED', async () => {
      await deleteSection('sec-1', T0_ISO, actor, ctx);
      assert.deepEqual(db.transactionOptions, [{ isolationLevel: 'ReadCommitted' }]);
    });

    it('deletes an empty section, bumps the chapter token and audits at warning', async () => {
      const result = await deleteSection('sec-1', T0_ISO, actor, ctx);

      assert.equal(result.section.id, 'sec-1');
      assert.notEqual(result.chapter.updatedAt, T0_ISO);
      assert.equal(db.section.rows.length, 0);
      assert.equal(db.auditRows[0]!.action, 'section.deleted');
      assert.equal(db.auditRows[0]!.severity, 'warning');
    });

    for (const [label, seed, expected] of [
      [
        'content blocks',
        (db: FakeHierarchyDb) => db.addBlock({ sectionId: 'sec-1' }),
        { contentBlocks: 1, indicators: 0, indicatorTables: 0 },
      ],
      [
        'indicators',
        (db: FakeHierarchyDb) => db.indicator.rows.push({ id: 'i', sectionId: 'sec-1' }),
        { contentBlocks: 0, indicators: 1, indicatorTables: 0 },
      ],
      [
        'indicator tables',
        (db: FakeHierarchyDb) => db.indicatorTable.rows.push({ id: 't', sectionId: 'sec-1' }),
        { contentBlocks: 0, indicators: 0, indicatorTables: 1 },
      ],
    ] as const) {
      it(`is blocked with 409 HAS_DEPENDENTS when ${label} remain`, async () => {
        seed(db);

        await assert.rejects(deleteSection('sec-1', T0_ISO, actor, ctx), (err: unknown) => {
          expectError(409, 'HAS_DEPENDENTS')(err);
          assert.deepEqual((err as HierarchyServiceError).details, { dependencies: expected });
          return true;
        });
        assert.equal(db.section.rows.length, 1);
        assert.equal(db.auditRows.length, 0);
      });
    }

    it('409 STALE_WRITE on stale token, 404 unknown, 400 without a token', async () => {
      await assert.rejects(
        deleteSection('sec-1', STALE, actor, ctx),
        expectError(409, 'STALE_WRITE'),
      );
      await assert.rejects(deleteSection('nope', T0_ISO, actor, ctx), expectError(404));
      await assert.rejects(deleteSection('sec-1', '', actor, ctx), expectError(400));
    });

    it('locks chapter before section and rolls back when the audit write fails', async () => {
      db.failAudit = true;
      await assert.rejects(deleteSection('sec-1', T0_ISO, actor, ctx));
      const locks = db.lockLog.filter((l) => l.includes('FOR UPDATE'));
      assert.match(locks[0]!, /FROM chapters WHERE id = \? FOR UPDATE/);
      assert.match(locks[1]!, /FROM sections WHERE id = \? FOR UPDATE/);
      assert.equal(db.section.rows.length, 1);
      assert.equal(db.chapter.rows[0]!.updatedAt.getTime(), T0.getTime());
    });

    it('invalidates indicator caches only after a committed delete', async () => {
      const key = 'id:ind-2';
      indicatorByIdCache.set(key, new VersionedTtlCache({ ttlMs: 60_000, baseClient: prisma }));
      db.addBlock({ sectionId: 'sec-1' });
      await assert.rejects(deleteSection('sec-1', T0_ISO, actor, ctx));
      assert.equal(indicatorByIdCache.has(key), true);

      db.contentBlock.rows.length = 0;
      await deleteSection('sec-1', T0_ISO, actor, ctx);
      assert.equal(indicatorByIdCache.has(key), false);
    });
  });

  describe('reorderSections', () => {
    beforeEach(() => {
      db.addSection({ id: 's-a', slug: 'a', sortOrder: 0 });
      db.addSection({ id: 's-b', slug: 'b', sortOrder: 1 });
    });

    const swap = {
      expectedUpdatedAt: T0_ISO,
      items: [
        { id: 's-a', sortOrder: 1 },
        { id: 's-b', sortOrder: 0 },
      ],
    };

    it('applies the order, bumps the chapter token and audits once at info', async () => {
      const result = await reorderSections('ch-1', swap, actor, ctx);

      assert.deepEqual(
        result.sections.map((s) => s.id),
        ['s-b', 's-a'],
      );
      assert.notEqual(result.chapter.updatedAt, T0_ISO);
      assert.equal(db.auditRows.length, 1);
      assert.equal(db.auditRows[0]!.action, 'section.reordered');
      assert.equal(db.auditRows[0]!.severity, 'info');
    });

    it('no-op reorder writes and audits nothing', async () => {
      const result = await reorderSections(
        'ch-1',
        {
          expectedUpdatedAt: T0_ISO,
          items: [
            { id: 's-a', sortOrder: 0 },
            { id: 's-b', sortOrder: 1 },
          ],
        },
        actor,
        ctx,
      );
      assert.equal(result.chapter.updatedAt, T0_ISO);
      assert.equal(db.auditRows.length, 0);
    });

    it('409 STALE_WRITE when the chapter changed; 400 for sections of another chapter', async () => {
      await assert.rejects(
        reorderSections('ch-1', { ...swap, expectedUpdatedAt: STALE }, actor, ctx),
        expectError(409, 'STALE_WRITE'),
      );
      db.addChapter({ id: 'ch-2', slug: 'dua', sortOrder: 1 });
      db.addSection({ id: 's-z', chapterId: 'ch-2', slug: 'z' });
      await assert.rejects(
        reorderSections(
          'ch-1',
          {
            expectedUpdatedAt: T0_ISO,
            items: [
              { id: 's-a', sortOrder: 0 },
              { id: 's-z', sortOrder: 1 },
            ],
          },
          actor,
          ctx,
        ),
        expectError(400),
      );
    });

    it('writes in ascending id order and rolls back on audit failure', async () => {
      const order: string[] = [];
      const original = db.section.update;
      db.section.update = async (args) => {
        order.push((args.where as { id: string }).id);
        return original(args);
      };
      db.failAudit = true;

      await assert.rejects(reorderSections('ch-1', swap, actor, ctx));

      assert.deepEqual(order.slice(0, 2), ['s-a', 's-b']);
      assert.deepEqual(
        db.section.rows.map((s) => s.sortOrder),
        [0, 1],
      );
    });

    it('404s for an unknown chapter', async () => {
      await assert.rejects(reorderSections('ch-x', swap, actor, ctx), expectError(404));
    });
  });
});
