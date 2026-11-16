import test from 'node:test';
import assert from 'node:assert/strict';
import { resetCeritaContent, type CeritaResetTx } from '../services/ceritaReset.service.js';

const FIGURE_ASSET_ID = '00000000-0000-0000-0000-000000000011';

function createFakeResetTx() {
  const operations: string[] = [];
  const detachedCalls: Array<{ ids: readonly string[]; context: unknown }> = [];
  const auditLogs: Array<Record<string, unknown>> = [];

  const pages = [
    {
      id: 'page-kependudukan',
      slug: 'kependudukan',
      coverAssetId: 'cover-1',
      headline: 'Judul Uji',
      bylineAuthor: 'Editor',
      bylineAffiliation: null,
    },
    {
      id: 'page-extra',
      slug: 'halaman-uji',
      coverAssetId: 'cover-extra',
      headline: null,
      bylineAuthor: null,
      bylineAffiliation: null,
    },
  ];
  const chapters = [
    { id: 'ch-1', pageId: 'page-kependudukan', slug: 'jumlah-penduduk' },
    { id: 'ch-extra', pageId: 'page-kependudukan', slug: 'bab-uji' },
  ];
  const blocks = [
    {
      id: 'blk-prose-1',
      sectionId: 'sec-1',
      type: 'prose',
      metadata: null,
    },
    {
      id: 'blk-fig-1',
      sectionId: 'sec-1',
      type: 'figure',
      metadata: {
        kind: 'photo',
        photos: [{ mediaId: FIGURE_ASSET_ID, alt: 'foto' }],
      },
    },
    {
      id: 'blk-standalone',
      sectionId: null,
      type: 'hero',
      metadata: null,
    },
  ];

  const tx: CeritaResetTx = {
    indicator: {
      count: async () => 5,
      deleteMany: async () => {
        operations.push('indicator.deleteMany');
        return { count: 5 };
      },
    },
    indicatorTableRow: {
      count: async () => 16,
      deleteMany: async () => {
        operations.push('indicatorTableRow.deleteMany');
        return { count: 16 };
      },
    },
    indicatorTable: {
      count: async () => 1,
      deleteMany: async () => {
        operations.push('indicatorTable.deleteMany');
        return { count: 1 };
      },
    },
    contentBlock: {
      findMany: async () =>
        blocks
          .filter((b) => b.sectionId !== null)
          .map(({ id, type, metadata }) => ({ id, type, metadata })),
      deleteMany: async () => {
        operations.push('contentBlock.deleteMany');
        return { count: blocks.filter((b) => b.sectionId !== null).length };
      },
    },
    section: {
      count: async () => 3,
      deleteMany: async () => {
        operations.push('section.deleteMany');
        return { count: 3 };
      },
    },
    chapter: {
      findMany: async () => chapters,
      deleteMany: async ({ where }) => {
        operations.push(`chapter.deleteMany:${where.id.in.join(',')}`);
        return { count: where.id.in.length };
      },
      upsert: async () => ({}),
    },
    page: {
      findMany: async () => pages,
      updateMany: async ({ where }) => {
        operations.push(`page.updateMany:${where.id.in.join(',')}`);
        return { count: where.id.in.length };
      },
      deleteMany: async ({ where }) => {
        operations.push(`page.deleteMany:${where.id.in.join(',')}`);
        return { count: where.id.in.length };
      },
      upsert: async ({ where }) => ({ id: `page-${where.slug}` }),
    },
    auditLog: {
      create: async ({ data }) => {
        auditLogs.push(data);
        return data;
      },
    },
  };

  return { tx, operations, detachedCalls, auditLogs };
}

test('resetCeritaContent rejects production runs without --force or --dry-run', async () => {
  await assert.rejects(
    () => resetCeritaContent({ nodeEnv: 'production' }),
    /Menolak membersihkan konten Cerita di production tanpa flag --force/,
  );
});

test('resetCeritaContent dry-run reports counts without deleting or writing audit logs', async () => {
  const { tx, operations, detachedCalls, auditLogs } = createFakeResetTx();

  const res = await resetCeritaContent({
    nodeEnv: 'production',
    dryRun: true,
    transaction: async (cb) => cb(tx),
    detachMediaFn: async (_tx, ids, context) => {
      detachedCalls.push({ ids, context });
    },
  });

  assert.equal(res.dryRun, true);
  assert.equal(res.deletedIndicators, 5);
  assert.equal(res.deletedIndicatorTableRows, 16);
  assert.equal(res.deletedIndicatorTables, 1);
  assert.equal(res.deletedSectionContentBlocks, 2);
  assert.equal(res.detachedFigureAssets, 1);
  assert.equal(res.deletedSections, 3);
  assert.equal(res.deletedExtraChapters, 1);
  assert.equal(res.deletedExtraPages, 1);
  assert.equal(res.detachedCoverAssets, 0);
  assert.equal(res.resetPageHeaders, 0);
  assert.equal(res.ensuredPages, 8);
  assert.equal(res.ensuredChapters, 38);
  assert.equal(operations.length, 0);
  assert.equal(detachedCalls.length, 0);
  assert.equal(auditLogs.length, 0);
});

test('resetCeritaContent deletes section content in FK order, detaches figure assets, preserves covers by default, and logs audit', async () => {
  const { tx, operations, detachedCalls, auditLogs } = createFakeResetTx();

  const res = await resetCeritaContent({
    nodeEnv: 'development',
    transaction: async (cb) => cb(tx),
    detachMediaFn: async (_tx, ids, context) => {
      detachedCalls.push({ ids, context });
    },
  });

  assert.equal(res.dryRun, false);
  assert.equal(res.deletedIndicators, 5);
  assert.equal(res.deletedSections, 3);
  assert.equal(res.detachedFigureAssets, 1);
  assert.equal(res.detachedCoverAssets, 0);
  assert.deepEqual(detachedCalls, [
    {
      ids: [FIGURE_ASSET_ID],
      context: {
        purpose: 'cerita',
        reference: { type: 'content_block', id: 'blk-fig-1', slot: 'figure' },
      },
    },
  ]);
  assert.deepEqual(operations, [
    'indicator.deleteMany',
    'indicatorTableRow.deleteMany',
    'indicatorTable.deleteMany',
    'contentBlock.deleteMany',
    'section.deleteMany',
    'chapter.deleteMany:ch-extra',
    'page.deleteMany:page-extra',
  ]);
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0]?.action, 'maintenance.cerita_reset');
});

test('resetCeritaContent with resetCovers detaches page covers and clears headers', async () => {
  const { tx, operations, detachedCalls } = createFakeResetTx();

  const res = await resetCeritaContent({
    nodeEnv: 'production',
    force: true,
    resetCovers: true,
    transaction: async (cb) => cb(tx),
    detachMediaFn: async (_tx, ids, context) => {
      detachedCalls.push({ ids, context });
    },
  });

  assert.equal(res.detachedCoverAssets, 2);
  assert.equal(res.resetPageHeaders, 1);
  assert.ok(operations.includes('page.updateMany:page-kependudukan'));
  assert.ok(
    detachedCalls.some((c) => c.ids.includes('cover-1')) &&
      detachedCalls.some((c) => c.ids.includes('cover-extra')),
  );
});
