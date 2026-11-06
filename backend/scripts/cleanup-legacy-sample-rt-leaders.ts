/** One-off maintenance entry point for legacy sample RT records. */
import { pathToFileURL } from 'node:url';
import prisma from '../src/utils/prisma.js';
import {
  cleanLegacySampleRtData,
  runLegacySampleRtCleanup,
} from '../src/services/legacySampleRtCleanup.service.js';

export { runLegacySampleRtCleanup };

async function main() {
  const force = process.argv.includes('--force');
  if (process.env.NODE_ENV === 'production' && !force) {
    throw new Error('Refusing to run legacy sample cleanup on production without --force flag.');
  }

  console.log('Memulai pembersihan data sample RT lawas...');
  const results = await cleanLegacySampleRtData('script', {
    force,
    ...(process.env.NODE_ENV ? { nodeEnv: process.env.NODE_ENV } : {}),
  });
  console.log('Pembersihan selesai:', results);
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  main()
    .catch((error) => {
      console.error('Error saat pembersihan data sample RT:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
