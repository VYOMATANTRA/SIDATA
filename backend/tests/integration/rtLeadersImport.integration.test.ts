import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import prisma from '../../src/utils/prisma.js';
import {
  createSpatialPoint,
  importRtLeadersCsv,
  previewRtLeadersImport,
  updateSpatialPoint,
} from '../../src/services/maps.service.js';
import { RT_LEADERS_CSV_HEADER } from '../../src/utils/rtLeadersCsv.js';
import {
  ACTOR,
  REQUEST_CONTEXT,
  createIsolatedClient,
  gateAfterFirstCoverageRead,
  innodbDeadlockCount,
  insertLeader,
  insertPoint,
  disconnectResetClient,
  resetDatabase,
} from './helpers/db.js';

const header = RT_LEADERS_CSV_HEADER.join(',');
const clientA = createIsolatedClient(20_000) as unknown as typeof prisma;
const clientB = createIsolatedClient() as unknown as typeof prisma;

/**
 * A client whose import transaction pauses as soon as its pre-lock coverage read has
 * returned. `paused` resolves while the transaction is still open and undecided; `release`
 * lets it continue. No wall-clock timing is involved.
 */
function gatedImportClient(base: typeof prisma) {
  let release!: () => void;
  const resume = new Promise<void>((resolve) => {
    release = resolve;
  });
  let signalPaused!: () => void;
  const paused = new Promise<void>((resolve) => {
    signalPaused = resolve;
  });
  const client = gateAfterFirstCoverageRead(base, { onPaused: signalPaused, resume });
  return { client, release, paused };
}

function csv(rows: string[]): string {
  return [header, ...rows].join('\n');
}

async function readLeader(rtNumber: number) {
  return prisma.rtLeader.findUnique({ where: { rtNumber } });
}

async function readPoint(id: string) {
  return prisma.spatialPoint.findUnique({ where: { id }, include: { rtCoverages: true } });
}

async function countAudit(action: string): Promise<number> {
  return prisma.auditLog.count({ where: { action } });
}

async function seedTwoPoints(): Promise<void> {
  await insertLeader(prisma, 1);
  await insertLeader(prisma, 2);
  await insertPoint(prisma, { id: 'point-rt-01', latitude: -1.25, longitude: 116.95, rts: [1] });
  await insertPoint(prisma, { id: 'point-rt-02', latitude: -1.26, longitude: 116.96, rts: [2] });
}

describe('CSV import against real MySQL', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  after(async () => {
    await Promise.all([clientA.$disconnect(), clientB.$disconnect()]);
    await resetDatabase();
    await disconnectResetClient();
    await prisma.$disconnect();
  });

  it('keeps preview, writes, and audits consistent with the resulting phone', async () => {
    await insertLeader(prisma, 99, { name: 'Synthetic Leader', phone: '', phoneIsWhatsapp: false });
    const unchanged = csv(['99,Synthetic Leader,,true,,,']);
    const preview = await previewRtLeadersImport(unchanged);
    assert.deepEqual(preview.rows[0]?.changedFields, []);
    const result = await importRtLeadersCsv(unchanged, ACTOR, REQUEST_CONTEXT);
    assert.equal(result.summary.unchanged, 1);
    assert.equal((await readLeader(99))?.phoneIsWhatsapp, false);
    assert.equal(await prisma.auditLog.count(), 0);

    const renamed = csv(['99,Synthetic Updated,,true,,,']);
    const renamedPreview = await previewRtLeadersImport(renamed);
    assert.deepEqual(renamedPreview.rows[0]?.changedFields, ['name']);
    const renamedResult = await importRtLeadersCsv(renamed, ACTOR, REQUEST_CONTEXT);
    assert.deepEqual(renamedResult.rows[0]?.changedFields, ['name']);
    assert.equal((await readLeader(99))?.phoneIsWhatsapp, false);

    const withPhone = csv(['99,Synthetic Updated,08123456789,true,,,']);
    assert.deepEqual((await previewRtLeadersImport(withPhone)).rows[0]?.changedFields, [
      'phone',
      'phoneIsWhatsapp',
    ]);
    await importRtLeadersCsv(withPhone, ACTOR, REQUEST_CONTEXT);
    assert.equal((await readLeader(99))?.phoneIsWhatsapp, true);

    const clearPhone = csv(['99,Synthetic Updated,\\N,true,,,']);
    assert.deepEqual((await previewRtLeadersImport(clearPhone)).rows[0]?.changedFields, [
      'phone',
      'phoneIsWhatsapp',
    ]);
    await importRtLeadersCsv(clearPhone, ACTOR, REQUEST_CONTEXT);
    const cleared = await readLeader(99);
    assert.equal(cleared?.phone, '');
    assert.equal(cleared?.phoneIsWhatsapp, false);
  });

  it('applies opposite-order concurrent imports atomically with zero InnoDB deadlocks', async () => {
    await seedTwoPoints();
    const deadlocksBefore = await innodbDeadlockCount(prisma);

    const importA = csv([
      '1,Ketua Satu,0812000001,false,Jl A,-1.3001,116.9001',
      '2,Ketua Dua,0812000002,false,Jl A,-1.3002,116.9002',
    ]);
    const importB = csv([
      '2,Ketua Dua,0812000002,false,Jl B,-1.4002,116.8002',
      '1,Ketua Satu,0812000001,false,Jl B,-1.4001,116.8001',
    ]);

    const [first, second] = await Promise.all([
      importRtLeadersCsv(importA, ACTOR, REQUEST_CONTEXT, clientA),
      importRtLeadersCsv(importB, ACTOR, REQUEST_CONTEXT, clientB),
    ]);

    assert.equal(first.summary.changed, 2);
    assert.equal(second.summary.changed, 2);

    const point1 = await readPoint('point-rt-01');
    const point2 = await readPoint('point-rt-02');
    const fromA =
      point1?.latitude === -1.3001 &&
      point2?.latitude === -1.3002 &&
      point1?.longitude === 116.9001;
    const fromB =
      point1?.latitude === -1.4001 &&
      point2?.latitude === -1.4002 &&
      point1?.longitude === 116.8001;
    assert.ok(
      fromA || fromB,
      `mixed outcome from concurrent imports: ${JSON.stringify({ point1, point2 })}`,
    );

    assert.equal(
      await innodbDeadlockCount(prisma),
      deadlocksBefore,
      'no InnoDB deadlock may occur, not even one recovered by the internal retry',
    );
  });

  it('serializes a CSV coordinate move against a manual point PATCH without deadlock', async () => {
    await seedTwoPoints();
    const deadlocksBefore = await innodbDeadlockCount(prisma);

    const imported = importRtLeadersCsv(
      csv(['1,Ketua Satu,0812000001,false,Jl A,-1.3111,116.9111']),
      ACTOR,
      REQUEST_CONTEXT,
      clientA,
    );
    const patched = updateSpatialPoint(
      'point-rt-01',
      { latitude: -1.3222, longitude: 116.9222 },
      ACTOR,
      REQUEST_CONTEXT,
      clientB,
    );

    await Promise.all([imported, patched]);

    const point = await readPoint('point-rt-01');
    const serialOutcomes = [
      { latitude: -1.3111, longitude: 116.9111 },
      { latitude: -1.3222, longitude: 116.9222 },
    ];
    assert.ok(
      serialOutcomes.some(
        (outcome) => point?.latitude === outcome.latitude && point?.longitude === outcome.longitude,
      ),
      `final coordinates must equal one complete writer's result, got ${JSON.stringify(point)}`,
    );
    assert.equal(
      await innodbDeadlockCount(prisma),
      deadlocksBefore,
      'import and PATCH must take locks in the same order',
    );
  });

  it('creates at most one ketua_rt point when import races a manual create for the same RT', async () => {
    await insertLeader(prisma, 3);
    const deadlocksBefore = await innodbDeadlockCount(prisma);

    const results = await Promise.allSettled([
      importRtLeadersCsv(
        csv(['3,Ketua Tiga,0812000003,false,Jl C,-1.31,116.91']),
        ACTOR,
        REQUEST_CONTEXT,
        clientA,
      ),
      createSpatialPoint(
        {
          name: 'Pos RT 03 Manual',
          type: 'ketua_rt',
          latitude: -1.32,
          longitude: 116.92,
          rts: [3],
        },
        ACTOR,
        REQUEST_CONTEXT,
        clientB,
      ),
    ]);

    const covering = await prisma.spatialPoint.count({
      where: { type: 'ketua_rt', rtCoverages: { some: { rtNumber: 3 } } },
    });
    assert.equal(covering, 1, 'exactly one ketua_rt point may cover RT 3');

    const rejected = results.filter((result) => result.status === 'rejected');
    assert.ok(rejected.length <= 1, 'at most one writer may lose the race');
    assert.equal(
      await innodbDeadlockCount(prisma),
      deadlocksBefore,
      'duplicate-create race must resolve through the leader lock, not a deadlock',
    );
  });

  it('creates exactly one point when a manual create commits after the import snapshot', async () => {
    await insertLeader(prisma, 3);

    const gated = gatedImportClient(clientA);
    const pending = importRtLeadersCsv(
      csv(['3,Ketua Tiga,0812000003,false,Jl Import,-1.31,116.91']),
      ACTOR,
      REQUEST_CONTEXT,
      gated.client,
    );
    // The import has read "no point covers RT 3" and is paused inside its transaction.
    await gated.paused;

    await createSpatialPoint(
      {
        name: 'Pos RT 03 Manual',
        type: 'ketua_rt',
        latitude: -1.32,
        longitude: 116.92,
        rts: [3],
      },
      ACTOR,
      REQUEST_CONTEXT,
      clientB,
    );

    gated.release();
    const result = await pending;
    assert.equal(result.summary.changed, 1);

    const covering = await prisma.spatialPoint.findMany({
      where: { type: 'ketua_rt', rtCoverages: { some: { rtNumber: 3 } } },
    });
    assert.equal(covering.length, 1, 'exactly one ketua_rt point may cover RT 3');
    assert.equal(covering[0]?.latitude, -1.31);
    assert.equal(covering[0]?.longitude, 116.91);

    const updated = await prisma.auditLog.findMany({ where: { action: 'spatial_point.updated' } });
    assert.equal(updated.length, 1);
    const metadata = updated[0]?.metadata as Record<string, unknown>;
    assert.equal(metadata.via, 'csv-import');
    assert.deepEqual(metadata.from, { latitude: -1.32, longitude: 116.92 });
  });

  it('does not move a point that a concurrent manual write reassigned to another RT', async () => {
    await insertLeader(prisma, 1);
    await insertLeader(prisma, 2);
    await insertPoint(prisma, { id: 'point-rt-01', latitude: -1.25, longitude: 116.95, rts: [1] });

    const gated = gatedImportClient(clientA);
    const pending = importRtLeadersCsv(
      csv(['1,Ketua Satu,0812000001,false,Jl Import,-1.3111,116.9111']),
      ACTOR,
      REQUEST_CONTEXT,
      gated.client,
    );
    // The import has seen point-rt-01 covering RT 1 and is paused inside its transaction.
    await gated.paused;

    await updateSpatialPoint('point-rt-01', { rts: [2] }, ACTOR, REQUEST_CONTEXT, clientB);

    gated.release();
    await pending;

    const reassigned = await readPoint('point-rt-01');
    assert.deepEqual(
      reassigned?.rtCoverages.map((coverage) => coverage.rtNumber),
      [2],
      'RT 2 must keep its point',
    );
    assert.equal(reassigned?.latitude, -1.25, 'RT 2 point must not be moved by the import');
    assert.equal(reassigned?.longitude, 116.95);

    const rtOnePoints = await prisma.spatialPoint.findMany({
      where: { type: 'ketua_rt', rtCoverages: { some: { rtNumber: 1 } } },
    });
    assert.equal(rtOnePoints.length, 1, 'RT 1 must gain its own point instead');
    assert.equal(rtOnePoints[0]?.latitude, -1.3111);
    assert.equal(rtOnePoints[0]?.longitude, 116.9111);

    const movedByImport = (
      await prisma.auditLog.findMany({
        where: { action: 'spatial_point.updated', targetId: 'point-rt-01' },
      })
    ).filter((row) => (row.metadata as Record<string, unknown> | null)?.via === 'csv-import');
    assert.equal(
      movedByImport.length,
      0,
      'no audit row may claim point-rt-01 was moved by the import',
    );
  });

  it('re-reads coverage after the point lock so a concurrent coverage change is not missed', async () => {
    await seedTwoPoints();

    const gated = gatedImportClient(clientA);
    const pending = importRtLeadersCsv(
      csv(['1,Ketua Satu,0812000001,false,Jl A,-1.3111,116.9111']),
      ACTOR,
      REQUEST_CONTEXT,
      gated.client,
    );
    // The import has read point-rt-01 as an RT 1-only point and is paused.
    await gated.paused;

    // Defensive case: raw SQL creates a multi-RT point the write API would refuse. It runs
    // to completion here, so the import must re-read the committed coverage after its lock.
    const blocker = createIsolatedClient();
    try {
      await blocker.$transaction(async (tx) => {
        await tx.$queryRawUnsafe(
          `SELECT id FROM spatial_points WHERE id = 'point-rt-01' FOR UPDATE`,
        );
        await tx.$executeRawUnsafe(
          "INSERT INTO spatial_point_rt (point_id, rt_number) VALUES ('point-rt-01', 2)",
        );
      });
    } finally {
      await blocker.$disconnect();
    }

    gated.release();
    await assert.rejects(pending, (error: unknown) => {
      const err = error as { statusCode?: number; message?: string };
      assert.equal(err.statusCode, 409);
      assert.match(String(err.message), /mencakup 2 RT/);
      return true;
    });

    const point = await readPoint('point-rt-01');
    assert.equal(point?.latitude, -1.25, 'rejected import must not move the shared point');
    assert.equal(point?.longitude, 116.95);
    assert.equal(
      await countAudit('spatial_point.updated'),
      0,
      'rejected import must not leave a spatial_point audit row',
    );
  });

  it('rolls back every earlier row when a later row targets a shared point', async () => {
    await insertLeader(prisma, 1);
    await insertLeader(prisma, 2);
    await insertPoint(prisma, { id: 'point-rt-01', latitude: -1.25, longitude: 116.95, rts: [1] });
    await insertPoint(prisma, {
      id: 'point-shared',
      latitude: -1.26,
      longitude: 116.96,
      rts: [2, 4],
    });
    await insertLeader(prisma, 4);

    const before = await readPoint('point-rt-01');

    await assert.rejects(
      importRtLeadersCsv(
        csv([
          '1,Ketua Satu Baru,0812000001,false,Jl Baru,-1.3111,116.9111',
          '2,Ketua Dua,0812000002,false,Jl Dua,-1.3112,116.9112',
        ]),
        ACTOR,
        REQUEST_CONTEXT,
      ),
      (error: unknown) => (error as { statusCode?: number }).statusCode === 409,
    );

    const leader = await readLeader(1);
    const point = await readPoint('point-rt-01');
    assert.equal(leader?.name, 'Ketua RT 01', 'row 1 update must be rolled back');
    assert.equal(leader?.phone, '');
    assert.equal(point?.latitude, before?.latitude);
    assert.equal(point?.longitude, before?.longitude);
    assert.equal(await countAudit('spatial_point.updated'), 0);
    assert.equal(await countAudit('rt_leader.imported'), 0);
  });

  it('rejects a multi-RT point in preview without writing anything', async () => {
    await insertLeader(prisma, 1);
    await insertPoint(prisma, {
      id: 'point-shared',
      latitude: -1.25,
      longitude: 116.95,
      rts: [1, 2],
    });

    const preview = await previewRtLeadersImport(
      csv(['1,Ketua Satu,0812000001,false,Jl A,-1.31,116.91']),
    );
    assert.equal(preview.errors.length, 1);
    assert.equal(preview.errors[0]?.field, 'coordinates');
    assert.equal(preview.summary.changed, 0);
  });

  it('treats an identical re-import as a no-op: no writes, no timestamps, no audit rows', async () => {
    await seedTwoPoints();
    const rows = ['1,Ketua Satu,0812000001,false,Jl A,-1.3111,116.9111'];

    const first = await importRtLeadersCsv(csv(rows), ACTOR, REQUEST_CONTEXT);
    assert.equal(first.summary.changed, 1);

    const leaderAfterFirst = await readLeader(1);
    const pointAfterFirst = await readPoint('point-rt-01');
    const auditsAfterFirst = await prisma.auditLog.count();

    const second = await importRtLeadersCsv(csv(rows), ACTOR, REQUEST_CONTEXT);
    assert.equal(second.summary.changed, 0);
    assert.equal(second.summary.unchanged, 1);

    const leaderAfterSecond = await readLeader(1);
    const pointAfterSecond = await readPoint('point-rt-01');
    assert.deepEqual(leaderAfterSecond?.updatedAt, leaderAfterFirst?.updatedAt);
    assert.deepEqual(pointAfterSecond?.updatedAt, pointAfterFirst?.updatedAt);
    assert.equal(await prisma.auditLog.count(), auditsAfterFirst);
  });

  it('emits per-point audit rows for coordinate moves and point creation', async () => {
    await insertLeader(prisma, 1);
    await insertLeader(prisma, 9);
    await insertPoint(prisma, { id: 'point-rt-01', latitude: -1.25, longitude: 116.95, rts: [1] });

    await importRtLeadersCsv(
      csv([
        '1,Ketua Satu,0812000001,false,Jl A,-1.3111,116.9111',
        '9,Ketua Sembilan,0812000009,false,Jl S,-1.39,116.89',
      ]),
      ACTOR,
      REQUEST_CONTEXT,
    );

    const updated = await prisma.auditLog.findMany({ where: { action: 'spatial_point.updated' } });
    const created = await prisma.auditLog.findMany({ where: { action: 'spatial_point.created' } });
    assert.equal(updated.length, 1);
    assert.equal(created.length, 1);
    assert.equal(created[0]?.targetLabel, 'Pos RT 09 Kelurahan Manggar');

    const metadata = updated[0]?.metadata as Record<string, unknown>;
    assert.equal(metadata.via, 'csv-import');
    assert.deepEqual(metadata.from, { latitude: -1.25, longitude: 116.95 });
  });
});
