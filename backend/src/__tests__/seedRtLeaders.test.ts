import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { RT_LEADERS_DATA } from '../../prisma/rtLeadersData.js';
import { seedRtLeaders, type RtLeaderSeedClient } from '../../prisma/seedRtLeaders.js';

type UpsertCall = { where: unknown; update: unknown; create: unknown };

function recordingClient() {
  const calls: {
    rtLeader: UpsertCall[];
    spatialPoint: UpsertCall[];
    spatialPointRt: UpsertCall[];
    deleteSpatialPoint: unknown[];
    deleteSpatialPointRt: unknown[];
  } = {
    rtLeader: [],
    spatialPoint: [],
    spatialPointRt: [],
    deleteSpatialPoint: [],
    deleteSpatialPointRt: [],
  };

  const client: RtLeaderSeedClient = {
    rtLeader: {
      async upsert(args) {
        calls.rtLeader.push(args);
        return args;
      },
    },
    spatialPoint: {
      async upsert(args) {
        calls.spatialPoint.push(args);
        return args;
      },
      async deleteMany(args) {
        calls.deleteSpatialPoint.push(args);
        return { count: 0 };
      },
    },
    spatialPointRt: {
      async upsert(args) {
        calls.spatialPointRt.push(args);
        return args;
      },
      async deleteMany(args) {
        calls.deleteSpatialPointRt.push(args);
        return { count: 0 };
      },
    },
  };

  return { client, calls };
}

describe('seedRtLeaders', () => {
  it('never passes stored values in update, so a re-seed cannot revert editor corrections', async () => {
    const { client, calls } = recordingClient();

    await seedRtLeaders(client, RT_LEADERS_DATA);

    assert.equal(calls.rtLeader.length, RT_LEADERS_DATA.length);
    assert.equal(calls.spatialPoint.length, RT_LEADERS_DATA.length);
    assert.equal(calls.spatialPointRt.length, RT_LEADERS_DATA.length);

    for (const call of [...calls.rtLeader, ...calls.spatialPoint, ...calls.spatialPointRt]) {
      assert.deepEqual(
        call.update,
        {},
        'an upsert that carries field values in update would overwrite editor corrections',
      );
    }
  });

  it('creates one leader per RT with the source values', async () => {
    const { client, calls } = recordingClient();

    await seedRtLeaders(client, [
      {
        rtNumber: 7,
        name: 'Ketua RT 07',
        phone: '08120000007',
        phoneIsWhatsapp: true,
        alamat: 'Jl. Contoh RT 07, Manggar',
        latitude: -1.2,
        longitude: 116.9,
      },
    ]);

    assert.deepEqual(calls.rtLeader[0]?.where, { rtNumber: 7 });
    assert.deepEqual(calls.rtLeader[0]?.create, {
      rtNumber: 7,
      name: 'Ketua RT 07',
      phone: '08120000007',
      phoneIsWhatsapp: true,
      alamat: 'Jl. Contoh RT 07, Manggar',
    });
  });

  it('links each leader to exactly one spatial point and one junction row', async () => {
    const { client, calls } = recordingClient();

    await seedRtLeaders(client, RT_LEADERS_DATA);

    const pointIds = new Set(calls.spatialPoint.map((call) => (call.where as { id: string }).id));
    assert.equal(pointIds.size, RT_LEADERS_DATA.length);

    for (const call of calls.spatialPointRt) {
      const where = call.where as { pointId_rtNumber: { pointId: string; rtNumber: number } };
      assert.ok(pointIds.has(where.pointId_rtNumber.pointId));
      assert.equal((call.create as { rtNumber: number }).rtNumber, where.pointId_rtNumber.rtNumber);
    }
  });

  it('returns the number of RTs processed', async () => {
    const { client } = recordingClient();
    assert.equal(await seedRtLeaders(client, RT_LEADERS_DATA), RT_LEADERS_DATA.length);
  });

  it('cleans up legacy sample ketua_rt points matching legacy prefix to prevent duplicate RT points', async () => {
    const { client, calls } = recordingClient();
    await seedRtLeaders(client, RT_LEADERS_DATA);

    assert.equal(calls.deleteSpatialPointRt.length, 1);
    assert.deepEqual(calls.deleteSpatialPointRt[0], {
      where: {
        point: {
          type: 'ketua_rt',
          id: { startsWith: '00000000-0000-0000-0000-' },
        },
      },
    });

    assert.equal(calls.deleteSpatialPoint.length, 1);
    assert.deepEqual(calls.deleteSpatialPoint[0], {
      where: {
        type: 'ketua_rt',
        id: { startsWith: '00000000-0000-0000-0000-' },
      },
    });
  });
});

describe('RT_LEADERS_DATA', () => {
  it('carries one placeholder record per RT and no personal data', () => {
    assert.equal(RT_LEADERS_DATA.length, 100);

    const rtNumbers = RT_LEADERS_DATA.map((rt) => rt.rtNumber);
    assert.deepEqual(
      rtNumbers,
      Array.from({ length: 100 }, (_, index) => index + 1),
      'RT numbers must cover 1..100 exactly once',
    );

    for (const rt of RT_LEADERS_DATA) {
      // Placeholder names only — never a real person's name.
      assert.match(rt.name, /^Ketua RT \d{2,3}$/);
      // A non-dialable marker, not a number: a fabricated number would render as a
      // working WhatsApp or telephone link on the Ketua RT page.
      assert.equal(rt.phone, '—');
      assert.equal(rt.phoneIsWhatsapp, false);
      assert.ok(rt.latitude < 0 && rt.latitude > -2);
      assert.ok(rt.longitude > 116 && rt.longitude < 117);
    }
  });
});
