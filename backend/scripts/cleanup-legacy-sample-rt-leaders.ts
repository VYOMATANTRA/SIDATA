/**
 * One-off maintenance script to clean up legacy development sample data for RT leaders
 * and their spatial points.
 *
 * Replaces leftover development sample leaders (RT 01-03) with placeholder sample
 * data when they still match the recognition fingerprints, and removes the legacy
 * sample spatial point (`00000000-0000-0000-0000-000000000001`) to eliminate
 * integrity conflicts.
 *
 * Usage:
 *   npx tsx scripts/cleanup-legacy-sample-rt-leaders.ts
 *   npx tsx scripts/cleanup-legacy-sample-rt-leaders.ts --force   # required in production
 */
import prisma from '../src/utils/prisma.js';
import { recordAuditLog, AUDIT_ACTIONS } from '../src/services/audit.service.js';
import {
  LEGACY_SAMPLE_LEADERS,
  LEGACY_SAMPLE_POINT_ID,
  matchesLegacySampleLeader,
} from '../src/utils/legacySampleRtFingerprints.js';

export type LegacySampleCleanupResult = {
  deletedJunctions: number;
  deletedPoints: number;
  updatedLeaders: number;
};

type CleanupTx = {
  spatialPoint: {
    findUnique: (args: { where: { id: string } }) => Promise<{
      id: string;
      type: string;
      name: string;
      latitude: number;
      longitude: number;
    } | null>;
    deleteMany: (args: { where: { id: string } }) => Promise<{ count: number }>;
  };
  spatialPointRt: {
    deleteMany: (args: { where: { pointId: string } }) => Promise<{ count: number }>;
  };
  rtLeader: {
    findUnique: (args: {
      where: { rtNumber: number };
    }) => Promise<{ name: string; phone: string } | null>;
    update: (args: {
      where: { rtNumber: number };
      data: {
        name: string;
        phone: string;
        phoneIsWhatsapp: boolean;
        alamat: null;
      };
    }) => Promise<unknown>;
  };
};

/**
 * Core cleanup body — extracted so unit tests can drive it with a fake transaction
 * client without opening a real database connection.
 */
export async function runLegacySampleRtCleanup(tx: CleanupTx): Promise<LegacySampleCleanupResult> {
  const legacyPoint = await tx.spatialPoint.findUnique({
    where: { id: LEGACY_SAMPLE_POINT_ID },
  });

  let deletedJunctionsCount = 0;
  let deletedPointsCount = 0;

  if (
    legacyPoint &&
    legacyPoint.type === 'ketua_rt' &&
    legacyPoint.name.includes('Pos RT 01') &&
    legacyPoint.latitude === -1.2235 &&
    legacyPoint.longitude === 116.9521
  ) {
    const deletedJunctions = await tx.spatialPointRt.deleteMany({
      where: { pointId: LEGACY_SAMPLE_POINT_ID },
    });
    deletedJunctionsCount = deletedJunctions.count;

    const deletedPoints = await tx.spatialPoint.deleteMany({
      where: { id: LEGACY_SAMPLE_POINT_ID },
    });
    deletedPointsCount = deletedPoints.count;
  }

  let updatedLeaders = 0;
  for (const [rtNumStr, expected] of Object.entries(LEGACY_SAMPLE_LEADERS)) {
    const rtNumber = Number(rtNumStr);
    const existing = await tx.rtLeader.findUnique({
      where: { rtNumber },
    });

    if (existing && matchesLegacySampleLeader(existing, expected)) {
      await tx.rtLeader.update({
        where: { rtNumber },
        data: {
          name: `Ketua RT ${String(rtNumber).padStart(2, '0')}`,
          phone: '—',
          phoneIsWhatsapp: false,
          alamat: null,
        },
      });
      updatedLeaders++;
    }
  }

  return {
    deletedJunctions: deletedJunctionsCount,
    deletedPoints: deletedPointsCount,
    updatedLeaders,
  };
}

export type CleanupAuditDeps = {
  recordAudit?: typeof recordAuditLog;
  log?: (line: string) => void;
  now?: () => Date;
};

/**
 * Structured audit trail for a successful `--force` run. Counts and timestamp only —
 * never names or phone numbers.
 */
export async function recordLegacySampleCleanupAudit(
  result: LegacySampleCleanupResult,
  opts: { force: boolean; nodeEnv: string | undefined },
  deps: CleanupAuditDeps = {},
): Promise<void> {
  const at = (deps.now ?? (() => new Date()))().toISOString();
  const payload = {
    event: 'maintenance.legacy_rt_cleanup',
    at,
    force: opts.force,
    nodeEnv: opts.nodeEnv ?? null,
    deletedJunctions: result.deletedJunctions,
    deletedPoints: result.deletedPoints,
    updatedLeaders: result.updatedLeaders,
  };
  (deps.log ?? console.log)(JSON.stringify(payload));

  if (!opts.force) return;

  const record = deps.recordAudit ?? recordAuditLog;
  await record({
    action: AUDIT_ACTIONS.MAINTENANCE_LEGACY_RT_CLEANUP,
    outcome: 'success',
    actor: {
      id: null,
      email: 'script:cleanup-legacy-sample-rt-leaders',
      role: 'system',
    },
    target: {
      type: 'rt_leader',
      id: null,
      label: 'legacy-sample-cleanup',
    },
    metadata: {
      deletedJunctions: result.deletedJunctions,
      deletedPoints: result.deletedPoints,
      updatedLeaders: result.updatedLeaders,
      force: true,
      at,
      nodeEnv: opts.nodeEnv ?? null,
    },
  });
}

async function main() {
  const force = process.argv.includes('--force');
  if (process.env.NODE_ENV === 'production' && !force) {
    throw new Error('Refusing to run legacy sample cleanup on production without --force flag.');
  }

  console.log('Memulai pembersihan data sample RT lawas...');

  const results = await prisma.$transaction(async (tx) => runLegacySampleRtCleanup(tx));

  console.log('Pembersihan selesai:');
  console.log(results);

  await recordLegacySampleCleanupAudit(results, {
    force,
    nodeEnv: process.env.NODE_ENV,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((e) => {
      console.error('Error saat pembersihan data sample RT:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
