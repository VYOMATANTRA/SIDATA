import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import prisma from '../../src/utils/prisma.js';
import {
  createSpatialPointCoverage,
  deleteSpatialPointCoverage,
} from '../../src/services/maps.service.js';
import {
  ACTOR,
  REQUEST_CONTEXT,
  disconnectResetClient,
  insertPoint,
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
});
