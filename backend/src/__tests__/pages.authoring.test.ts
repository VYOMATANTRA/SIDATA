import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { updatePage, deletePage } from '../services/pages.service.js';
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

const expectError = (statusCode: number, code?: string) => (err: unknown) => {
  assert.ok(err instanceof HierarchyServiceError, `expected HierarchyServiceError, got ${err}`);
  assert.equal(err.statusCode, statusCode);
  if (code) assert.equal(err.code, code);
  return true;
};

describe('pages.service authoring additions', () => {
  let handle: FakeHierarchyHandle;
  let db: FakeHierarchyDb;

  beforeEach(() => {
    handle = installFakeHierarchyDb();
    db = handle.db;
    db.addPage();
    db.addChapter({ id: 'ch-1' });
  });
  afterEach(() => handle.restore());

  describe('updatePage', () => {
    it('renames the title, keeps the slug stable, bumps updatedAt and audits at info', async () => {
      const result = await updatePage(
        'kependudukan',
        { title: 'Data Penduduk', expectedUpdatedAt: T0_ISO },
        actor,
        ctx,
      );

      assert.equal(result.title, 'Data Penduduk');
      assert.equal(result.slug, 'kependudukan');
      assert.equal(result.chapterCount, 1);
      assert.notEqual(result.updatedAt, T0_ISO);
      const row = db.auditRows[0]!;
      assert.equal(row.action, 'page.updated');
      assert.equal(row.severity, 'info');
      assert.deepEqual((row.metadata as { changes: unknown }).changes, {
        title: { before: 'Kependudukan', after: 'Data Penduduk' },
      });
    });

    it('409 STALE_WRITE on a stale token, 404 for unknown page, 400 for bad payloads', async () => {
      await assert.rejects(
        updatePage('kependudukan', { title: 'X', expectedUpdatedAt: STALE }, actor, ctx),
        expectError(409, 'STALE_WRITE'),
      );
      await assert.rejects(
        updatePage('tidak-ada', { title: 'X', expectedUpdatedAt: T0_ISO }, actor, ctx),
        expectError(404),
      );
      for (const payload of [
        { title: 'X' },
        { title: '', expectedUpdatedAt: T0_ISO },
        { title: '<i>x</i>', expectedUpdatedAt: T0_ISO },
        { title: 'x'.repeat(256), expectedUpdatedAt: T0_ISO },
        { title: 'X', expectedUpdatedAt: T0_ISO, slug: 'baru' },
        { title: 'X', expectedUpdatedAt: T0_ISO, description: 'd' },
        null,
        [],
      ]) {
        await assert.rejects(updatePage('kependudukan', payload, actor, ctx), expectError(400));
      }
      await assert.rejects(
        updatePage('Bad Slug', { title: 'X', expectedUpdatedAt: T0_ISO }, actor, ctx),
        expectError(400),
      );
      assert.equal(db.page.rows[0]!.title, 'Kependudukan');
      assert.equal(db.auditRows.length, 0);
    });

    it('sets a headline and byline without touching the title, and audits no personal names', async () => {
      const result = await updatePage(
        'kependudukan',
        {
          headline: '  Potret Kependudukan Manggar  ',
          bylineAuthor: 'Tim Penyusun',
          bylineAffiliation: 'Kelurahan Manggar',
          expectedUpdatedAt: T0_ISO,
        },
        actor,
        ctx,
      );

      assert.equal(result.title, 'Kependudukan');
      assert.equal(result.headline, 'Potret Kependudukan Manggar');
      assert.equal(result.bylineAuthor, 'Tim Penyusun');
      assert.equal(result.bylineAffiliation, 'Kelurahan Manggar');
      assert.notEqual(result.updatedAt, T0_ISO);
      const row = db.auditRows[0]!;
      assert.deepEqual((row.metadata as { changes: unknown }).changes, {
        headline: { changed: true },
        byline: { changed: true },
      });
      assert.ok(!JSON.stringify(row).includes('Tim Penyusun'));
      assert.ok(!JSON.stringify(row).includes('Potret Kependudukan'));
    });

    it('a blank headline or byline clears it; a field left out is untouched', async () => {
      await updatePage(
        'kependudukan',
        { headline: 'Judul', bylineAuthor: 'Penulis', expectedUpdatedAt: T0_ISO },
        actor,
        ctx,
      );
      const token = (db.page.rows[0]!.updatedAt as Date).toISOString();
      const result = await updatePage(
        'kependudukan',
        { headline: '   ', expectedUpdatedAt: token },
        actor,
        ctx,
      );
      assert.equal(result.headline, null);
      assert.equal(result.bylineAuthor, 'Penulis');
    });

    it('refuses an affiliation without an author, HTML, control characters and over-long text', async () => {
      for (const payload of [
        { bylineAffiliation: 'Kelurahan', expectedUpdatedAt: T0_ISO },
        { headline: '<b>x</b>', expectedUpdatedAt: T0_ISO },
        { bylineAuthor: 'a\u0000b', expectedUpdatedAt: T0_ISO },
        { headline: 'x'.repeat(256), expectedUpdatedAt: T0_ISO },
        { bylineAuthor: 'x'.repeat(121), expectedUpdatedAt: T0_ISO },
        { bylineAuthor: 'A', bylineAffiliation: 'x'.repeat(161), expectedUpdatedAt: T0_ISO },
        { expectedUpdatedAt: T0_ISO },
      ]) {
        await assert.rejects(updatePage('kependudukan', payload, actor, ctx), expectError(400));
      }
      assert.equal(db.page.rows[0]!.headline, null);
      assert.equal(db.auditRows.length, 0);
    });

    it('accepts null alone as a clear request, and rejects a stale or empty one', async () => {
      await updatePage(
        'kependudukan',
        { headline: 'Judul', expectedUpdatedAt: T0_ISO },
        actor,
        ctx,
      );
      const token = (db.page.rows[0]!.updatedAt as Date).toISOString();
      await assert.rejects(
        updatePage('kependudukan', { headline: null, expectedUpdatedAt: STALE }, actor, ctx),
        expectError(409, 'STALE_WRITE'),
      );
      const result = await updatePage(
        'kependudukan',
        { headline: null, expectedUpdatedAt: token },
        actor,
        ctx,
      );
      assert.equal(result.headline, null);
    });

    it('an unchanged headline and byline write and audit nothing', async () => {
      await updatePage(
        'kependudukan',
        { headline: 'Judul', bylineAuthor: 'Penulis', expectedUpdatedAt: T0_ISO },
        actor,
        ctx,
      );
      const audits = db.auditRows.length;
      const token = (db.page.rows[0]!.updatedAt as Date).toISOString();
      await updatePage(
        'kependudukan',
        { headline: 'Judul', bylineAuthor: 'Penulis', expectedUpdatedAt: token },
        actor,
        ctx,
      );
      assert.equal(db.auditRows.length, audits);
      assert.equal((db.page.rows[0]!.updatedAt as Date).toISOString(), token);
    });

    it('no-op rename writes and audits nothing', async () => {
      await updatePage(
        'kependudukan',
        { title: 'Kependudukan', expectedUpdatedAt: T0_ISO },
        actor,
        ctx,
      );
      assert.equal(db.auditRows.length, 0);
      assert.equal(db.page.rows[0]!.updatedAt.getTime(), T0.getTime());
    });

    it('rolls back the rename when the audit write fails', async () => {
      db.failAudit = true;
      await assert.rejects(
        updatePage('kependudukan', { title: 'Baru', expectedUpdatedAt: T0_ISO }, actor, ctx),
      );
      assert.equal(db.page.rows[0]!.title, 'Kependudukan');
    });
  });

  describe('deletePage dependency report and precondition', () => {
    it('reports counts per dependency type with the stable HAS_DEPENDENTS code', async () => {
      db.addSection({ id: 'sec-1', chapterId: 'ch-1' });
      db.addBlock({ sectionId: 'sec-1' });
      db.addBlock({ id: 'fig', sectionId: 'sec-1', slug: 'figure-sec-1', type: 'figure' });
      db.indicator.rows.push({ id: 'i1', sectionId: 'sec-1' });
      db.indicator.rows.push({ id: 'i2', sectionId: 'sec-1' });

      await assert.rejects(
        deletePage('kependudukan', actor, ctx, undefined, { expectedUpdatedAt: T0_ISO }),
        (err: unknown) => {
          expectError(409, 'HAS_DEPENDENTS')(err);
          assert.deepEqual((err as HierarchyServiceError).details, {
            dependencies: { contentBlocks: 1, figures: 1, indicators: 2, indicatorTables: 0 },
          });
          return true;
        },
      );
      assert.equal(db.page.rows.length, 1);
    });

    it('deletes when the token matches', async () => {
      const result = await deletePage('kependudukan', actor, ctx, undefined, {
        expectedUpdatedAt: T0_ISO,
      });
      assert.equal(result.slug, 'kependudukan');
      assert.equal(db.page.rows.length, 0);
      assert.equal(db.chapter.rows.length, 0);
    });

    it('enforces expectedUpdatedAt (stale -> 409 STALE_WRITE, match -> deleted)', async () => {
      await assert.rejects(
        deletePage('kependudukan', actor, ctx, undefined, { expectedUpdatedAt: STALE }),
        expectError(409, 'STALE_WRITE'),
      );
      assert.equal(db.page.rows.length, 1);

      await deletePage('kependudukan', actor, ctx, undefined, { expectedUpdatedAt: T0_ISO });
      assert.equal(db.page.rows.length, 0);
    });

    it('maps losing the compare-and-swap delete race to 409 STALE_WRITE', async () => {
      db.page.delete = async () => {
        throw Object.assign(new Error('Record to delete does not exist.'), { code: 'P2025' });
      };
      await assert.rejects(
        deletePage('kependudukan', actor, ctx, undefined, { expectedUpdatedAt: T0_ISO }),
        expectError(409, 'STALE_WRITE'),
      );
    });
  });
});
