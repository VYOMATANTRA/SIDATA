// Scheduled cleanup for uploaded media (docs/SPEC.md §7 media_assets). Run it from cron, like the
// audit pruner: it removes
//   - `_staging/` upload directories older than the grace period (aborted/crashed uploads), and
//   - unattached `media_assets` rows and their files whose grace period has passed, measured from
//     `detached_at` when content detached the asset, else from `created_at` (uploads an editor
//     never saved into content). Files are removed before the row, so a failed file delete keeps
//     the row and the next run retries (exit code 1 flags it for cron).
// Attached assets are never touched. Safe to re-run at any time.
//
// Uses the app's normal DB connection (media_assets keeps full DML in the grants script, unlike
// audit_logs), so no privileged credentials are needed.
//
// Usage (from backend/):
//   npm run media:cleanup                     # 24h grace
//   npm run media:cleanup -- --grace-hours=48
//   npm run media:cleanup -- --dry-run        # report counts, change nothing
// Grace period can also come from MEDIA_CLEANUP_GRACE_HOURS (the flag wins).

import { pathToFileURL } from 'node:url';
import {
  DEFAULT_MEDIA_CLEANUP_GRACE_HOURS,
  runMediaCleanup,
} from '../src/services/mediaCleanup.service.js';
import { getUploadRoot } from '../src/utils/mediaStorage.js';
import prisma from '../src/utils/prisma.js';

export function parseGraceHours(
  argv: readonly string[],
  env: Record<string, string | undefined>,
): number {
  const flag = argv.find((arg) => arg.startsWith('--grace-hours='));
  const raw = flag ? flag.slice('--grace-hours='.length) : env.MEDIA_CLEANUP_GRACE_HOURS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_MEDIA_CLEANUP_GRACE_HOURS;
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours < 1) {
    throw new Error(`Invalid grace period "${raw}": expected a number of hours >= 1.`);
  }
  return hours;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const graceHours = parseGraceHours(process.argv.slice(2), process.env);

  const root = await getUploadRoot();
  const result = await runMediaCleanup({
    root,
    graceMs: graceHours * 3_600_000,
    dryRun,
  });

  console.log(
    `${dryRun ? '[dry-run] Would remove' : 'Removed'}: ${result.stagingRemoved} staging dir(s), ` +
      `${result.assetsRemoved} unattached asset(s) older than ${graceHours}h` +
      (result.filesFailed > 0
        ? ` (${result.filesFailed} file removal(s) failed; ${result.assetsRetained} asset row(s) kept for the next run)`
        : '') +
      (result.assetsQuarantined > 0
        ? ` (${result.assetsQuarantined} asset(s) quarantined due to invalid storage paths)`
        : '') +
      (result.assetsRaced > 0
        ? ` (${result.assetsRaced} asset(s) were attached mid-run and lost their files; see log)`
        : '') +
      '.',
  );
  if (result.filesFailed > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error('Error saat membersihkan media:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
