import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import prisma from '../../src/utils/prisma.js';
import { cleanLegacySampleRtData } from '../../src/services/legacySampleRtCleanup.service.js';
import {
  LEGACY_SAMPLE_LEADERS,
  LEGACY_SAMPLE_POINT_ID,
} from '../../src/utils/legacySampleRtFingerprints.js';
import { disconnectResetClient, resetDatabase } from './helpers/db.js';

/** Same synthetic legacy fixture the unit suite uses; digits are split so no dialable literal is stored. */
const legacyPhone = (rt: 1 | 2 | 3): string =>
  ({ 1: ['0812', '3456', '7801'], 2: ['0812', '3456', '7802'], 3: ['0812', '3456', '7803'] })[
    rt
  ].join('');

describe('legacy sample cleanup against real MySQL', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  after(async () => {
    await resetDatabase();
    await disconnectResetClient();
    await prisma.$disconnect();
  });

  it('deletes the legacy point and writes its own deletion audit row in the same run', async () => {
    await prisma.spatialPoint.create({
      data: {
        id: LEGACY_SAMPLE_POINT_ID,
        name: 'Pos RT 01 Manggar',
        type: 'ketua_rt',
        latitude: -1.2235,
        longitude: 116.9521,
        rtCoverages: { create: [{ rtNumber: 1 }] },
      },
    });
    await prisma.rtLeader.create({
      data: {
        rtNumber: 1,
        name: LEGACY_SAMPLE_LEADERS[1]!.name,
        phone: legacyPhone(1),
        phoneIsWhatsapp: true,
        alamat: 'Jl. Lama 1',
      },
    });

    const result = await cleanLegacySampleRtData('script');

    assert.equal(result.deletedPoints, 1);
    assert.equal(result.deletedJunctions, 1);
    assert.equal(result.updatedLeaders, 1);
    assert.equal(await prisma.spatialPoint.count({ where: { id: LEGACY_SAMPLE_POINT_ID } }), 0);

    const deletedAudit = await prisma.auditLog.findMany({
      where: { action: 'spatial_point.deleted', targetId: LEGACY_SAMPLE_POINT_ID },
    });
    assert.equal(deletedAudit.length, 1, 'a point deletion must emit spatial_point.deleted');
    assert.equal(deletedAudit[0]?.actorRole, 'system');

    const summary = await prisma.auditLog.findMany({
      where: { action: 'maintenance.legacy_rt_cleanup' },
    });
    assert.equal(summary.length, 1);

    const leader = await prisma.rtLeader.findUnique({ where: { rtNumber: 1 } });
    assert.equal(leader?.name, 'Ketua RT 01');
    assert.equal(leader?.phone, '—');
    assert.equal(leader?.phoneIsWhatsapp, false);
    assert.equal(leader?.alamat, null);
  });

  it('preserves an edited leader while still deleting the matching sample point', async () => {
    await prisma.spatialPoint.create({
      data: {
        id: LEGACY_SAMPLE_POINT_ID,
        name: 'Pos RT 01 Manggar',
        type: 'ketua_rt',
        latitude: -1.2235,
        longitude: 116.9521,
      },
    });
    await prisma.rtLeader.create({
      data: {
        rtNumber: 1,
        name: 'Nama Sudah Diedit',
        phone: '081299999999',
        phoneIsWhatsapp: true,
        alamat: 'Alamat Baru',
      },
    });

    const result = await cleanLegacySampleRtData('script');

    assert.equal(result.deletedPoints, 1);
    assert.equal(result.updatedLeaders, 0);
    const leader = await prisma.rtLeader.findUnique({ where: { rtNumber: 1 } });
    assert.equal(leader?.name, 'Nama Sudah Diedit');
    assert.equal(leader?.alamat, 'Alamat Baru');
  });

  it('is a no-op on a second run: no writes and no new audit rows', async () => {
    await cleanLegacySampleRtData('script');
    const auditCount = await prisma.auditLog.count();

    const result = await cleanLegacySampleRtData('script');

    assert.deepEqual(result, { deletedJunctions: 0, deletedPoints: 0, updatedLeaders: 0 });
    assert.equal(await prisma.auditLog.count(), auditCount);
  });
});
