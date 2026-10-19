import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  createSpatialPoint,
  updateSpatialPoint,
  deleteSpatialPoint,
  createSpatialPointCoverage,
  deleteSpatialPointCoverage,
  updateRtLeader,
  MapsServiceError,
} from '../services/maps.service.js';
import prisma from '../utils/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';

type AnyRecord = Record<string, unknown>;
type AsyncFn = (...args: never[]) => Promise<unknown>;

const ACTOR = { id: 'editor-1', email: 'editor@example.com', role: 'editor' };
const CONTEXT = { ipAddress: '127.0.0.1', userAgent: 'TestAgent/1.0' };

// ---------------------------------------------------------------------------
// In-memory tx emulator: mirrors indicatorTables.service.test.ts's stub harness,
// but keeps points/coverages/leaders state maps so the ketua_rt <-> RT invariant
// (SPEC.md §7) is asserted against actual post-write global state. The write
// path re-loads every ketua_rt point's coverages through tx.spatialPointRt.findMany,
// which the emulator filters on point type exactly the way the database would.
// ---------------------------------------------------------------------------

interface PointRecord {
  id: string;
  name: string;
  type: 'ketua_rt' | 'bank_sampah' | 'fasilitas_umum';
  latitude: number;
  longitude: number;
  metadata: AnyRecord | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CoverageRecord {
  id: number;
  pointId: string;
  rtNumber: number;
  createdAt: Date;
}

interface LeaderRecord {
  rtNumber: number;
  name: string;
  phone: string;
  phoneIsWhatsapp: boolean;
  alamat: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const P = new Date('2026-08-01T00:00:00Z');

const ketuaPoint = (overrides: Partial<PointRecord> = {}): PointRecord => ({
  id: 'point-ketua-1',
  name: 'Pos RT 5',
  type: 'ketua_rt',
  latitude: -1.2235,
  longitude: 116.9521,
  metadata: { note: 'Posyandu' },
  createdAt: P,
  updatedAt: P,
  ...overrides,
});

const bankSampahPoint = (overrides: Partial<PointRecord> = {}): PointRecord => ({
  id: 'point-bs-1',
  name: 'Bank Sampah Sejahtera',
  type: 'bank_sampah',
  latitude: -1.225,
  longitude: 116.955,
  metadata: { jadwal: 'Minggu 09:00' },
  createdAt: P,
  updatedAt: P,
  ...overrides,
});

const sampleLeader = (overrides: Partial<LeaderRecord> = {}): LeaderRecord => ({
  rtNumber: 5,
  name: 'Andi Pratama',
  phone: '081234567805',
  phoneIsWhatsapp: true,
  alamat: 'Jl. Mulawarman No. 5',
  createdAt: P,
  updatedAt: P,
  ...overrides,
});

let points: Map<string, PointRecord>;
let coverages: CoverageRecord[];
let leaders: Map<number, LeaderRecord>;
let coverageIdSeq: number;

let auditRows: AnyRecord[];
let txCalls: unknown[][];
let queryRawCalls: unknown[][];
let pointCalls: Record<string, unknown[][]>;
let rtsCalls: Record<string, unknown[][]>;
let leaderCalls: Record<string, unknown[][]>;
let originals: Array<{ target: AnyRecord; key: string; fn: unknown }>;

function stubMethod(target: AnyRecord, key: string, fn: unknown) {
  originals.push({ target, key, fn: target[key] });
  target[key] = fn;
}

function proxied(impl: AnyRecord, calls: Record<string, unknown[][]>): AnyRecord {
  return new Proxy(
    {},
    {
      get:
        (_t, prop: string) =>
        async (...args: never[]) => {
          calls[prop] ??= [];
          calls[prop]!.push(args);
          return (impl[prop] as AsyncFn)(...args);
        },
    },
  );
}

function insertCoverages(pointId: string, rts: number[]) {
  for (const rtNumber of rts) {
    coverages.push({ id: coverageIdSeq++, pointId, rtNumber, createdAt: P });
  }
}

function seedState(
  pointList: PointRecord[],
  leaderList: LeaderRecord[] = [],
  coverageMap: Record<string, number[]> = {},
) {
  points = new Map(pointList.map((p) => [p.id, p]));
  coverages = [];
  leaders = new Map(leaderList.map((l) => [l.rtNumber, l]));
  coverageIdSeq = 1000;
  for (const [pointId, rts] of Object.entries(coverageMap)) {
    insertCoverages(pointId, rts);
  }
}

function coveragesOf(pointId: string): number[] {
  return coverages
    .filter((c) => c.pointId === pointId)
    .sort((a, b) => a.rtNumber - b.rtNumber)
    .map((c) => c.rtNumber);
}

beforeEach(() => {
  auditRows = [];
  txCalls = [];
  queryRawCalls = [];
  pointCalls = {};
  rtsCalls = {};
  leaderCalls = {};
  originals = [];
  seedState([], []);

  const pointImpl: AnyRecord = {
    findUnique: async (args: AnyRecord) => {
      const where = (args as { where: { id: string } }).where;
      const point = points.get(where.id);
      if (!point) return null;
      const rts = coveragesOf(point.id).map((rtNumber) => ({ rtNumber }));
      return { ...point, rtCoverages: rts };
    },
    create: async (args: AnyRecord) => {
      const data = args.data as AnyRecord;
      const point: PointRecord = {
        id: 'point-new',
        name: data.name as string,
        type: data.type as PointRecord['type'],
        latitude: data.latitude as number,
        longitude: data.longitude as number,
        metadata: data.metadata === undefined ? null : ((data.metadata ?? null) as AnyRecord),
        createdAt: P,
        updatedAt: P,
      };
      points.set(point.id, point);
      const nested =
        ((data.rtCoverages as AnyRecord | undefined)?.create as
          Array<{ rtNumber: number }> | undefined) ?? [];
      insertCoverages(
        point.id,
        nested.map((r) => r.rtNumber),
      );
      const rts = coveragesOf(point.id).map((rtNumber) => ({ rtNumber }));
      return { ...point, rtCoverages: rts };
    },
    update: async (args: AnyRecord) => {
      const { where, data } = args as { where: { id: string }; data: AnyRecord };
      const point = points.get(where.id);
      if (!point) throw new Error('unexpected update on missing point');
      const next = { ...point, ...data } as PointRecord;
      points.set(next.id, next);
      const rts = coveragesOf(next.id).map((rtNumber) => ({ rtNumber }));
      return { ...next, rtCoverages: rts };
    },
    // Coverage snapshot must happen BEFORE the delete wipes the rows (real cascades do that: the
    // returned "before" row is what the audit metadata records).
    delete: async (args: AnyRecord) => {
      const where = (args as { where: { id: string } }).where;
      const point = points.get(where.id);
      if (!point) throw new Error('unexpected delete on missing point');
      const rts = coveragesOf(where.id).map((rtNumber) => ({ rtNumber }));
      points.delete(where.id);
      coverages = coverages.filter((c) => c.pointId !== where.id);
      return { ...point, rtCoverages: rts };
    },
  };

  const rtsImpl: AnyRecord = {
    // Honors the `where: { point: { type } }` filter like the real database would: the
    // write path's invariant assert loads the globally complete ketua_rt coverage set.
    findMany: async (args: AnyRecord) => {
      const type = (args as { where: { point: { type: string } } }).where.point.type;
      return coverages
        .filter((c) => points.get(c.pointId)?.type === type)
        .map((c) => ({ pointId: c.pointId, rtNumber: c.rtNumber }));
    },
    findUnique: async (args: AnyRecord) => {
      const where = (args as { where: { pointId_rtNumber: { pointId: string; rtNumber: number } } })
        .where.pointId_rtNumber;
      return (
        coverages.find((c) => c.pointId === where.pointId && c.rtNumber === where.rtNumber) ?? null
      );
    },
    create: async (args: AnyRecord) => {
      const data = args.data as { pointId: string; rtNumber: number };
      const row: CoverageRecord = { id: coverageIdSeq++, createdAt: P, ...data };
      coverages.push(row);
      return row;
    },
    createMany: async (args: AnyRecord) => {
      const data = (args.data as Array<{ pointId: string; rtNumber: number }>) ?? [];
      for (const item of data) {
        coverages.push({ id: coverageIdSeq++, createdAt: P, ...item });
      }
      return { count: data.length };
    },
    delete: async (args: AnyRecord) => {
      const where = (args as { where: { pointId_rtNumber: { pointId: string; rtNumber: number } } })
        .where.pointId_rtNumber;
      const index = coverages.findIndex(
        (c) => c.pointId === where.pointId && c.rtNumber === where.rtNumber,
      );
      if (index === -1) throw new Error('unexpected delete on missing coverage');
      const [row] = coverages.splice(index, 1);
      return row as CoverageRecord;
    },
    deleteMany: async (args: AnyRecord) => {
      const where = (args as { where: { pointId: string; rtNumber: { in: number[] } } }).where;
      const before = coverages.length;
      coverages = coverages.filter(
        (c) => !(c.pointId === where.pointId && where.rtNumber.in.includes(c.rtNumber)),
      );
      return { count: before - coverages.length };
    },
  };

  const leaderImpl: AnyRecord = {
    findUnique: async (args: AnyRecord) => {
      const where = (args as { where: { rtNumber: number } }).where;
      return leaders.get(where.rtNumber) ?? null;
    },
    update: async (args: AnyRecord) => {
      const { where, data } = args as { where: { rtNumber: number }; data: AnyRecord };
      const found = leaders.get(where.rtNumber);
      if (!found) throw new Error('unexpected update on missing leader');
      const next = { ...found, ...data } as LeaderRecord;
      leaders.set(next.rtNumber, next);
      return next;
    },
  };

  const tx = {
    $queryRaw: (async (...args: never[]) => {
      queryRawCalls.push(args as unknown[]);
      return [];
    }) as AsyncFn,
    spatialPoint: proxied(pointImpl, pointCalls),
    spatialPointRt: proxied(rtsImpl, rtsCalls),
    rtLeader: proxied(leaderImpl, leaderCalls),
    auditLog: {
      create: (async (...args: never[]) => {
        const { data } = args[0] as unknown as { data: AnyRecord };
        const row = { id: `audit-${auditRows.length + 1}`, createdAt: new Date(), ...data };
        auditRows.push(row);
        return row;
      }) as AsyncFn,
    },
  };

  stubMethod(prisma as unknown as AnyRecord, '$transaction', (async (...args: never[]) => {
    txCalls.push(args);
    const arg = args[0] as unknown;
    if (typeof arg === 'function') return (arg as (tx: unknown) => Promise<unknown>)(tx);
    if (Array.isArray(arg)) return Promise.all(arg as Promise<unknown>[]);
    throw new Error('unsupported $transaction argument');
  }) as AsyncFn);
});

afterEach(() => {
  for (const { target, key, fn } of originals) {
    target[key] = fn;
  }
});

async function assertServiceError(
  promise: Promise<unknown>,
  statusCode: number,
  messagePart?: string,
) {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof MapsServiceError);
    assert.equal(err.statusCode, statusCode);
    if (messagePart) assert.match(err.message, new RegExp(messagePart));
    return true;
  });
}

// ---------------------------------------------------------------------------
// createSpatialPoint
// ---------------------------------------------------------------------------

describe('maps.service createSpatialPoint', () => {
  const pointPayload = (overrides: AnyRecord = {}): AnyRecord => ({
    name: 'Pos RT 5 (baru)',
    type: 'ketua_rt',
    latitude: -1.2235,
    longitude: 116.9521,
    ...overrides,
  });

  it('rejects non-object payloads with 400 without opening a transaction', async () => {
    await assertServiceError(createSpatialPoint(null, ACTOR, CONTEXT), 400);
    await assertServiceError(createSpatialPoint('x', ACTOR, CONTEXT), 400);
    await assertServiceError(createSpatialPoint([], ACTOR, CONTEXT), 400);
    assert.equal(txCalls.length, 0);
  });

  it('rejects invalid field values with 400 before touching the database', async () => {
    await assertServiceError(createSpatialPoint(pointPayload({ name: '' }), ACTOR, CONTEXT), 400);
    await assertServiceError(
      createSpatialPoint(pointPayload({ type: 'rumah' }), ACTOR, CONTEXT),
      400,
      'Tipe titik',
    );
    await assertServiceError(
      createSpatialPoint(pointPayload({ latitude: 91 }), ACTOR, CONTEXT),
      400,
      'Latitude',
    );
    await assertServiceError(
      createSpatialPoint(pointPayload({ longitude: 181 }), ACTOR, CONTEXT),
      400,
      'Longitude',
    );
    await assertServiceError(
      createSpatialPoint(pointPayload({ rts: [0] }), ACTOR, CONTEXT),
      400,
      'Nomor RT',
    );
    await assertServiceError(createSpatialPoint(pointPayload({ rts: [101] }), ACTOR, CONTEXT), 400);
    await assertServiceError(
      createSpatialPoint(pointPayload({ rts: [5.5] }), ACTOR, CONTEXT),
      400,
      'bilangan bulat',
    );
    await assertServiceError(
      createSpatialPoint(pointPayload({ rts: [5, 5] }), ACTOR, CONTEXT),
      400,
      'duplikat',
    );
    await assertServiceError(
      createSpatialPoint(pointPayload({ metadata: 'bukan-objek' }), ACTOR, CONTEXT),
      400,
    );
    assert.equal(txCalls.length, 0);
  });

  it('creates a ketua_rt point covering exactly one RT, joins the leader, and audits it', async () => {
    seedState([], [sampleLeader()], {});
    const dto = await createSpatialPoint(pointPayload({ rts: [5] }), ACTOR, CONTEXT);

    assert.equal(dto.type, 'ketua_rt');
    assert.deepEqual(dto.rts, [5]);
    assert.equal(dto.rtLeader?.rtNumber, 5);
    assert.equal(dto.rtLeader?.name, 'Andi Pratama');
    assert.equal(dto.metadata, null);

    // The claimed RT's rt_leaders row was locked before the create ran.
    assert.ok(queryRawCalls.length > 0, 'rt_leaders rows must be locked FOR UPDATE');

    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0]?.action, 'spatial_point.created');
    assert.equal(auditRows[0]?.actorId, 'editor-1');
    assert.equal(auditRows[0]?.targetType, 'spatial_point');
    assert.deepEqual((auditRows[0]?.metadata as AnyRecord)['coverages'], [5]);

    const persisted = coverages.find((c) => c.pointId === 'point-new');
    assert.equal(persisted?.rtNumber, 5);
  });

  it('rejects a ketua_rt create without RT coverage (exactly-one invariant)', async () => {
    await assertServiceError(
      createSpatialPoint(pointPayload(), ACTOR, CONTEXT),
      400,
      'tepat satu RT',
    );
    assert.equal(auditRows.length, 0);
  });

  it('rejects a ketua_rt create with two RT coverages', async () => {
    await assertServiceError(
      createSpatialPoint(pointPayload({ rts: [5, 6] }), ACTOR, CONTEXT),
      400,
      'tepat satu RT',
    );
    assert.equal(auditRows.length, 0);
  });

  it('rejects a ketua_rt create claiming an RT another ketua_rt point already covers', async () => {
    seedState([ketuaPoint({ id: 'point-a', name: 'Pos 5' })], [], { 'point-a': [5] });
    await assertServiceError(
      createSpatialPoint(pointPayload({ rts: [5] }), ACTOR, CONTEXT),
      409,
      'sudah dicakup',
    );
    assert.equal(auditRows.length, 0);
  });

  it('creates a bank_sampah point spanning several RTs without any invariant check', async () => {
    const dto = await createSpatialPoint(
      pointPayload({ name: 'Bank Sampah Sejahtera', type: 'bank_sampah', rts: [30, 72, 60] }),
      ACTOR,
      CONTEXT,
    );
    assert.equal(dto.type, 'bank_sampah');
    assert.deepEqual(dto.rts, [30, 60, 72]);
    assert.equal(dto.rtLeader, null);
    assert.equal(auditRows[0]?.action, 'spatial_point.created');
  });
});

// ---------------------------------------------------------------------------
// updateSpatialPoint
// ---------------------------------------------------------------------------

describe('maps.service updateSpatialPoint', () => {
  function seed() {
    seedState(
      [ketuaPoint(), bankSampahPoint(), ketuaPoint({ id: 'point-b', name: 'Pos RT 7' })],
      [sampleLeader()],
      { 'point-ketua-1': [5], 'point-bs-1': [1, 2, 3], 'point-b': [7] },
    );
  }

  it('rejects empty and unknown-field payloads with 400', async () => {
    seed();
    await assertServiceError(updateSpatialPoint('point-ketua-1', {}, ACTOR, CONTEXT), 400);
    await assertServiceError(
      updateSpatialPoint('point-ketua-1', { slug: 'baru' }, ACTOR, CONTEXT),
      400,
    );
    assert.equal(txCalls.length, 0);
  });

  it('allows a name-only PATCH on a legacy ketua_rt point covering two RTs (no invariant run)', async () => {
    // SPEC.md §7 decision: the write-path invariant only guards type/coverage writes, so a
    // legacy 2-RT ketua_rt point stays editable while its coverage rows are untouched.
    seedState([ketuaPoint()], [], { 'point-ketua-1': [5, 9] });
    const dto = await updateSpatialPoint(
      'point-ketua-1',
      { name: 'Pos RT 5 (ubah)' },
      ACTOR,
      CONTEXT,
    );

    assert.equal(dto.name, 'Pos RT 5 (ubah)');
    assert.deepEqual(dto.rts, [5, 9]);
    const metadata = auditRows[0]?.metadata as AnyRecord;
    assert.equal((metadata['changes'] as AnyRecord)['name'] !== undefined, true);
    // Coverage untouched: no coverage diff in the audit row (still snapshots the post set).
    assert.equal(metadata['coveragesAdded'], undefined);
    assert.equal(metadata['coveragesRemoved'], undefined);
    assert.deepEqual(metadata['coverages'], [5, 9]);
    assert.deepEqual(coveragesOf('point-ketua-1'), [5, 9]);
  });

  it('replaces RT coverages when rts is provided and audits the diff', async () => {
    seed();
    const dto = await updateSpatialPoint('point-ketua-1', { rts: [9] }, ACTOR, CONTEXT);

    assert.deepEqual(dto.rts, [9]);
    assert.equal(coveragesOf('point-ketua-1').join(','), '9');

    const metadata = auditRows[0]?.metadata as AnyRecord;
    assert.deepEqual(((metadata['changes'] as AnyRecord)['coverages'] as AnyRecord)['before'], [5]);
    assert.deepEqual(((metadata['changes'] as AnyRecord)['coverages'] as AnyRecord)['after'], [9]);
    assert.deepEqual(metadata['coveragesAdded'], [9]);
    assert.deepEqual(metadata['coveragesRemoved'], [5]);
  });

  it('rejects replacing coverage with two RTs on a ketua_rt point', async () => {
    seed();
    await assertServiceError(
      updateSpatialPoint('point-ketua-1', { rts: [3, 4] }, ACTOR, CONTEXT),
      400,
      'tepat satu RT',
    );
    assert.equal(auditRows.length, 0);
  });

  it('rejects rts replacement onto an RT another ketua_rt point already covers', async () => {
    seed();
    await assertServiceError(
      updateSpatialPoint('point-ketua-1', { rts: [7] }, ACTOR, CONTEXT),
      409,
      'sudah dicakup',
    );
    assert.equal(auditRows.length, 0);
  });

  it('rejects switching type to ketua_rt while the point still spans several RTs (no rts sent)', async () => {
    seed();
    await assertServiceError(
      updateSpatialPoint('point-bs-1', { type: 'ketua_rt' }, ACTOR, CONTEXT),
      400,
      'tepat satu RT',
    );
    assert.equal(auditRows.length, 0);
  });

  it('allows switching type from ketua_rt to bank_sampah keeping the existing coverage', async () => {
    seed();
    const dto = await updateSpatialPoint('point-ketua-1', { type: 'bank_sampah' }, ACTOR, CONTEXT);

    assert.equal(dto.type, 'bank_sampah');
    assert.deepEqual(dto.rts, [5]);
    assert.equal(auditRows[0]?.action, 'spatial_point.updated');
  });

  it('treats a no-change PATCH as a no-op: no update call, no audit row', async () => {
    seed();
    const dto = await updateSpatialPoint('point-ketua-1', { name: 'Pos RT 5' }, ACTOR, CONTEXT);

    assert.equal(dto.name, 'Pos RT 5');
    assert.equal(pointCalls['update'], undefined);
    assert.equal(auditRows.length, 0);
  });

  it('writes MySQL JsonNull (DbNull) when metadata is cleared to null', async () => {
    seed();
    await updateSpatialPoint('point-ketua-1', { metadata: null }, ACTOR, CONTEXT);

    const updateArgs = pointCalls['update']?.[0]?.[0] as AnyRecord | undefined;
    assert.ok(updateArgs);
    assert.equal((updateArgs['data'] as AnyRecord)['metadata'], Prisma.DbNull);
  });

  it('returns 404 for an unknown point id', async () => {
    seed();
    await assertServiceError(
      updateSpatialPoint('point-missing', { name: 'X' }, ACTOR, CONTEXT),
      404,
    );
  });
});

// ---------------------------------------------------------------------------
// deleteSpatialPoint
// ---------------------------------------------------------------------------

describe('maps.service deleteSpatialPoint', () => {
  it('deletes the point, cascades its coverages, and audits the before-state', async () => {
    seedState([ketuaPoint()], [sampleLeader()], { 'point-ketua-1': [5] });

    const dto = await deleteSpatialPoint('point-ketua-1', ACTOR, CONTEXT);

    assert.equal(dto.id, 'point-ketua-1');
    assert.deepEqual(dto.rts, [5]);
    assert.equal(points.size, 0);
    assert.equal(coverages.length, 0);

    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0]?.action, 'spatial_point.deleted');
    assert.deepEqual(
      ((auditRows[0]?.metadata as AnyRecord)['before'] as AnyRecord)['coverages'],
      [5],
    );
  });

  it('allows deleting a bank_sampah point with several RT coverages', async () => {
    seedState([bankSampahPoint()], [], { 'point-bs-1': [1, 2, 3] });

    const dto = await deleteSpatialPoint('point-bs-1', ACTOR, CONTEXT);

    assert.deepEqual(dto.rts, [1, 2, 3]);
    assert.equal(coverages.length, 0);
    assert.equal(auditRows[0]?.action, 'spatial_point.deleted');
  });

  it('returns 404 for an unknown point id', async () => {
    await assertServiceError(deleteSpatialPoint('point-missing', ACTOR, CONTEXT), 404);
  });
});

// ---------------------------------------------------------------------------
// createSpatialPointCoverage
// ---------------------------------------------------------------------------

describe('maps.service createSpatialPointCoverage', () => {
  it('rejects invalid bodies with 400 without opening a transaction', async () => {
    seedState([bankSampahPoint()]);
    await assertServiceError(
      createSpatialPointCoverage('point-bs-1', { rtNumber: 0 }, ACTOR, CONTEXT),
      400,
      'Nomor RT',
    );
    await assertServiceError(
      createSpatialPointCoverage('point-bs-1', { rtNumber: 101 }, ACTOR, CONTEXT),
      400,
    );
    await assertServiceError(
      createSpatialPointCoverage('point-bs-1', { rtNumber: '5' }, ACTOR, CONTEXT),
      400,
    );
    await assertServiceError(createSpatialPointCoverage('point-bs-1', {}, ACTOR, CONTEXT), 400);
    await assertServiceError(createSpatialPointCoverage('point-bs-1', 'x', ACTOR, CONTEXT), 400);
    assert.equal(txCalls.length, 0);
  });

  it('adds an RT coverage to a bank_sampah point and audits it', async () => {
    seedState([bankSampahPoint()], [], { 'point-bs-1': [1, 2, 3] });

    const coverage = await createSpatialPointCoverage(
      'point-bs-1',
      { rtNumber: 5 },
      ACTOR,
      CONTEXT,
    );

    assert.equal(typeof coverage.id, 'string');
    assert.equal(coverage.pointId, 'point-bs-1');
    assert.equal(coverage.rtNumber, 5);
    assert.deepEqual(coveragesOf('point-bs-1'), [1, 2, 3, 5]);

    assert.equal(auditRows[0]?.action, 'spatial_point_rt.created');
    assert.equal(auditRows[0]?.targetLabel, 'RT 5');
  });

  it('rejects a duplicate coverage on the same point with 409', async () => {
    seedState([bankSampahPoint()], [], { 'point-bs-1': [1, 2, 3] });

    await assertServiceError(
      createSpatialPointCoverage('point-bs-1', { rtNumber: 2 }, ACTOR, CONTEXT),
      409,
      'sudah terdaftar',
    );
    assert.equal(auditRows.length, 0);
  });

  it('rejects a second RT on a ketua_rt point that already covers exactly one', async () => {
    seedState([ketuaPoint()], [], { 'point-ketua-1': [5] });

    await assertServiceError(
      createSpatialPointCoverage('point-ketua-1', { rtNumber: 6 }, ACTOR, CONTEXT),
      400,
      'tepat satu RT',
    );
    assert.equal(auditRows.length, 0);
  });

  it('rejects claiming an RT owned by another ketua_rt point (legacy 0-coverage point)', async () => {
    seedState(
      [ketuaPoint({ id: 'point-legacy' }), ketuaPoint({ id: 'point-b-1', name: 'Pos RT 7' })],
      [],
      { 'point-b-1': [7] },
    );

    await assertServiceError(
      createSpatialPointCoverage('point-legacy', { rtNumber: 7 }, ACTOR, CONTEXT),
      409,
      'sudah dicakup',
    );
    assert.equal(auditRows.length, 0);
  });

  it('returns 404 for an unknown point id', async () => {
    await assertServiceError(
      createSpatialPointCoverage('point-missing', { rtNumber: 5 }, ACTOR, CONTEXT),
      404,
    );
  });
});

// ---------------------------------------------------------------------------
// deleteSpatialPointCoverage
// ---------------------------------------------------------------------------

describe('maps.service deleteSpatialPointCoverage', () => {
  it('removes one coverage from a bank_sampah point and audits it', async () => {
    seedState([bankSampahPoint()], [], { 'point-bs-1': [1, 2, 3] });

    const coverage = await deleteSpatialPointCoverage('point-bs-1', 2, ACTOR, CONTEXT);

    assert.equal(coverage.rtNumber, 2);
    assert.deepEqual(coveragesOf('point-bs-1'), [1, 3]);
    assert.equal(auditRows[0]?.action, 'spatial_point_rt.deleted');
    assert.equal(auditRows[0]?.targetLabel, 'RT 2');
  });

  it('rejects removing the only coverage of a ketua_rt point', async () => {
    seedState([ketuaPoint()], [], { 'point-ketua-1': [5] });

    await assertServiceError(
      deleteSpatialPointCoverage('point-ketua-1', 5, ACTOR, CONTEXT),
      400,
      'tepat satu RT',
    );
    assert.equal(auditRows.length, 0);
  });

  it('allows removing one of a legacy ketua_rt point\u0027s two coverages down to exactly one', async () => {
    seedState([ketuaPoint()], [], { 'point-ketua-1': [5, 9] });

    await deleteSpatialPointCoverage('point-ketua-1', 9, ACTOR, CONTEXT);

    assert.deepEqual(coveragesOf('point-ketua-1'), [5]);
    assert.equal(auditRows[0]?.action, 'spatial_point_rt.deleted');
  });

  it('returns 404 when the RT is not registered on the point', async () => {
    seedState([bankSampahPoint()], [], { 'point-bs-1': [1, 2, 3] });

    await assertServiceError(deleteSpatialPointCoverage('point-bs-1', 9, ACTOR, CONTEXT), 404);
  });

  it('returns 404 for an unknown point id', async () => {
    await assertServiceError(deleteSpatialPointCoverage('point-missing', 5, ACTOR, CONTEXT), 404);
  });
});

// ---------------------------------------------------------------------------
// updateRtLeader
// ---------------------------------------------------------------------------

describe('maps.service updateRtLeader', () => {
  it('rejects out-of-range rtNumber before opening a transaction', async () => {
    await assertServiceError(updateRtLeader(0, { name: 'X' }, ACTOR, CONTEXT), 400);
    await assertServiceError(updateRtLeader(101, { name: 'X' }, ACTOR, CONTEXT), 400);
    assert.equal(txCalls.length, 0);
  });

  it('rejects empty and unknown-field payloads with 400', async () => {
    await assertServiceError(updateRtLeader(5, {}, ACTOR, CONTEXT), 400);
    await assertServiceError(updateRtLeader(5, { jabatan: 'x' }, ACTOR, CONTEXT), 400);
    assert.equal(txCalls.length, 0);
  });

  it('updates name, phone and whatsapp flag, and audits the change', async () => {
    seedState([ketuaPoint()], [sampleLeader()], {});

    const leaderDto = await updateRtLeader(
      5,
      { name: 'Budi Santoso', phone: '081299900005', phoneIsWhatsapp: false },
      ACTOR,
      CONTEXT,
    );

    assert.equal(leaderDto.rtNumber, 5);
    assert.equal(leaderDto.name, 'Budi Santoso');
    assert.equal(leaderDto.phone, '081299900005');
    assert.equal(leaderDto.phoneIsWhatsapp, false);
    assert.equal(leaderDto.alamat, 'Jl. Mulawarman No. 5');

    assert.ok(leaderCalls['update'], 'leader row must be updated');
    assert.equal(auditRows[0]?.action, 'rt_leader.updated');
    assert.equal(auditRows[0]?.targetType, 'rt_leader');
    const metadata = auditRows[0]?.metadata as AnyRecord;
    assert.equal((metadata['changes'] as AnyRecord)['name'] !== undefined, true);
  });

  it('collapses a blank alamat to null', async () => {
    seedState([], [sampleLeader()], {});

    const leaderDto = await updateRtLeader(5, { alamat: '' }, ACTOR, CONTEXT);

    assert.equal(leaderDto.alamat, null);
    const metadata = auditRows[0]?.metadata as AnyRecord;
    assert.equal(((metadata['changes'] as AnyRecord)['alamat'] as AnyRecord)['after'], null);
  });

  it('treats an identical PATCH as a no-op: no update, no audit row', async () => {
    seedState([], [sampleLeader()], {});

    const leaderDto = await updateRtLeader(5, { name: 'Andi Pratama' }, ACTOR, CONTEXT);

    assert.equal(leaderDto.name, 'Andi Pratama');
    assert.equal(leaderCalls['update'], undefined);
    assert.equal(auditRows.length, 0);
  });

  it('returns 404 for an RT without an rt_leaders row', async () => {
    await assertServiceError(updateRtLeader(7, { name: 'X' }, ACTOR, CONTEXT), 404);
  });
});
