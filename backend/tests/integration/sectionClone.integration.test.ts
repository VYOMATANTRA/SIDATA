import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import prisma from '../../src/utils/prisma.js';
import { duplicateSection, moveSection } from '../../src/services/sectionClone.service.js';
import { putSectionFigure } from '../../src/services/sectionFigure.service.js';
import { HierarchyServiceError } from '../../src/utils/hierarchyAuthoring.js';
import { ACTOR, REQUEST_CONTEXT, disconnectResetClient, resetDatabase } from './helpers/db.js';

const ID = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const statusOf = (err: unknown) => (err as HierarchyServiceError).statusCode;

async function seedTree() {
  const page = await prisma.page.create({
    data: { slug: 'halaman', title: 'Halaman', sortOrder: 0 },
  });
  const a = await prisma.chapter.create({
    data: { pageId: page.id, slug: 'bab-a', title: 'Bab A', sortOrder: 0 },
  });
  const b = await prisma.chapter.create({
    data: { pageId: page.id, slug: 'bab-b', title: 'Bab B', sortOrder: 1 },
  });
  const otherPage = await prisma.page.create({
    data: { slug: 'lain', title: 'Lain', sortOrder: 1 },
  });
  const other = await prisma.chapter.create({
    data: { pageId: otherPage.id, slug: 'bab-lain', title: 'Bab Lain', sortOrder: 0 },
  });
  const section = await prisma.section.create({
    data: { chapterId: a.id, slug: 'ringkasan', title: 'Ringkasan', sortOrder: 0 },
  });
  return { page, a, b, other, section };
}

const fresh = async (id: string) =>
  (await prisma.section.findUniqueOrThrow({ where: { id } })).updatedAt.toISOString();

async function seedProse(sectionId: string, titles: string[]) {
  let order = 0;
  for (const title of titles) {
    await prisma.contentBlock.create({
      data: {
        sectionId,
        type: 'prose',
        slug: `${title.toLowerCase().replace(/\s+/g, '-')}-${sectionId.slice(0, 4)}`,
        title,
        body: `Isi ${title}`,
        sortOrder: order++,
      },
    });
  }
}

async function seedPhoto(n: number) {
  await prisma.mediaAsset.create({
    data: {
      id: ID(n),
      provider: 'local',
      storageKey: `photos/cerita/synthetic/${ID(n)}.webp`,
      kind: 'photo',
      purpose: 'cerita',
      ownerKey: 'synthetic',
      mimeType: 'image/webp',
      byteSize: 1024,
      originalName: `foto-${n}.jpg`,
    },
  });
}

describe('section move and duplicate against real MySQL', () => {
  beforeEach(async () => resetDatabase());
  after(async () => {
    await resetDatabase();
    await disconnectResetClient();
    await prisma.$disconnect();
  });

  describe('moveSection', () => {
    it('moves the section, with its content, to the end of another chapter of the same page', async () => {
      const { a, b, section } = await seedTree();
      await seedProse(section.id, ['Pembuka']);
      const table = await prisma.indicatorTable.create({
        data: { sectionId: section.id, slug: 't', title: 'T', kind: 'ethnicity', period: '2024' },
      });
      await prisma.section.create({
        data: { chapterId: b.id, slug: 'ringkasan', title: 'Sudah ada', sortOrder: 4 },
      });

      const result = await moveSection(
        section.id,
        { targetChapterId: b.id, expectedUpdatedAt: await fresh(section.id) },
        ACTOR,
        REQUEST_CONTEXT,
      );

      assert.equal(result.section.chapterId, b.id);
      assert.equal(result.section.sortOrder, 5);
      assert.equal(result.section.slug, 'ringkasan-2');
      assert.equal(result.chapter.id, b.id);
      assert.equal(result.fromChapter.id, a.id);
      assert.equal(
        (await prisma.indicatorTable.findUniqueOrThrow({ where: { id: table.id } })).sectionId,
        section.id,
      );
      assert.equal(await prisma.contentBlock.count({ where: { sectionId: section.id } }), 1);
      const audit = await prisma.auditLog.findFirst({ where: { action: 'section.moved' } });
      assert.ok(audit);
    });

    it('refuses a stale token, the same chapter, another page and an unknown chapter', async () => {
      const { a, b, other, section } = await seedTree();
      const token = await fresh(section.id);

      await assert.rejects(
        moveSection(
          section.id,
          { targetChapterId: b.id, expectedUpdatedAt: '2020-01-01T00:00:00.000Z' },
          ACTOR,
          REQUEST_CONTEXT,
        ),
        (e) => statusOf(e) === 409,
      );
      await assert.rejects(
        moveSection(section.id, { targetChapterId: a.id, expectedUpdatedAt: token }, ACTOR),
        (e) => statusOf(e) === 400,
      );
      await assert.rejects(
        moveSection(section.id, { targetChapterId: other.id, expectedUpdatedAt: token }, ACTOR),
        (e) => statusOf(e) === 422,
      );
      await assert.rejects(
        moveSection(section.id, { targetChapterId: ID(9), expectedUpdatedAt: token }, ACTOR),
        (e) => statusOf(e) === 404,
      );
      assert.equal(
        (await prisma.section.findUniqueOrThrow({ where: { id: section.id } })).chapterId,
        a.id,
      );
    });
  });

  describe('duplicateSection', () => {
    it('copies title, prose in order and the figure, appended at the end of the chapter', async () => {
      const { a, section } = await seedTree();
      await prisma.section.create({
        data: { chapterId: a.id, slug: 'lain', title: 'Lain', sortOrder: 1 },
      });
      await seedProse(section.id, ['Pembuka', 'Penutup']);
      await seedPhoto(1);
      const saved = await putSectionFigure(
        section.id,
        {
          expectedUpdatedAt: await fresh(section.id),
          figure: { kind: 'photo', photos: [{ mediaId: ID(1), alt: 'Foto', credit: 'Tim' }] },
        },
        ACTOR,
        REQUEST_CONTEXT,
      );
      assert.ok(saved);

      const result = await duplicateSection(
        section.id,
        { expectedUpdatedAt: await fresh(section.id) },
        ACTOR,
        REQUEST_CONTEXT,
      );

      assert.equal(result.section.title, 'Ringkasan (salinan)');
      assert.equal(result.section.chapterId, a.id);
      assert.equal(result.section.sortOrder, 2);
      const blocks = await prisma.contentBlock.findMany({
        where: { sectionId: result.section.id },
        orderBy: [{ sortOrder: 'asc' }],
      });
      const prose = blocks.filter((b) => b.type === 'prose');
      assert.deepEqual(
        prose.map((b) => [b.title, b.body, b.sortOrder]),
        [
          ['Pembuka', 'Isi Pembuka', 0],
          ['Penutup', 'Isi Penutup', 1],
        ],
      );
      const originalSlugs = (
        await prisma.contentBlock.findMany({ where: { sectionId: section.id } })
      ).map((b) => b.slug);
      for (const b of blocks) assert.ok(!originalSlugs.includes(b.slug), b.slug);
      const figure = blocks.find((b) => b.type === 'figure');
      assert.equal(figure?.slug, `figure-${result.section.id}`);
      assert.deepEqual(figure?.metadata, {
        kind: 'photo',
        photos: [{ mediaId: ID(1), alt: 'Foto', credit: 'Tim' }],
      });
      // The shared photo is now referenced by both figures and stays published.
      assert.equal(await prisma.mediaAssetReference.count({ where: { assetId: ID(1) } }), 2);
      assert.notEqual(
        (await prisma.mediaAsset.findUniqueOrThrow({ where: { id: ID(1) } })).attachedAt,
        null,
      );
      // The original is untouched.
      assert.equal(await prisma.contentBlock.count({ where: { sectionId: section.id } }), 3);
    });

    it('copies a chart figure and keeps its table', async () => {
      const { section } = await seedTree();
      const table = await prisma.indicatorTable.create({
        data: {
          sectionId: section.id,
          slug: 'tabel-umur',
          title: 'Umur',
          kind: 'age_pyramid',
          period: '2024',
        },
      });
      await putSectionFigure(
        section.id,
        {
          expectedUpdatedAt: await fresh(section.id),
          figure: {
            kind: 'chart',
            tableId: table.id,
            chartType: 'column',
            series: 'by_sex',
            title: 'Umur penduduk',
          },
        },
        ACTOR,
        REQUEST_CONTEXT,
      );

      const result = await duplicateSection(
        section.id,
        { expectedUpdatedAt: await fresh(section.id) },
        ACTOR,
        REQUEST_CONTEXT,
      );

      const copy = await prisma.contentBlock.findUniqueOrThrow({
        where: { slug: `figure-${result.section.id}` },
      });
      assert.equal((copy.metadata as { tableId?: string }).tableId, table.id);
    });

    it('duplicates a section without a figure or prose, and refuses a stale token', async () => {
      const { section } = await seedTree();

      await assert.rejects(
        duplicateSection(
          section.id,
          { expectedUpdatedAt: '2020-01-01T00:00:00.000Z' },
          ACTOR,
          REQUEST_CONTEXT,
        ),
        (e) => statusOf(e) === 409,
      );
      const result = await duplicateSection(
        section.id,
        { expectedUpdatedAt: await fresh(section.id) },
        ACTOR,
        REQUEST_CONTEXT,
      );
      assert.equal(await prisma.contentBlock.count({ where: { sectionId: result.section.id } }), 0);
    });
  });
});
