import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import prisma from '../../src/utils/prisma.js';
import {
  getAllPageHighlights,
  setPageHighlights,
} from '../../src/services/pageHighlights.service.js';
import { HierarchyServiceError } from '../../src/utils/hierarchyAuthoring.js';
import { ACTOR, REQUEST_CONTEXT, disconnectResetClient, resetDatabase } from './helpers/db.js';

async function seed() {
  const page = await prisma.page.create({
    data: { slug: 'pendidikan', title: 'Pendidikan', sortOrder: 0 },
  });
  const chapter = await prisma.chapter.create({
    data: { pageId: page.id, slug: 'bab', title: 'Bab', sortOrder: 0 },
  });
  const section = await prisma.section.create({
    data: { chapterId: chapter.id, slug: 'ringkasan', sortOrder: 0 },
  });
  const indicators = [];
  for (let i = 1; i <= 6; i++) {
    indicators.push(
      await prisma.indicator.create({
        data: {
          sectionId: section.id,
          slug: `ind-${i}`,
          label: `Indikator ${i}`,
          valueCurrent: i,
          periodCurrent: '2026',
          sortOrder: i,
        },
      }),
    );
  }
  return { page, indicators };
}

const fresh = async (id: string) =>
  (await prisma.page.findUniqueOrThrow({ where: { id } })).updatedAt.toISOString();

describe('page highlights against real MySQL', () => {
  beforeEach(async () => resetDatabase());
  after(async () => {
    await resetDatabase();
    await disconnectResetClient();
    await prisma.$disconnect();
  });

  it('falls back to the first four, then returns the saved order', async () => {
    const { page, indicators } = await seed();
    assert.deepEqual(
      (await getAllPageHighlights())['pendidikan']?.indicatorIds,
      indicators.slice(0, 4).map((i) => i.id),
    );

    const ids = [indicators[5]!.id, indicators[1]!.id];
    await setPageHighlights(
      'pendidikan',
      { indicatorIds: ids, expectedUpdatedAt: await fresh(page.id) },
      ACTOR,
      REQUEST_CONTEXT,
    );
    assert.deepEqual((await getAllPageHighlights())['pendidikan'], {
      indicatorIds: ids,
      isFallback: false,
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'page.highlights_updated' },
    });
    assert.deepEqual(audit.metadata, { slug: 'pendidikan', count: 2 });
  });

  it('rejects a stale save with 409 and a fifth figure with 400', async () => {
    const { page, indicators } = await seed();
    const token = await fresh(page.id);
    await setPageHighlights(
      'pendidikan',
      { indicatorIds: [indicators[0]!.id], expectedUpdatedAt: token },
      ACTOR,
      REQUEST_CONTEXT,
    );
    await assert.rejects(
      setPageHighlights(
        'pendidikan',
        { indicatorIds: [indicators[1]!.id], expectedUpdatedAt: token },
        ACTOR,
        REQUEST_CONTEXT,
      ),
      (e: HierarchyServiceError) => e.statusCode === 409,
    );
    await assert.rejects(
      setPageHighlights(
        'pendidikan',
        {
          indicatorIds: indicators.slice(0, 5).map((i) => i.id),
          expectedUpdatedAt: await fresh(page.id),
        },
        ACTOR,
        REQUEST_CONTEXT,
      ),
      (e: HierarchyServiceError) => e.statusCode === 400,
    );
  });

  it('drops a highlight when its indicator is deleted', async () => {
    const { page, indicators } = await seed();
    await setPageHighlights(
      'pendidikan',
      {
        indicatorIds: [indicators[0]!.id, indicators[1]!.id],
        expectedUpdatedAt: await fresh(page.id),
      },
      ACTOR,
      REQUEST_CONTEXT,
    );
    await prisma.indicator.delete({ where: { id: indicators[0]!.id } });
    assert.deepEqual((await getAllPageHighlights())['pendidikan']?.indicatorIds, [
      indicators[1]!.id,
    ]);
  });

  it('saves an indicator whose stale highlight row sits on its former topic', async () => {
    const { page, indicators } = await seed();
    const other = await prisma.page.create({
      data: { slug: 'kesehatan', title: 'Kesehatan', sortOrder: 1 },
    });
    await prisma.pageHighlight.create({
      data: { pageId: other.id, indicatorId: indicators[0]!.id, position: 1 },
    });
    await setPageHighlights(
      'pendidikan',
      { indicatorIds: [indicators[0]!.id], expectedUpdatedAt: await fresh(page.id) },
      ACTOR,
      REQUEST_CONTEXT,
    );
    assert.deepEqual((await getAllPageHighlights())['pendidikan']?.indicatorIds, [
      indicators[0]!.id,
    ]);
  });
});
