import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import prisma from '../../src/utils/prisma.js';
import {
  createSpatialPointCoverage,
  deleteSpatialPointCoverage,
  updateSpatialPoint,
  deleteSpatialPoint,
  RT_SEED_POINT_TOMBSTONES_KEY,
} from '../../src/services/maps.service.js';
import {
  ACTOR,
  REQUEST_CONTEXT,
  disconnectResetClient,
  insertPoint,
  insertLeader,
  resetDatabase,
} from './helpers/db.js';

describe('spatial point coverage against real MySQL', () => {
  beforeEach(async () => resetDatabase());
  after(async () => {
    await resetDatabase();
    await disconnectResetClient();
    await prisma.$disconnect();
  });

  it('creates and deletes coverage with accurate responses and transactional audit rows', async () => {
    await insertPoint(prisma, { id: 'synthetic-bank', type: 'bank_sampah', rts: [1] });
    const created = await createSpatialPointCoverage(
      'synthetic-bank',
      { rtNumber: 2 },
      ACTOR,
      REQUEST_CONTEXT,
    );
    assert.deepEqual(created, { id: created.id, pointId: 'synthetic-bank', rtNumber: 2 });
    assert.ok(
      await prisma.spatialPointRt.findUnique({
        where: { pointId_rtNumber: { pointId: 'synthetic-bank', rtNumber: 2 } },
      }),
    );
    assert.equal(await prisma.auditLog.count({ where: { action: 'spatial_point_rt.created' } }), 1);

    const deleted = await deleteSpatialPointCoverage('synthetic-bank', 2, ACTOR, REQUEST_CONTEXT);
    assert.deepEqual(deleted, created);
    assert.equal(
      await prisma.spatialPointRt.findUnique({
        where: { pointId_rtNumber: { pointId: 'synthetic-bank', rtNumber: 2 } },
      }),
      null,
    );
    assert.equal(await prisma.auditLog.count({ where: { action: 'spatial_point_rt.deleted' } }), 1);
  });

  it('rejects stale update and delete without changing the reassigned point, audit or tombstones', async () => {
    await insertLeader(prisma, 1);
    await insertLeader(prisma, 2);
    await insertPoint(prisma, { id: 'synthetic-stale', rts: [1] });
    await updateSpatialPoint('synthetic-stale', { rts: [2] }, ACTOR, REQUEST_CONTEXT);
    const before = await prisma.spatialPoint.findUnique({
      where: { id: 'synthetic-stale' },
      include: { rtCoverages: true },
    });
    const audits = await prisma.auditLog.count();
    const tombstones = await prisma.systemSetting.findUnique({
      where: { key: RT_SEED_POINT_TOMBSTONES_KEY },
    });
    for (const operation of [
      () =>
        updateSpatialPoint(
          'synthetic-stale',
          { latitude: -1.4 },
          ACTOR,
          REQUEST_CONTEXT,
          prisma,
          1,
        ),
      () => deleteSpatialPoint('synthetic-stale', ACTOR, REQUEST_CONTEXT, prisma, 1),
    ]) {
      await assert.rejects(
        operation,
        (error: unknown) => (error as { statusCode?: number }).statusCode === 409,
      );
    }
    assert.deepEqual(
      await prisma.spatialPoint.findUnique({
        where: { id: 'synthetic-stale' },
        include: { rtCoverages: true },
      }),
      before,
    );
    assert.equal(await prisma.auditLog.count(), audits);
    assert.deepEqual(
      await prisma.systemSetting.findUnique({ where: { key: RT_SEED_POINT_TOMBSTONES_KEY } }),
      tombstones,
    );
  });
});
