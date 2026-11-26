import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import prisma from '../../src/utils/prisma.js';
import { getDashboard } from '../../src/services/dashboard.service.js';
import { disconnectResetClient, resetDatabase } from './helpers/db.js';

describe('getDashboard against real MySQL', () => {
  beforeEach(async () => resetDatabase());
  after(async () => {
    await resetDatabase();
    await disconnectResetClient();
    await prisma.$disconnect();
  });

  it('counts content, flags stale figures and topics without highlights, and lists only content changes', async () => {
    const page = await prisma.page.create({
      data: { slug: 'pendidikan', title: 'Pendidikan', sortOrder: 0 },
    });
    const chapter = await prisma.chapter.create({
      data: { pageId: page.id, slug: 'bab', title: 'Bab', sortOrder: 0 },
    });
    const section = await prisma.section.create({
      data: { chapterId: chapter.id, slug: 's', sortOrder: 0 },
    });
    await prisma.indicator.create({
      data: {
        sectionId: section.id,
        slug: 'i1',
        label: 'Jumlah guru',
        valueCurrent: 1,
        periodCurrent: '2026',
        isStale: true,
      },
    });
    await prisma.auditLog.createMany({
      data: [
        {
          action: 'indicator.updated',
          targetType: 'indicator',
          targetLabel: 'Jumlah guru',
          actorEmail: 'a@x.id',
        },
        { action: 'auth.login', actorEmail: 'a@x.id' },
      ],
    });

    const d = await getDashboard();
    assert.equal(d.counts.indicators, 1);
    assert.equal(d.counts.pages, 1);
    assert.equal(d.health.staleIndicators.count, 1);
    assert.deepEqual(d.health.staleIndicators.items[0], {
      id: d.health.staleIndicators.items[0]!.id,
      label: 'Jumlah guru',
      pageSlug: 'pendidikan',
    });
    assert.deepEqual(d.health.pagesWithoutHighlights, [
      { slug: 'pendidikan', title: 'Pendidikan' },
    ]);
    assert.equal(d.recentChanges.length, 1);
    assert.equal(d.recentChanges[0]!.actorName, 'a');
  });
});
