import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { RT_LEADERS_DATA } from '../data/rtLeadersData.js';
import {
  seedRtLeaders,
  seededKetuaRtPointId,
  type RtLeaderSeedClient,
} from '../../prisma/seedRtLeaders.js';
import { LEGACY_SAMPLE_LEADERS, phoneSha256 } from '../utils/legacySampleRtFingerprints.js';

type UpsertCall = { where: unknown; update: unknown; create: unknown };

function nestedCoverageCreates(call: UpsertCall): Array<{ pointId: string; rtNumber: number }> {
  const create = call.create as {
    id?: string;
    rtCoverages?: { create?: Array<{ rtNumber: number }> };
  };
  const pointId = typeof create.id === 'string' ? create.id : '';
  const rows = create.rtCoverages?.create ?? [];
  return rows.map((row) => ({ pointId, rtNumber: row.rtNumber }));
}

function recordingClient(existingPointIds: Set<string> = new Set()) {
  const calls: {
    rtLeader: UpsertCall[];
    spatialPoint: UpsertCall[];
    spatialPointFind: string[];
  } = {
    rtLeader: [],
    spatialPoint: [],
    spatialPointFind: [],
  };

  const client: RtLeaderSeedClient = {
    rtLeader: {
      async upsert(args) {
        calls.rtLeader.push(args);
        return args;
      },
    },
    spatialPoint: {
      async findUnique(args) {
        calls.spatialPointFind.push(args.where.id);
        return existingPointIds.has(args.where.id) ? { id: args.where.id } : null;
      },
      async upsert(args) {
        calls.spatialPoint.push(args);
        return args;
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
    const coverageCreates = calls.spatialPoint.flatMap(nestedCoverageCreates);
    assert.equal(coverageCreates.length, RT_LEADERS_DATA.length);

    for (const call of [...calls.rtLeader, ...calls.spatialPoint]) {
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

    const coverageCreates = calls.spatialPoint.flatMap(nestedCoverageCreates);
    assert.equal(coverageCreates.length, RT_LEADERS_DATA.length);
    for (const created of coverageCreates) {
      assert.ok(pointIds.has(created.pointId));
    }
  });

  it('does not recreate RT coverage when the spatial point already exists', async () => {
    const existingId = '00000000-0000-0000-0001-000000000007';
    const { client, calls } = recordingClient(new Set([existingId]));

    await seedRtLeaders(client, [
      {
        rtNumber: 7,
        name: 'Ketua RT 07',
        phone: '—',
        phoneIsWhatsapp: false,
        alamat: null,
        latitude: -1.2,
        longitude: 116.9,
      },
    ]);

    assert.equal(calls.spatialPoint.length, 1);
    assert.equal(nestedCoverageCreates(calls.spatialPoint[0]!).length, 0);
  });

  it('skips recreating a tombstoned seeded point and its coverage', async () => {
    const pointId = seededKetuaRtPointId(7);
    const { client, calls } = recordingClient();

    await seedRtLeaders(
      client,
      [
        {
          rtNumber: 7,
          name: 'Ketua RT 07',
          phone: '—',
          phoneIsWhatsapp: false,
          alamat: null,
          latitude: -1.2,
          longitude: 116.9,
        },
      ],
      { skippedPointIds: new Set([pointId]) },
    );

    assert.equal(calls.rtLeader.length, 1, 'leader row is still filled if missing');
    assert.equal(calls.spatialPoint.length, 0, 'tombstoned point must not be recreated');
  });

  it('still seeds points when the tombstone set is empty', async () => {
    const { client, calls } = recordingClient();
    await seedRtLeaders(
      client,
      [
        {
          rtNumber: 7,
          name: 'Ketua RT 07',
          phone: '—',
          phoneIsWhatsapp: false,
          alamat: null,
          latitude: -1.2,
          longitude: 116.9,
        },
      ],
      { skippedPointIds: new Set() },
    );
    assert.equal(calls.spatialPoint.length, 1);
    assert.equal(nestedCoverageCreates(calls.spatialPoint[0]!).length, 1);
  });

  it('returns the number of RTs processed', async () => {
    const { client } = recordingClient();
    assert.equal(await seedRtLeaders(client, RT_LEADERS_DATA), RT_LEADERS_DATA.length);
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

  it('never seeds the legacy sample phones (recognition fingerprints only)', async () => {
    // Fingerprints live in legacySampleRtFingerprints.ts (sha256 digests). A create
    // payload must never hash to one of those digests or reuse a fingerprint name.
    const legacyPhoneDigests = new Set(
      Object.values(LEGACY_SAMPLE_LEADERS).map((entry) => entry.phoneSha256),
    );
    const legacyNames = new Set(Object.values(LEGACY_SAMPLE_LEADERS).map((entry) => entry.name));

    for (const rt of RT_LEADERS_DATA) {
      assert.equal(
        legacyPhoneDigests.has(phoneSha256(rt.phone)),
        false,
        `RT ${rt.rtNumber} must not use a legacy phone`,
      );
      assert.equal(legacyNames.has(rt.name), false, `RT ${rt.rtNumber} must not use a legacy name`);
    }

    const { client, calls } = recordingClient();
    await seedRtLeaders(client, RT_LEADERS_DATA);

    for (const call of calls.rtLeader) {
      const create = call.create as { phone?: string; name?: string };
      assert.equal(
        legacyPhoneDigests.has(phoneSha256(create.phone ?? '')),
        false,
        'seedRtLeaders must never write a legacy fingerprint phone',
      );
      assert.equal(
        legacyNames.has(create.name ?? ''),
        false,
        'seedRtLeaders must never write a legacy fingerprint name',
      );
    }
  });
});
