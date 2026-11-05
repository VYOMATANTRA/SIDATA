import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseRtLeadersCsv, RT_LEADERS_CSV_HEADER } from '../utils/rtLeadersCsv.js';

const header = RT_LEADERS_CSV_HEADER.join(',');

describe('parseRtLeadersCsv', () => {
  it('parses a valid row and preserves leading zeroes as text', () => {
    const result = parseRtLeadersCsv(
      `${header}\n7,Contoh Nama,08123456789,true,Jl. Mulawarman 7,-1.2,116.9`,
    );
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.rows[0], {
      rowNumber: 2,
      rtNumber: 7,
      name: 'Contoh Nama',
      phone: '08123456789',
      phoneIsWhatsapp: true,
      alamat: 'Jl. Mulawarman 7',
      latitude: -1.2,
      longitude: 116.9,
    });
  });

  it('supports quoted commas and escaped quotes', () => {
    const result = parseRtLeadersCsv(`${header}\n1,"Nama, ""Lengkap""",0812,false,"Jl. A, RT 1",,`);
    assert.equal(result.rows[0]?.name, 'Nama, "Lengkap"');
    assert.equal(result.rows[0]?.alamat, 'Jl. A, RT 1');
  });

  it('treats blank optional cells as preserve-existing', () => {
    const result = parseRtLeadersCsv(`${header}\n3,,,,,,`);
    assert.deepEqual(result.rows[0], { rowNumber: 2, rtNumber: 3 });
  });

  it('rejects bad headers, duplicates, invalid RTs, and half coordinates', () => {
    const badHeader = parseRtLeadersCsv('rt,name\n1,A');
    assert.equal(badHeader.errors[0]?.field, 'header');

    const result = parseRtLeadersCsv(`${header}\n0,A,,,,,\n1,A,,,,,\n1,B,,,,,\n2,C,,,,-1.2,`);
    assert.equal(result.errors.filter((error) => error.field === 'rtNumber').length, 2);
    assert.equal(
      result.errors.some((error) => error.field === 'coordinates'),
      true,
    );
  });

  it('rejects out-of-range coordinates', () => {
    const result = parseRtLeadersCsv(`${header}\n1,A,,,,91,116`);
    assert.equal(
      result.errors.some((error) => error.field === 'latitude'),
      true,
    );
  });
});

describe('previewRtLeadersImport and importRtLeadersCsv coordinate handling', () => {
  const actor = { id: 'admin-1', email: 'admin@example.com', role: 'admin' };
  const reqContext = { ipAddress: '127.0.0.1', userAgent: 'test-agent' };

  function createMockClient() {
    const leaders = new Map<number, any>([
      [1, { rtNumber: 1, name: 'Ketua 1', phone: '081234', phoneIsWhatsapp: true, alamat: 'Jl 1' }],
      [2, { rtNumber: 2, name: 'Ketua 2', phone: '', phoneIsWhatsapp: false, alamat: null }],
    ]);
    const points = new Map<string, any>([
      [
        'p-1',
        { id: 'p-1', name: 'Pos RT 01', type: 'ketua_rt', latitude: -1.25, longitude: 116.95 },
      ],
      [
        'p-bs',
        {
          id: 'p-bs',
          name: 'Bank Sampah',
          type: 'bank_sampah',
          latitude: -1.26,
          longitude: 116.96,
        },
      ],
    ]);
    const coverages: Array<{ pointId: string; rtNumber: number }> = [
      { pointId: 'p-1', rtNumber: 1 },
      { pointId: 'p-bs', rtNumber: 1 },
    ];
    const auditLogs: any[] = [];

    const mockClient = {
      rtLeader: {
        findMany: async () => Array.from(leaders.values()),
        update: async ({ where, data }: any) => {
          const item = leaders.get(where.rtNumber);
          Object.assign(item, data);
          return item;
        },
      },
      spatialPoint: {
        findMany: async () => Array.from(points.values()),
        create: async ({ data }: any) => {
          const id = `p-${Date.now()}`;
          const item = { id, ...data };
          points.set(id, item);
          if (data.rtCoverages?.create) {
            for (const cov of data.rtCoverages.create) {
              coverages.push({ pointId: id, rtNumber: cov.rtNumber });
            }
          }
          return item;
        },
        update: async ({ where, data }: any) => {
          const item = points.get(where.id);
          Object.assign(item, data);
          return item;
        },
      },
      spatialPointRt: {
        findMany: async () => [...coverages],
      },
      auditLog: {
        create: async ({ data }: any) => {
          auditLogs.push(data);
          return data;
        },
      },
      $transaction: async (fn: any) => fn(mockClient),
      $queryRaw: async () => [],
      $executeRaw: async () => 1,
    };

    return { client: mockClient as any, leaders, points, coverages, auditLogs };
  }

  it('recognizes identical coordinates and equivalent decimal spelling as unchanged', async () => {
    const { client } = createMockClient();
    const { previewRtLeadersImport } = await import('../services/maps.service.js');

    // RT 1 already has latitude -1.25 and longitude 116.95
    const csv = `${header}\n1,Ketua 1,081234,true,Jl 1,-1.2500,116.9500`;
    const preview = await previewRtLeadersImport(csv, client);

    assert.equal(preview.errors.length, 0);
    assert.equal(preview.summary.changed, 0);
    assert.equal(preview.summary.unchanged, 1);
    assert.equal(preview.rows[0]?.action, 'unchanged');
    assert.deepEqual(preview.rows[0]?.changedFields, []);
  });

  it('marks latitude or longitude change as coordinates changed', async () => {
    const { client } = createMockClient();
    const { previewRtLeadersImport } = await import('../services/maps.service.js');

    const csv = `${header}\n1,Ketua 1,081234,true,Jl 1,-1.2501,116.95`;
    const preview = await previewRtLeadersImport(csv, client);

    assert.equal(preview.errors.length, 0);
    assert.equal(preview.summary.changed, 1);
    assert.equal(preview.rows[0]?.action, 'update');
    assert.deepEqual(preview.rows[0]?.changedFields, ['coordinates']);
  });

  it('does not treat omitted blank coordinates as a location change', async () => {
    const { client } = createMockClient();
    const { previewRtLeadersImport } = await import('../services/maps.service.js');

    const csv = `${header}\n1,Ketua 1 Baru,081234,true,Jl 1,,`;
    const preview = await previewRtLeadersImport(csv, client);

    assert.equal(preview.errors.length, 0);
    assert.equal(preview.summary.changed, 1);
    assert.deepEqual(preview.rows[0]?.changedFields, ['name']);
  });

  it('creates single point for RT without an existing ketua_rt point and ignores bank_sampah point', async () => {
    const { client } = createMockClient();
    const { previewRtLeadersImport } = await import('../services/maps.service.js');

    // RT 2 has no point
    const csv = `${header}\n2,Ketua 2,089999,false,Jl 2,-1.22,116.99`;
    const preview = await previewRtLeadersImport(csv, client);

    assert.equal(preview.errors.length, 0);
    assert.equal(preview.summary.changed, 1);
    assert.deepEqual(preview.rows[0]?.changedFields, ['phone', 'alamat', 'coordinates']);
  });

  it('importing identical data twice performs no-op and creates no audit log on the second run', async () => {
    const { client, auditLogs } = createMockClient();
    const { importRtLeadersCsv } = await import('../services/maps.service.js');

    const csv = `${header}\n1,Ketua 1 Diperbarui,081234567,true,Jl 1 Baru,-1.255,116.955`;

    const firstRun = await importRtLeadersCsv(csv, actor, reqContext, client);
    assert.equal(firstRun.summary.changed, 1);
    assert.equal(auditLogs.length, 1);

    const secondRun = await importRtLeadersCsv(csv, actor, reqContext, client);
    assert.equal(secondRun.summary.changed, 0);
    assert.equal(secondRun.summary.unchanged, 1);
    assert.equal(auditLogs.length, 1, 'No second audit log should be emitted on no-op import');
  });
});
