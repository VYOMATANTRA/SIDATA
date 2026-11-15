import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  getPages,
  getPagesWithSections,
  getPageBySlug,
  createPage,
  deletePage,
  toPageSummary,
  putPageCover,
  deletePageCover,
  PageServiceError,
} from '../services/pages.service.js';
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
const ID = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;

const expectError = (statusCode: number, code?: string) => (err: unknown) => {
  assert.ok(err instanceof HierarchyServiceError, `expected HierarchyServiceError, got ${err}`);
  assert.equal(err.statusCode, statusCode);
  if (code) assert.equal(err.code, code);
  return true;
};

describe('pages cover service', () => {
  let handle: FakeHierarchyHandle;
  let db: FakeHierarchyDb;

  const asset = (n: number) => db.mediaAsset.rows.find((a) => a.id === ID(n))!;
  const refs = (n: number) => db.mediaAssetReference.rows.filter((r) => r.assetId === ID(n));

  beforeEach(() => {
    handle = installFakeHierarchyDb();
    db = handle.db;
    db.addPage({ coverAssetId: null });
    for (const n of [1, 2, 3]) {
      db.addMedia({ id: ID(n), purpose: 'cerita-cover' });
    }
  });

  afterEach(() => handle.restore());

  describe('DTO coverAssetId exposure', () => {
    it('toPageSummary returns coverAssetId (null when absent/undefined, UUID when set)', () => {
      const withoutField = toPageSummary({
        id: 'p1',
        slug: 'kependudukan',
        title: 'Kependudukan',
        sortOrder: 0,
        _count: { chapters: 2 },
      });
      assert.equal(withoutField.coverAssetId, null);

      const withNull = toPageSummary({
        id: 'p1',
        slug: 'kependudukan',
        title: 'Kependudukan',
        coverAssetId: null,
        sortOrder: 0,
        _count: { chapters: 2 },
      });
      assert.equal(withNull.coverAssetId, null);

      const withAsset = toPageSummary({
        id: 'p1',
        slug: 'kependudukan',
        title: 'Kependudukan',
        coverAssetId: ID(1),
        sortOrder: 0,
        _count: { chapters: 2 },
      });
      assert.equal(withAsset.coverAssetId, ID(1));
    });

    it('getPages returns coverAssetId for each page', async () => {
      db.addPage({
        id: 'page-2',
        slug: 'ekonomi',
        title: 'Ekonomi',
        sortOrder: 1,
        coverAssetId: ID(2),
      });
      const origFindMany = db.page.findMany;
      db.page.findMany = async () => db.page.rows.map((r) => ({ ...r, _count: { chapters: 0 } }));
      try {
        const pages = await getPages();
        assert.deepStrictEqual(
          pages.map((p) => ({ slug: p.slug, coverAssetId: p.coverAssetId })),
          [
            { slug: 'kependudukan', coverAssetId: null },
            { slug: 'ekonomi', coverAssetId: ID(2) },
          ],
        );
      } finally {
        db.page.findMany = origFindMany;
      }
    });

    it('getPageBySlug and getPagesWithSections return coverAssetId', async () => {
      db.page.rows[0]!.coverAssetId = ID(1);
      const originalFindMany = db.page.findMany;
      const originalFindUnique = db.page.findUnique;
      db.page.findMany = async () => db.page.rows.map((r) => ({ ...r, chapters: [] }));
      db.page.findUnique = async (args: { where: Record<string, unknown> }) => {
        const row = db.page.rows.find((r) => r.slug === args.where.slug);
        return row ? { ...row, chapters: [] } : null;
      };
      try {
        const detail = await getPageBySlug('kependudukan');
        assert.ok(detail);
        assert.equal(detail.coverAssetId, ID(1));

        const tree = await getPagesWithSections();
        assert.equal(tree[0]!.coverAssetId, ID(1));
      } finally {
        db.page.findMany = originalFindMany;
        db.page.findUnique = originalFindUnique;
      }
    });

    it('createPage returns coverAssetId: null', async () => {
      const created = await createPage(
        { title: 'Ekonomi', slug: 'ekonomi', sortOrder: 1 },
        actor,
        ctx,
      );
      assert.equal(created.coverAssetId, null);
    });
  });

  describe('putPageCover validation & refusals', () => {
    it('rejects invalid slug with 400', async () => {
      for (const badSlug of ['', 'Kependudukan', 'a_b', 'bad\\slug']) {
        await assert.rejects(
          putPageCover(badSlug, { coverAssetId: ID(1), expectedUpdatedAt: T0_ISO }, actor, ctx),
          expectError(400),
        );
      }
    });

    it('rejects non-object payload and missing/invalid UUID coverAssetId with 400 plain Indonesian (no field names)', async () => {
      for (const payload of [
        null,
        [],
        'string',
        { expectedUpdatedAt: T0_ISO },
        { coverAssetId: 123, expectedUpdatedAt: T0_ISO },
        { coverAssetId: '', expectedUpdatedAt: T0_ISO },
        { coverAssetId: 'not-a-uuid', expectedUpdatedAt: T0_ISO },
        { coverAssetId: ID(1), expectedUpdatedAt: T0_ISO, extra: true },
      ]) {
        await assert.rejects(putPageCover('kependudukan', payload, actor, ctx), (err: unknown) => {
          expectError(400)(err);
          const msg = (err as Error).message;
          assert.equal(msg.includes('coverAssetId'), false, `leaked field name in: ${msg}`);
          assert.equal(msg.includes('cover_asset_id'), false, `leaked field name in: ${msg}`);
          assert.equal(msg.includes('assetId'), false, `leaked field name in: ${msg}`);
          return true;
        });
      }
    });

    it('rejects missing or invalid expectedUpdatedAt with 400', async () => {
      await assert.rejects(
        putPageCover('kependudukan', { coverAssetId: ID(1) }, actor, ctx),
        expectError(400),
      );
      await assert.rejects(
        putPageCover(
          'kependudukan',
          { coverAssetId: ID(1), expectedUpdatedAt: 'not-a-date' },
          actor,
          ctx,
        ),
        expectError(400),
      );
    });

    it('rejects stale expectedUpdatedAt with 409 STALE_WRITE', async () => {
      await assert.rejects(
        putPageCover('kependudukan', { coverAssetId: ID(1), expectedUpdatedAt: STALE }, actor, ctx),
        expectError(409, 'STALE_WRITE'),
      );
      assert.equal(db.page.rows[0]!.coverAssetId, null);
      assert.equal(db.auditRows.length, 0);
    });

    it('rejects missing page with 404', async () => {
      await assert.rejects(
        putPageCover('tidak-ada', { coverAssetId: ID(1), expectedUpdatedAt: T0_ISO }, actor, ctx),
        expectError(404),
      );
    });

    it('rejects asset with wrong purpose with 400 plain Indonesian', async () => {
      db.addMedia({ id: ID(9), purpose: 'cerita' });
      await assert.rejects(
        putPageCover(
          'kependudukan',
          { coverAssetId: ID(9), expectedUpdatedAt: T0_ISO },
          actor,
          ctx,
        ),
        (err: unknown) => {
          expectError(400)(err);
          assert.ok(err instanceof PageServiceError);
          assert.equal(err.message.includes('assetId'), false);
          assert.equal(err.message.includes('coverAssetId'), false);
          return true;
        },
      );
      assert.equal(db.page.rows[0]!.coverAssetId, null);
      assert.equal(db.auditRows.length, 0);
    });

    it('rejects missing or claimed asset with 400 plain Indonesian', async () => {
      const missingId = ID(99);
      await assert.rejects(
        putPageCover(
          'kependudukan',
          { coverAssetId: missingId, expectedUpdatedAt: T0_ISO },
          actor,
          ctx,
        ),
        expectError(400),
      );

      asset(1).cleanupClaimedAt = T0;
      await assert.rejects(
        putPageCover(
          'kependudukan',
          { coverAssetId: ID(1), expectedUpdatedAt: T0_ISO },
          actor,
          ctx,
        ),
        expectError(400),
      );
      assert.equal(db.page.rows[0]!.coverAssetId, null);
      assert.equal(db.auditRows.length, 0);
    });
  });

  describe('putPageCover attach, replace, and idempotency', () => {
    it('attaches cerita-cover asset with {type:"page", id, slot:"cover"}, updates coverAssetId, writes PAGE_COVER_UPDATED, and returns PageAuthoringDTO', async () => {
      const result = await putPageCover(
        'kependudukan',
        { coverAssetId: ID(1).toUpperCase(), expectedUpdatedAt: T0_ISO },
        actor,
        ctx,
      );

      assert.deepStrictEqual(db.transactionOptions, [{ isolationLevel: 'ReadCommitted' }]);
      assert.equal(result.id, 'page-1');
      assert.equal(result.slug, 'kependudukan');
      assert.equal(result.title, 'Kependudukan');
      assert.equal(result.coverAssetId, ID(1));
      assert.equal(result.chapterCount, 0);
      assert.notEqual(result.updatedAt, T0_ISO);

      assert.notEqual(asset(1).attachedAt, null);
      assert.equal(asset(1).detachedAt, null);
      assert.deepStrictEqual(
        refs(1).map((r) => [r.referenceType, r.referenceId, r.slot]),
        [['page', 'page-1', 'cover']],
      );

      assert.equal(db.auditRows.length, 1);
      const row = db.auditRows[0]!;
      assert.equal(row.action, 'page.cover_updated');
      assert.equal(row.severity, 'info');
      assert.equal(row.targetType, 'page');
      assert.equal(row.targetId, 'page-1');
      assert.equal(row.targetLabel, 'Kependudukan');
      assert.deepStrictEqual(row.metadata, { slug: 'kependudukan', hasCover: true });
    });

    it('replaces an existing cover: locks [oldId, newId] in ascending order, attaches new, and leniently detaches old', async () => {
      const first = await putPageCover(
        'kependudukan',
        { coverAssetId: ID(2), expectedUpdatedAt: T0_ISO },
        actor,
        ctx,
      );
      db.lockLog.length = 0;

      // Capture the bound IDs passed to the upfront ORDER BY id FOR UPDATE query.
      const boundAssetLockIds: string[][] = [];
      const origQueryRaw = db.$queryRaw.bind(db);
      db.$queryRaw = async (sql) => {
        if (sql.sql.includes('ORDER BY id FOR UPDATE')) {
          boundAssetLockIds.push([...(sql.values as string[])]);
        }
        return origQueryRaw(sql);
      };

      // Replace ID(2) with ID(1) where ID(1) < ID(2) to prove ascending lock order.
      const second = await putPageCover(
        'kependudukan',
        { coverAssetId: ID(1), expectedUpdatedAt: first.updatedAt },
        actor,
        ctx,
      );

      assert.equal(second.coverAssetId, ID(1));
      assert.notEqual(second.updatedAt, first.updatedAt);
      assert.equal(boundAssetLockIds.length, 1);
      assert.deepStrictEqual(boundAssetLockIds[0], [ID(1), ID(2)]);

      assert.notEqual(asset(1).attachedAt, null);
      assert.deepStrictEqual(
        refs(1).map((r) => [r.referenceType, r.referenceId, r.slot]),
        [['page', 'page-1', 'cover']],
      );

      assert.equal(asset(2).attachedAt, null);
      assert.notEqual(asset(2).detachedAt, null);
      assert.equal(refs(2).length, 0);
      assert.equal(db.auditRows.length, 2);
    });

    it('replaces an existing cover leniently even if old cover asset was already deleted or had legacy purpose', async () => {
      db.addMedia({ id: ID(5), purpose: 'cerita', attachedAt: T0 });
      db.page.rows[0]!.coverAssetId = ID(5);
      db.mediaAssetReference.rows.push({
        id: 'ref-5',
        assetId: ID(5),
        referenceType: 'page',
        referenceId: 'page-1',
        slot: 'cover',
      });

      const res = await putPageCover(
        'kependudukan',
        { coverAssetId: ID(1), expectedUpdatedAt: T0_ISO },
        actor,
        ctx,
      );
      assert.equal(res.coverAssetId, ID(1));
      assert.equal(asset(5).attachedAt, null);
      assert.equal(refs(5).length, 0);
      assert.notEqual(asset(1).attachedAt, null);
    });

    it('when coverAssetId is unchanged, re-asserts attachMedia without bumping updatedAt or writing an audit row', async () => {
      const first = await putPageCover(
        'kependudukan',
        { coverAssetId: ID(1), expectedUpdatedAt: T0_ISO },
        actor,
        ctx,
      );
      const auditCountBefore = db.auditRows.length;

      // Simulate lost attachment behind the page's back
      asset(1).attachedAt = null;
      asset(1).detachedAt = T0;
      db.mediaAssetReference.rows = [];

      const again = await putPageCover(
        'kependudukan',
        { coverAssetId: ID(1), expectedUpdatedAt: first.updatedAt },
        actor,
        ctx,
      );

      assert.equal(again.coverAssetId, ID(1));
      assert.equal(again.updatedAt, first.updatedAt);
      assert.equal(db.auditRows.length, auditCountBefore);
      assert.notEqual(asset(1).attachedAt, null);
      assert.equal(asset(1).detachedAt, null);
      assert.equal(refs(1).length, 1);
    });

    it('rolls back cover update and media attach when audit log write fails', async () => {
      db.failAudit = true;
      await assert.rejects(
        putPageCover(
          'kependudukan',
          { coverAssetId: ID(1), expectedUpdatedAt: T0_ISO },
          actor,
          ctx,
        ),
      );
      assert.equal(db.page.rows[0]!.coverAssetId, null);
      assert.equal(asset(1).attachedAt, null);
      assert.equal(refs(1).length, 0);
    });
  });

  describe('deletePageCover', () => {
    it('rejects invalid slug (400), invalid expectedUpdatedAt (400), missing page (404), and stale token (409 STALE_WRITE)', async () => {
      await assert.rejects(
        deletePageCover('Bad Slug', actor, ctx, prisma, { expectedUpdatedAt: T0_ISO }),
        expectError(400),
      );
      await assert.rejects(
        deletePageCover('kependudukan', actor, ctx, prisma, { expectedUpdatedAt: 'bad-date' }),
        expectError(400),
      );
      await assert.rejects(
        deletePageCover('tidak-ada', actor, ctx, prisma, { expectedUpdatedAt: T0_ISO }),
        expectError(404),
      );
      await assert.rejects(
        deletePageCover('kependudukan', actor, ctx, prisma, { expectedUpdatedAt: STALE }),
        expectError(409, 'STALE_WRITE'),
      );
    });

    it('is a no-op when coverAssetId is already null (no updatedAt bump, no audit log)', async () => {
      const result = await deletePageCover('kependudukan', actor, ctx, prisma, {
        expectedUpdatedAt: T0_ISO,
      });

      assert.equal(result.coverAssetId, null);
      assert.equal(result.updatedAt, T0_ISO);
      assert.equal(db.auditRows.length, 0);
    });

    it('leniently detaches cover, sets coverAssetId: null, bumps updatedAt, and writes PAGE_COVER_DELETED', async () => {
      const first = await putPageCover(
        'kependudukan',
        { coverAssetId: ID(1), expectedUpdatedAt: T0_ISO },
        actor,
        ctx,
      );
      db.transactionOptions.length = 0;

      const result = await deletePageCover('kependudukan', actor, ctx, prisma, {
        expectedUpdatedAt: first.updatedAt,
      });

      assert.deepStrictEqual(db.transactionOptions, [{ isolationLevel: 'ReadCommitted' }]);
      assert.equal(result.coverAssetId, null);
      assert.notEqual(result.updatedAt, first.updatedAt);

      assert.equal(asset(1).attachedAt, null);
      assert.notEqual(asset(1).detachedAt, null);
      assert.equal(refs(1).length, 0);

      assert.equal(db.auditRows.length, 2);
      const delRow = db.auditRows[1]!;
      assert.equal(delRow.action, 'page.cover_deleted');
      assert.equal(delRow.severity, 'warning');
      assert.equal(delRow.targetType, 'page');
      assert.equal(delRow.targetId, 'page-1');
      assert.equal(delRow.targetLabel, 'Kependudukan');
      assert.deepStrictEqual(delRow.metadata, { slug: 'kependudukan', hasCover: false });
    });

    it('rolls back cover removal when audit write fails', async () => {
      const first = await putPageCover(
        'kependudukan',
        { coverAssetId: ID(1), expectedUpdatedAt: T0_ISO },
        actor,
        ctx,
      );
      db.failAudit = true;
      await assert.rejects(
        deletePageCover('kependudukan', actor, ctx, prisma, { expectedUpdatedAt: first.updatedAt }),
      );
      assert.equal(db.page.rows[0]!.coverAssetId, ID(1));
      assert.notEqual(asset(1).attachedAt, null);
      assert.equal(refs(1).length, 1);
    });
  });

  describe('deletePage cover detach', () => {
    it('leniently detaches existingPage.coverAssetId inside ReadCommitted locked transaction and writes PAGE_DELETED', async () => {
      const first = await putPageCover(
        'kependudukan',
        { coverAssetId: ID(1), expectedUpdatedAt: T0_ISO },
        actor,
        ctx,
      );
      db.transactionOptions.length = 0;
      db.lockLog.length = 0;

      const deleted = await deletePage('kependudukan', actor, ctx, prisma, {
        expectedUpdatedAt: first.updatedAt,
      });

      assert.equal(deleted.slug, 'kependudukan');
      assert.equal(db.page.rows.length, 0);
      assert.deepStrictEqual(db.transactionOptions, [{ isolationLevel: 'ReadCommitted' }]);
      assert.match(db.lockLog[0]!, /FROM pages WHERE id = \? FOR UPDATE/);
      assert.match(db.lockLog[1]!, /FROM media_assets WHERE id IN .* ORDER BY id FOR UPDATE/);
      assert.equal(asset(1).attachedAt, null);
      assert.notEqual(asset(1).detachedAt, null);
      assert.equal(refs(1).length, 0);

      const delAudit = db.auditRows.at(-1)!;
      assert.equal(delAudit.action, 'page.deleted');
      assert.equal(delAudit.severity, 'warning');
    });

    it('rolls back cover detach if audit write fails during deletePage', async () => {
      const first = await putPageCover(
        'kependudukan',
        { coverAssetId: ID(1), expectedUpdatedAt: T0_ISO },
        actor,
        ctx,
      );
      db.failAudit = true;

      await assert.rejects(
        deletePage('kependudukan', actor, ctx, prisma, { expectedUpdatedAt: first.updatedAt }),
      );

      assert.equal(db.page.rows.length, 1);
      assert.notEqual(asset(1).attachedAt, null);
      assert.equal(refs(1).length, 1);
    });
  });
});
