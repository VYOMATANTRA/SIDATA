import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { after, beforeEach, describe, it } from 'node:test';
import prisma from '../../src/utils/prisma.js';
import { disconnectResetClient, resetDatabase } from './helpers/db.js';

const backendRoot = fileURLToPath(new URL('../../', import.meta.url));

interface SeedCase {
  name: string;
  nodeEnv: string | null;
  seedSampleData: string | null;
  expectSample: boolean;
}

const cases: SeedCase[] = [
  { name: 'no NODE_ENV at all', nodeEnv: null, seedSampleData: null, expectSample: false },
  { name: 'NODE_ENV=production', nodeEnv: 'production', seedSampleData: null, expectSample: false },
  { name: 'NODE_ENV=test', nodeEnv: 'test', seedSampleData: null, expectSample: false },
  {
    name: 'NODE_ENV=development',
    nodeEnv: 'development',
    seedSampleData: null,
    expectSample: true,
  },
  {
    name: 'NODE_ENV=development with SEED_SAMPLE_DATA=false',
    nodeEnv: 'development',
    seedSampleData: 'false',
    expectSample: false,
  },
  {
    name: 'SEED_SAMPLE_DATA=true',
    nodeEnv: null,
    seedSampleData: 'true',
    expectSample: true,
  },
];

function runSeed(testCase: SeedCase): void {
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.NODE_ENV;
  delete env.SEED_SAMPLE_DATA;
  if (testCase.nodeEnv !== null) env.NODE_ENV = testCase.nodeEnv;
  if (testCase.seedSampleData !== null) env.SEED_SAMPLE_DATA = testCase.seedSampleData;

  const result = spawnSync('npx', ['tsx', 'prisma/seed.ts'], {
    cwd: backendRoot,
    env,
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.equal(
    result.status,
    0,
    `seed failed for "${testCase.name}":\n${result.stdout}\n${result.stderr}`,
  );
}

describe('seed mode selection against real MySQL', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  after(async () => {
    await resetDatabase();
    await disconnectResetClient();
    await prisma.$disconnect();
  });

  for (const testCase of cases) {
    it(`seeds the expected roster with ${testCase.name}`, async () => {
      runSeed(testCase);

      const leaders = await prisma.rtLeader.findMany({ orderBy: { rtNumber: 'asc' } });
      assert.equal(leaders.length, 100, 'every mode must create all 100 editable RT slots');

      const sampleFlag = await prisma.systemSetting.findUnique({
        where: { key: 'maps.rt_leaders_sample_roster' },
      });

      if (testCase.expectSample) {
        assert.equal(sampleFlag?.value, 'true');
        assert.ok(
          leaders.some((leader) => leader.name.trim() !== ''),
          'sample mode must seed named leaders',
        );
        assert.ok(
          await prisma.spatialPoint.count({ where: { type: 'ketua_rt' } }),
          'sample mode must seed ketua_rt points',
        );
      } else {
        assert.equal(sampleFlag?.value, 'false');
        assert.ok(
          leaders.every(
            (leader) =>
              leader.name === '' &&
              leader.phone === '' &&
              leader.phoneIsWhatsapp === false &&
              leader.alamat === null,
          ),
          'safe mode must not invent names, contacts, or addresses',
        );
        assert.equal(
          await prisma.spatialPoint.count({ where: { type: 'ketua_rt' } }),
          0,
          'safe mode must not seed ketua_rt points',
        );
      }
    });
  }

  it('removes recognized legacy sample rows even in safe mode', async () => {
    const { LEGACY_SAMPLE_POINT_ID } =
      await import('../../src/utils/legacySampleRtFingerprints.js');
    await prisma.spatialPoint.create({
      data: {
        id: LEGACY_SAMPLE_POINT_ID,
        name: 'Pos RT 01 Manggar',
        type: 'ketua_rt',
        latitude: -1.2235,
        longitude: 116.9521,
      },
    });

    runSeed({
      name: 'safe mode cleanup',
      nodeEnv: null,
      seedSampleData: null,
      expectSample: false,
    });

    assert.equal(await prisma.spatialPoint.count({ where: { id: LEGACY_SAMPLE_POINT_ID } }), 0);
    assert.ok(
      (await prisma.auditLog.count({ where: { action: 'spatial_point.deleted' } })) >= 1,
      'the cleanup deletion must still be audited in safe mode',
    );
  });
});
