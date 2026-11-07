import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  createChapter,
  updateChapter,
  deleteChapter,
  reorderChapters,
} from '../services/chapters.service.js';
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

const expectError = (statusCode: number, code?: string) => (err: unknown) => {
  assert.ok(err instanceof HierarchyServiceError, `expected HierarchyServiceError, got ${err}`);
  assert.equal(err.statusCode, statusCode);
  if (code) assert.equal(err.code, code);
  return true;
};

describe('chapters.service', () => {
  let handle: FakeHierarchyHandle;
  let db: FakeHierarchyDb;

  beforeEach(() => {
    handle = installFakeHierarchyDb();
    db = handle.db;
    db.addPage();
  });
  afterEach(() => handle.restore());

  describe('createChapter', () => {
    it('creates a chapter with a generated slug, sortOrder max+1, and bumps the page token', async () => {
      db.addChapter({ id: 'ch-1', slug: 'jumlah-penduduk', sortOrder: 0 });
      db.addChapter({ id: 'ch-2', slug: 'jumlah-keluarga', sortOrder: 4 });

      const result = await createChapter(
        'kependudukan',
        { title: 'Piramida Penduduk' },
        actor,
        ctx,
      );

      assert.equal(result.chapter.slug, 'piramida-penduduk');
      assert.equal(result.chapter.title, 'Piramida Penduduk');
      assert.equal(result.chapter.sortOrder, 5);
      assert.equal(result.chapter.pageId, 'page-1');
      assert.ok(result.chapter.number == null);
      assert.notEqual(result.page.updatedAt, T0_ISO);
      assert.equal(result.page.slug, 'kependudukan');
      assert.equal(db.page.rows[0]!.updatedAt instanceof Date, true);
    });

    it('starts at sortOrder 0 for the first chapter', async () => {
      const { chapter } = await createChapter('kependudukan', { title: 'Bab Pertama' }, actor, ctx);
      assert.equal(chapter.sortOrder, 0);
    });

    it('resolves slug collisions with -2/-3 suffixes within the same page only', async () => {
      db.addPage({ id: 'page-2', slug: 'pendidikan' });
      db.addChapter({ id: 'ch-a', slug: 'ringkasan' });
      db.addChapter({ id: 'ch-b', slug: 'ringkasan-2', sortOrder: 1 });
      db.addChapter({ id: 'ch-c', pageId: 'page-2', slug: 'penutup' });

      const third = await createChapter('kependudukan', { title: 'Ringkasan' }, actor, ctx);
      assert.equal(third.chapter.slug, 'ringkasan-3');

      // Same title on another page is not a collision: scope is the page.
      const other = await createChapter('pendidikan', { title: 'Ringkasan' }, actor, ctx);
      assert.equal(other.chapter.slug, 'ringkasan');
      // And a title colliding in page-2 only collides with page-2's slug.
      const penutup = await createChapter('kependudukan', { title: 'Penutup' }, actor, ctx);
      assert.equal(penutup.chapter.slug, 'penutup');
    });

    it('rejects reserved slugs, HTML titles, empty titles, non-slugifiable titles and client slugs', async () => {
      await assert.rejects(
        createChapter('kependudukan', { title: 'Reorder' }, actor, ctx),
        expectError(400),
      );
      await assert.rejects(
        createChapter('kependudukan', { title: '<b>Tebal</b>' }, actor, ctx),
        expectError(400),
      );
      await assert.rejects(
        createChapter('kependudukan', { title: '   ' }, actor, ctx),
        expectError(400),
      );
      await assert.rejects(
        createChapter('kependudukan', { title: '!!!' }, actor, ctx),
        expectError(400),
      );
      await assert.rejects(
        createChapter('kependudukan', { title: 'Valid', slug: 'sendiri' }, actor, ctx),
        expectError(400),
      );
      await assert.rejects(createChapter('kependudukan', null, actor, ctx), expectError(400));
      assert.equal(db.chapter.rows.length, 0);
      assert.equal(db.auditRows.length, 0);
    });

    it('strips diacritics when generating slugs', async () => {
      const { chapter } = await createChapter(
        'kependudukan',
        { title: 'Kesehatan Ibú' },
        actor,
        ctx,
      );
      assert.equal(chapter.slug, 'kesehatan-ibu');
    });

    it('rejects an invalid page slug (400) and an unknown page (404)', async () => {
      await assert.rejects(createChapter('Bad Slug', { title: 'X' }, actor, ctx), expectError(400));
      await assert.rejects(
        createChapter('tidak-ada', { title: 'X' }, actor, ctx),
        expectError(404),
      );
    });

    it('writes an info audit row in the same transaction with ids and titles only', async () => {
      await createChapter('kependudukan', { title: 'Bab Baru' }, actor, ctx);

      assert.equal(db.auditRows.length, 1);
      const row = db.auditRows[0]!;
      assert.equal(row.action, 'chapter.created');
      assert.equal(row.severity, 'info');
      assert.equal(row.targetType, 'chapter');
      assert.equal(row.actorId, 'u1');
      assert.equal(row.ipAddress, '127.0.0.1');
      assert.deepEqual(Object.keys(row.metadata as object).sort(), [
        'pageId',
        'pageSlug',
        'slug',
        'sortOrder',
        'title',
      ]);
    });

    it('rolls back the chapter and the page touch when the audit write fails', async () => {
      db.failAudit = true;

      await assert.rejects(createChapter('kependudukan', { title: 'Bab Baru' }, actor, ctx));

      assert.equal(db.chapter.rows.length, 0);
      assert.equal(db.page.rows[0]!.updatedAt.getTime(), T0.getTime());
    });

    it('locks the parent page row before writing', async () => {
      await createChapter('kependudukan', { title: 'Bab Baru' }, actor, ctx);
      assert.match(db.lockLog[0]!, /FROM pages WHERE slug = \? FOR UPDATE/);
    });
  });

  describe('updateChapter', () => {
    beforeEach(() => {
      db.addChapter({ id: 'ch-1', slug: 'jumlah-penduduk', title: 'Jumlah Penduduk' });
    });

    it('renames the title, keeps the slug stable, and audits before/after', async () => {
      const updated = await updateChapter(
        'ch-1',
        { title: 'Populasi', expectedUpdatedAt: T0_ISO },
        actor,
        ctx,
      );

      assert.equal(updated.title, 'Populasi');
      assert.equal(updated.slug, 'jumlah-penduduk');
      assert.notEqual(updated.updatedAt, T0_ISO);
      const row = db.auditRows[0]!;
      assert.equal(row.action, 'chapter.updated');
      assert.deepEqual((row.metadata as { changes: unknown }).changes, {
        title: { before: 'Jumlah Penduduk', after: 'Populasi' },
      });
    });

    it('returns 409 STALE_WRITE with the current token when expectedUpdatedAt no longer matches', async () => {
      await assert.rejects(
        updateChapter(
          'ch-1',
          { title: 'Populasi', expectedUpdatedAt: '2026-09-30T00:00:00.000Z' },
          actor,
          ctx,
        ),
        (err: unknown) => {
          expectError(409, 'STALE_WRITE')(err);
          assert.deepEqual((err as HierarchyServiceError).details, { currentUpdatedAt: T0_ISO });
          return true;
        },
      );
      assert.equal(db.chapter.rows[0]!.title, 'Jumlah Penduduk');
      assert.equal(db.auditRows.length, 0);
    });

    it('requires expectedUpdatedAt and rejects unknown fields such as slug', async () => {
      await assert.rejects(updateChapter('ch-1', { title: 'X' }, actor, ctx), expectError(400));
      await assert.rejects(
        updateChapter('ch-1', { title: 'X', expectedUpdatedAt: T0_ISO, slug: 'x' }, actor, ctx),
        expectError(400),
      );
      await assert.rejects(
        updateChapter('ch-1', { title: 'X', expectedUpdatedAt: 'kemarin' }, actor, ctx),
        expectError(400),
      );
    });

    it('404s for an unknown chapter before checking staleness', async () => {
      await assert.rejects(
        updateChapter('ch-x', { title: 'X', expectedUpdatedAt: T0_ISO }, actor, ctx),
        expectError(404),
      );
    });

    it('writes nothing and audits nothing when the title is unchanged', async () => {
      const result = await updateChapter(
        'ch-1',
        { title: 'Jumlah Penduduk', expectedUpdatedAt: T0_ISO },
        actor,
        ctx,
      );

      assert.equal(result.updatedAt, T0_ISO);
      assert.equal(db.auditRows.length, 0);
    });

    it('rolls back the update when the audit write fails', async () => {
      db.failAudit = true;
      await assert.rejects(
        updateChapter('ch-1', { title: 'Populasi', expectedUpdatedAt: T0_ISO }, actor, ctx),
      );
      assert.equal(db.chapter.rows[0]!.title, 'Jumlah Penduduk');
    });
  });

  describe('deleteChapter', () => {
    beforeEach(() => {
      db.addChapter({ id: 'ch-1', slug: 'jumlah-penduduk' });
    });

    it('runs the delete transaction at READ COMMITTED', async () => {
      await deleteChapter('ch-1', T0_ISO, actor, ctx);
      assert.deepEqual(db.transactionOptions, [{ isolationLevel: 'ReadCommitted' }]);
    });

    it('deletes an empty chapter (and its empty sections), touches the page, audits at warning', async () => {
      db.addSection({ id: 'sec-1', chapterId: 'ch-1' });

      const result = await deleteChapter('ch-1', T0_ISO, actor, ctx);

      assert.equal(result.chapter.id, 'ch-1');
      assert.equal(result.sectionCount, 1);
      assert.notEqual(result.page.updatedAt, T0_ISO);
      assert.equal(db.chapter.rows.length, 0);
      assert.equal(db.section.rows.length, 0);
      const row = db.auditRows[0]!;
      assert.equal(row.action, 'chapter.deleted');
      assert.equal(row.severity, 'warning');
      assert.equal((row.metadata as { sectionCount: number }).sectionCount, 1);
    });

    it('is blocked with 409 HAS_DEPENDENTS and per-type counts when blocks/indicators/tables remain', async () => {
      db.addSection({ id: 'sec-1', chapterId: 'ch-1' });
      db.addSection({ id: 'sec-2', chapterId: 'ch-1', slug: 'lain', sortOrder: 1 });
      db.addBlock({ id: 'b1', sectionId: 'sec-1', slug: 'a' });
      db.addBlock({ id: 'b2', sectionId: 'sec-2', slug: 'b' });
      db.indicator.rows.push({ id: 'i1', sectionId: 'sec-2' });
      db.indicatorTable.rows.push({ id: 't1', sectionId: 'sec-1' });
      db.indicatorTable.rows.push({ id: 't2', sectionId: 'sec-1' });
      db.indicatorTable.rows.push({ id: 't3', sectionId: 'sec-2' });

      await assert.rejects(deleteChapter('ch-1', T0_ISO, actor, ctx), (err: unknown) => {
        expectError(409, 'HAS_DEPENDENTS')(err);
        assert.deepEqual((err as HierarchyServiceError).details, {
          dependencies: { contentBlocks: 2, indicators: 1, indicatorTables: 3 },
        });
        return true;
      });

      assert.equal(db.chapter.rows.length, 1);
      assert.equal(db.section.rows.length, 2);
      assert.equal(db.auditRows.length, 0);
    });

    it('ignores dependents that belong to other chapters', async () => {
      db.addChapter({ id: 'ch-2', slug: 'lain', sortOrder: 1 });
      db.addSection({ id: 'sec-9', chapterId: 'ch-2' });
      db.addBlock({ id: 'b9', sectionId: 'sec-9', slug: 'z' });

      await deleteChapter('ch-1', T0_ISO, actor, ctx);
      assert.equal(db.chapter.rows.length, 1);
    });

    it('returns 409 STALE_WRITE on a stale token and requires the token (400)', async () => {
      await assert.rejects(
        deleteChapter('ch-1', '2026-09-30T00:00:00.000Z', actor, ctx),
        expectError(409, 'STALE_WRITE'),
      );
      await assert.rejects(deleteChapter('ch-1', undefined, actor, ctx), expectError(400));
      assert.equal(db.chapter.rows.length, 1);
    });

    it('404s for an unknown chapter', async () => {
      await assert.rejects(deleteChapter('ch-x', T0_ISO, actor, ctx), expectError(404));
    });

    it('locks page before chapter (parent-first ordering)', async () => {
      await deleteChapter('ch-1', T0_ISO, actor, ctx);
      const locks = db.lockLog.filter((l) => l.includes('FOR UPDATE'));
      assert.match(locks[0]!, /FROM pages WHERE id = \? FOR UPDATE/);
      assert.match(locks[1]!, /FROM chapters WHERE id = \? FOR UPDATE/);
    });

    it('rolls back the delete and the page touch when the audit write fails', async () => {
      db.failAudit = true;
      await assert.rejects(deleteChapter('ch-1', T0_ISO, actor, ctx));
      assert.equal(db.chapter.rows.length, 1);
      assert.equal(db.page.rows[0]!.updatedAt.getTime(), T0.getTime());
    });

    it('maps a late FK violation to 409 HAS_DEPENDENTS', async () => {
      const original = db.chapter.delete;
      db.chapter.delete = async () => {
        throw Object.assign(new Error('fk'), { code: 'P2003' });
      };
      await assert.rejects(
        deleteChapter('ch-1', T0_ISO, actor, ctx),
        expectError(409, 'HAS_DEPENDENTS'),
      );
      db.chapter.delete = original;
    });

    it('invalidates indicator caches after a committed delete, not after a blocked one', async () => {
      const key = 'id:ind-1';
      const warm = () =>
        indicatorByIdCache.set(key, new VersionedTtlCache({ ttlMs: 60_000, baseClient: prisma }));
      db.addSection({ id: 'sec-1', chapterId: 'ch-1' });
      db.addBlock({ id: 'b1', sectionId: 'sec-1', slug: 'a' });

      warm();
      await assert.rejects(deleteChapter('ch-1', T0_ISO, actor, ctx));
      assert.equal(indicatorByIdCache.has(key), true, 'blocked delete must not drop caches');

      db.contentBlock.rows.length = 0;
      await deleteChapter('ch-1', T0_ISO, actor, ctx);
      assert.equal(indicatorByIdCache.has(key), false);
    });
  });

  describe('reorderChapters', () => {
    beforeEach(() => {
      db.addChapter({ id: 'ch-a', slug: 'a', title: 'A', sortOrder: 0 });
      db.addChapter({ id: 'ch-b', slug: 'b', title: 'B', sortOrder: 1 });
      db.addChapter({ id: 'ch-c', slug: 'c', title: 'C', sortOrder: 2 });
    });

    const swap = {
      expectedUpdatedAt: T0_ISO,
      items: [
        { id: 'ch-a', sortOrder: 2 },
        { id: 'ch-b', sortOrder: 1 },
        { id: 'ch-c', sortOrder: 0 },
      ],
    };

    it('applies the new order, bumps the page token, audits only changed rows (info)', async () => {
      const result = await reorderChapters('kependudukan', swap, actor, ctx);

      assert.deepEqual(
        result.chapters.map((c) => c.id),
        ['ch-c', 'ch-b', 'ch-a'],
      );
      assert.notEqual(result.page.updatedAt, T0_ISO);
      const row = db.auditRows[0]!;
      assert.equal(row.action, 'chapter.reordered');
      assert.equal(row.severity, 'info');
      assert.deepEqual((row.metadata as { changes: unknown[] }).changes, [
        { id: 'ch-a', slug: 'a', from: 0, to: 2 },
        { id: 'ch-c', slug: 'c', from: 2, to: 0 },
      ]);
    });

    it('is a no-op (no writes, no audit, same token) when the order is unchanged', async () => {
      const result = await reorderChapters(
        'kependudukan',
        {
          expectedUpdatedAt: T0_ISO,
          items: [
            { id: 'ch-a', sortOrder: 0 },
            { id: 'ch-b', sortOrder: 1 },
            { id: 'ch-c', sortOrder: 2 },
          ],
        },
        actor,
        ctx,
      );

      assert.equal(result.page.updatedAt, T0_ISO);
      assert.equal(db.auditRows.length, 0);
      assert.equal(db.page.rows[0]!.updatedAt.getTime(), T0.getTime());
    });

    it('rejects a stale parent token with 409 STALE_WRITE', async () => {
      await assert.rejects(
        reorderChapters(
          'kependudukan',
          { ...swap, expectedUpdatedAt: '2026-09-30T00:00:00.000Z' },
          actor,
          ctx,
        ),
        expectError(409, 'STALE_WRITE'),
      );
      assert.equal(db.auditRows.length, 0);
    });

    it('rejects duplicate ids, duplicate sortOrders, foreign ids and partial lists', async () => {
      const bad = [
        [
          { id: 'ch-a', sortOrder: 0 },
          { id: 'ch-a', sortOrder: 1 },
          { id: 'ch-c', sortOrder: 2 },
        ],
        [
          { id: 'ch-a', sortOrder: 0 },
          { id: 'ch-b', sortOrder: 0 },
          { id: 'ch-c', sortOrder: 2 },
        ],
        [
          { id: 'ch-a', sortOrder: 0 },
          { id: 'ch-b', sortOrder: 1 },
          { id: 'ch-zzz', sortOrder: 2 },
        ],
        [
          { id: 'ch-a', sortOrder: 0 },
          { id: 'ch-b', sortOrder: 1 },
        ],
        [],
      ];
      for (const items of bad) {
        await assert.rejects(
          reorderChapters('kependudukan', { expectedUpdatedAt: T0_ISO, items }, actor, ctx),
          expectError(400),
        );
      }
    });

    it('writes changed rows in ascending id order after locking page then children', async () => {
      const order: string[] = [];
      const original = db.chapter.update;
      db.chapter.update = async (args) => {
        order.push((args.where as { id: string }).id);
        return original(args);
      };

      await reorderChapters(
        'kependudukan',
        {
          expectedUpdatedAt: T0_ISO,
          items: [
            { id: 'ch-c', sortOrder: 0 },
            { id: 'ch-b', sortOrder: 2 },
            { id: 'ch-a', sortOrder: 1 },
          ],
        },
        actor,
        ctx,
      );

      assert.deepEqual(order, ['ch-a', 'ch-b', 'ch-c']);
      assert.match(db.lockLog[0]!, /FROM pages WHERE slug = \? FOR UPDATE/);
      assert.match(db.lockLog[1]!, /FROM chapters WHERE page_id = \? ORDER BY id FOR UPDATE/);
    });

    it('rolls back every sortOrder write when the audit write fails', async () => {
      db.failAudit = true;
      await assert.rejects(reorderChapters('kependudukan', swap, actor, ctx));
      assert.deepEqual(
        db.chapter.rows.map((c) => c.sortOrder),
        [0, 1, 2],
      );
    });

    it('404s for an unknown page', async () => {
      await assert.rejects(reorderChapters('tidak-ada', swap, actor, ctx), expectError(404));
    });
  });
});
