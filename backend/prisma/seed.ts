import prisma from '../src/utils/prisma.js';
import { AUDIT_RETENTION_KEYS } from '../src/services/settings.service.js';

async function main() {
  console.log('Memulai proses seeding...');

  const roleUser = await prisma.role.upsert({
    where: { name: 'user' },
    update: {},
    create: {
      name: 'user',
    },
  });

  const roleAdmin = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: {
      name: 'admin',
    },
  });

  // Audit log retention defaults to "0" (keep forever) for every severity — a fresh install
  // must never silently delete evidence; an admin has to opt into pruning via
  // PATCH /api/settings/audit-retention. See docs/SPEC.md §3 and backend/scripts/prune-audit-logs.ts.
  for (const key of Object.values(AUDIT_RETENTION_KEYS)) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: {},
      create: { key, value: '0' },
    });
  }

  console.log('seeding selesai');
  console.log({ roleUser, roleAdmin });
}

main()
  .catch((e) => {
    console.error('Error saat seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
