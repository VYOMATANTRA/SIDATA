/**
 * Clears Cerita chapter content (sections, section prose/figure blocks, indicators, indicator
 * tables, and non-canonical chapters/pages) and re-ensures the empty canonical `CERITA_PAGES`
 * hierarchy. Leaves users/admin accounts, roles, system settings, comparison templates, RT data,
 * and standalone landing/catalog content blocks untouched.
 *
 * Usage:
 *   npm run content:reset -- --dry-run
 *   npm run content:reset
 *   npm run content:reset -- --force            # wajib di NODE_ENV=production
 *   npm run content:reset -- --reset-covers     # opsional: sekalian lepas thumbnail cover & headline halaman
 */
import { pathToFileURL } from 'node:url';
import prisma from '../src/utils/prisma.js';
import { resetCeritaContent } from '../src/services/ceritaReset.service.js';

function printHelp(): void {
  console.log(`
Penggunaan:
  npm run content:reset -- [opsi]

Opsi:
  --dry-run        Hitung data yang akan dibersihkan tanpa mengubah database
  --force          Wajib diberikan saat NODE_ENV=production
  --reset-covers   Sekalian hapus coverAssetId dan headline/byline halaman Cerita
  --help           Tampilkan bantuan ini
`);
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help')) {
    printHelp();
    return;
  }

  const dryRun = args.has('--dry-run');
  const force = args.has('--force');
  const resetCovers = args.has('--reset-covers');

  const result = await resetCeritaContent({
    dryRun,
    force,
    resetCovers,
    ...(process.env.NODE_ENV ? { nodeEnv: process.env.NODE_ENV } : {}),
  });

  console.log(
    dryRun
      ? '[DRY RUN] Ringkasan pembersihan konten Cerita (belum ada perubahan DB):'
      : 'Pembersihan konten Cerita selesai:',
  );
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  main()
    .catch((err) => {
      console.error('Error saat membersihkan konten Cerita:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
