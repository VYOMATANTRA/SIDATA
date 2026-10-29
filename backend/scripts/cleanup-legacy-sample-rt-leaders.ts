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

const LEGACY_SAMPLE_LEADERS: Record<number, string> = {
  1: 'Bambang Supriyanto',
  2: 'Hj. Siti Aminah',
  3: 'Ahmad Dahlan',
};

const LEGACY_SAMPLE_POINT_ID = '00000000-0000-0000-0000-000000000001';

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    throw new Error('Refusing to run legacy sample cleanup on production without --force flag.');
  }

  console.log('Memulai pembersihan data sample RT lawas...');

  const results = await prisma.$transaction(async (tx) => {
    // 1. Delete legacy sample spatial point 1 and its RT junction row
    const deletedJunctions = await tx.spatialPointRt.deleteMany({
      where: { pointId: LEGACY_SAMPLE_POINT_ID },
    });

    const deletedPoints = await tx.spatialPoint.deleteMany({
      where: { id: LEGACY_SAMPLE_POINT_ID },
    });

    // 2. Clean up legacy fixture leaders if they still match the sample names
    let updatedLeaders = 0;
    for (const [rtNumStr, expectedName] of Object.entries(LEGACY_SAMPLE_LEADERS)) {
      const rtNumber = Number(rtNumStr);
      const existing = await tx.rtLeader.findUnique({
        where: { rtNumber },
      });

      if (existing && existing.name === expectedName) {
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
      deletedJunctions: deletedJunctions.count,
      deletedPoints: deletedPoints.count,
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
