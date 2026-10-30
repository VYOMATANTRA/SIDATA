/**
 * One-off maintenance script to clean up legacy development sample data for RT leaders
 * and their spatial points.
 *
 * Replaces the initial 3 sample fixture leaders (RT 01-03: Bambang Supriyanto,
 * Hj. Siti Aminah, Ahmad Dahlan) with placeholder sample data if they still carry
 * the old development seed values, and removes the legacy sample spatial point
 * (`00000000-0000-0000-0000-000000000001`) to eliminate integrity conflicts.
 *
 * Usage:
 *   npx tsx scripts/cleanup-legacy-sample-rt-leaders.ts
 */
import prisma from '../src/utils/prisma.js';

const LEGACY_SAMPLE_LEADERS: Record<number, { name: string; phone: string }> = {
  1: { name: 'Bambang Supriyanto', phone: '081234567801' },
  2: { name: 'Hj. Siti Aminah', phone: '081234567802' },
  3: { name: 'Ahmad Dahlan', phone: '081234567803' },
};

const LEGACY_SAMPLE_POINT_ID = '00000000-0000-0000-0000-000000000001';

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    throw new Error('Refusing to run legacy sample cleanup on production without --force flag.');
  }

  console.log('Memulai pembersihan data sample RT lawas...');

  const results = await prisma.$transaction(async (tx) => {
    // 1. Delete legacy sample spatial point 1 and its RT junction row, only if it still matches the legacy sample fingerprint
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

    // 2. Clean up legacy fixture leaders if they still match the sample fingerprint (name and phone)
    let updatedLeaders = 0;
    for (const [rtNumStr, expected] of Object.entries(LEGACY_SAMPLE_LEADERS)) {
      const rtNumber = Number(rtNumStr);
      const existing = await tx.rtLeader.findUnique({
        where: { rtNumber },
      });

      if (existing && existing.name === expected.name && existing.phone === expected.phone) {
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
  });

  console.log('Pembersihan selesai:');
  console.log(results);
}

main()
  .catch((e) => {
    console.error('Error saat pembersihan data sample RT:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
