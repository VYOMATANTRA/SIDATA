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

  it('supports multi-line quoted addresses without breaking into multiple rows', () => {
    const result = parseRtLeadersCsv(
      `${header}\n1,Nama Ketua,0812,false,"Jl. Mulawarman No. 1\nRT 01 Kel. Manggar\nKec. Balikpapan Timur",-1.2,116.9`,
    );
    assert.equal(result.errors.length, 0);
    assert.equal(result.rows.length, 1);
    assert.equal(
      result.rows[0]?.alamat,
      'Jl. Mulawarman No. 1\nRT 01 Kel. Manggar\nKec. Balikpapan Timur',
    );
  });

  it('supports explicit clear token \\N for phone and address', () => {
    const result = parseRtLeadersCsv(`${header}\n1,Nama,\\N,true,\\N,,`);
    assert.equal(result.errors.length, 0);
    assert.equal(result.rows[0]?.phone, '');
    assert.equal(result.rows[0]?.alamat, null);
    assert.equal(result.rows[0]?.phoneIsWhatsapp, false);
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

  it('ignores WhatsApp true for an unchanged empty phone in preview and apply', async () => {
    const { client, leaders, auditLogs } = createMockClient();
    const { previewRtLeadersImport, importRtLeadersCsv } =
      await import('../services/maps.service.js');
    const csv = `${header}\n2,Ketua 2,,true,,,`;

    const preview = await previewRtLeadersImport(csv, client);
    assert.deepEqual(preview.rows[0]?.changedFields, []);
    assert.equal(preview.summary.unchanged, 1);
    const result = await importRtLeadersCsv(csv, actor, reqContext, client);
    assert.equal(result.summary.unchanged, 1);
    assert.equal(leaders.get(2).phone, '');
    assert.equal(leaders.get(2).phoneIsWhatsapp, false);
    assert.equal(auditLogs.length, 0);
  });

  it('uses the resulting phone when previewing and applying WhatsApp changes', async () => {
    const { client, leaders } = createMockClient();
    const { previewRtLeadersImport, importRtLeadersCsv } =
      await import('../services/maps.service.js');
    const csv = `${header}\n2,Ketua 2,081222,true,,,`;
    const preview = await previewRtLeadersImport(csv, client);
    assert.deepEqual(preview.rows[0]?.changedFields, ['phone', 'phoneIsWhatsapp']);
    const result = await importRtLeadersCsv(csv, actor, reqContext, client);
    assert.deepEqual(result.rows[0]?.changedFields, preview.rows[0]?.changedFields);
    assert.equal(leaders.get(2).phone, '081222');
    assert.equal(leaders.get(2).phoneIsWhatsapp, true);
  });

  it('does not enable WhatsApp on an empty phone when another field changes', async () => {
    const { client, leaders } = createMockClient();
    const { previewRtLeadersImport, importRtLeadersCsv } =
      await import('../services/maps.service.js');
    const csv = `${header}\n2,Updated Name,,true,,,`;
    const preview = await previewRtLeadersImport(csv, client);
    assert.deepEqual(preview.rows[0]?.changedFields, ['name']);
    const result = await importRtLeadersCsv(csv, actor, reqContext, client);
    assert.deepEqual(result.rows[0]?.changedFields, preview.rows[0]?.changedFields);
    assert.equal(leaders.get(2).name, 'Updated Name');
    assert.equal(leaders.get(2).phoneIsWhatsapp, false);
  });

  it('clears WhatsApp when the phone is explicitly cleared', async () => {
    const { client, leaders } = createMockClient();
    const { previewRtLeadersImport, importRtLeadersCsv } =
      await import('../services/maps.service.js');
    const csv = `${header}\n1,Ketua 1,\\N,true,,,`;
    const preview = await previewRtLeadersImport(csv, client);
    assert.deepEqual(preview.rows[0]?.changedFields, ['phone', 'phoneIsWhatsapp']);
    const result = await importRtLeadersCsv(csv, actor, reqContext, client);
    assert.deepEqual(result.rows[0]?.changedFields, preview.rows[0]?.changedFields);
    assert.equal(leaders.get(1).phone, '');
    assert.equal(leaders.get(1).phoneIsWhatsapp, false);
  });

  it('preserves an existing phone and applies a requested WhatsApp change', async () => {
    const { client, leaders } = createMockClient();
    const { previewRtLeadersImport, importRtLeadersCsv } =
      await import('../services/maps.service.js');
    const csv = `${header}\n1,Ketua 1,,false,,,`;
    const preview = await previewRtLeadersImport(csv, client);
    assert.deepEqual(preview.rows[0]?.changedFields, ['phoneIsWhatsapp']);
    await importRtLeadersCsv(csv, actor, reqContext, client);
    assert.equal(leaders.get(1).phone, '081234');
    assert.equal(leaders.get(1).phoneIsWhatsapp, false);
  });

  it('repairs a legacy empty-phone WhatsApp flag when that flag is supplied', async () => {
    const { client, leaders } = createMockClient();
    leaders.get(2).phoneIsWhatsapp = true;
    const { previewRtLeadersImport, importRtLeadersCsv } =
      await import('../services/maps.service.js');
    const csv = `${header}\n2,Ketua 2,,true,,,`;
    const preview = await previewRtLeadersImport(csv, client);
    assert.deepEqual(preview.rows[0]?.changedFields, ['phoneIsWhatsapp']);
    const result = await importRtLeadersCsv(csv, actor, reqContext, client);
    assert.deepEqual(result.rows[0]?.changedFields, preview.rows[0]?.changedFields);
    assert.equal(leaders.get(2).phoneIsWhatsapp, false);
  });

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

  it('rejects coordinates update for RT whose ketua_rt point covers multiple RTs', async () => {
    const { client, coverages } = createMockClient();
    const { previewRtLeadersImport } = await import('../services/maps.service.js');

    // Make p-1 cover both RT 1 and RT 2
    coverages.push({ pointId: 'p-1', rtNumber: 2 });

    const csv = `${header}\n1,Ketua 1,081234,true,Jl 1,-1.22,116.99`;
    const preview = await previewRtLeadersImport(csv, client);

    assert.equal(preview.errors.length, 1);
    assert.equal(preview.errors[0]?.field, 'coordinates');
    assert.match(preview.errors[0]?.message ?? '', /mencakup 2 RT/);
  });

  it('writes spatial_point audit log when coordinates are updated during import', async () => {
    const { client, auditLogs } = createMockClient();
    const { importRtLeadersCsv } = await import('../services/maps.service.js');

    const csv = `${header}\n1,Ketua 1,081234,true,Jl 1,-1.299,116.999`;
    await importRtLeadersCsv(csv, actor, reqContext, client);

    const pointAudit = auditLogs.find((log) => log.targetType === 'spatial_point');
    assert.ok(pointAudit, 'Spatial point audit log must be emitted when coordinates change');
    assert.equal(pointAudit.metadata?.via, 'csv-import');
  });

  it('importing identical data twice performs no-op and creates no audit log on the second run', async () => {
    const { client, auditLogs } = createMockClient();
    const { importRtLeadersCsv } = await import('../services/maps.service.js');

    const csv = `${header}\n1,Ketua 1 Diperbarui,081234567,true,Jl 1 Baru,-1.255,116.955`;

    const firstRun = await importRtLeadersCsv(csv, actor, reqContext, client);
    assert.equal(firstRun.summary.changed, 1);
    const logsAfterFirst = auditLogs.length;
    assert.ok(logsAfterFirst >= 1);

    const secondRun = await importRtLeadersCsv(csv, actor, reqContext, client);
    assert.equal(secondRun.summary.changed, 0);
    assert.equal(secondRun.summary.unchanged, 1);
    assert.equal(
      auditLogs.length,
      logsAfterFirst,
      'No second audit log should be emitted on no-op import',
    );
  });
});
