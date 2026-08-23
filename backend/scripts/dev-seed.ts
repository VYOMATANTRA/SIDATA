/**
 * Dev-only helper: creates a verified local admin account for manual testing.
 * Not wired into the app or prisma seed pipeline — run explicitly:
 *   npx tsx scripts/dev-seed.ts
 *
 * Credentials are intentionally hardcoded/well-known; never run against a
 * non-local database.
 */
import bcrypt from 'bcryptjs';
import prisma from '../src/utils/prisma.js';

const DEV_EMAIL = 'dev-admin@example.com';
const DEV_PASSWORD = 'DevPassword123!';

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run dev-seed with NODE_ENV=production.');
  }

  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: { name: 'admin' },
  });

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: DEV_EMAIL },
    update: {
      password_hash: passwordHash,
      auth_provider: 'local',
      email_verified: true,
      requires_password_change: false,
      deletedAt: null,
      roleId: adminRole.id,
    },
    create: {
      email: DEV_EMAIL,
      password_hash: passwordHash,
      auth_provider: 'local',
      email_verified: true,
      requires_password_change: false,
      roleId: adminRole.id,
    },
  });

  console.log('Dev admin account ready:');
  console.log({ email: user.email, password: DEV_PASSWORD, role: adminRole.name });
}

main()
  .catch((e) => {
    console.error('Error saat dev-seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
