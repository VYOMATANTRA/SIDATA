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
import { describeDbConnectionFailure, formatDbConnectionFailure } from '../src/utils/dbError.js';

const DEV_EMAIL = 'dev-admin@example.com';
const DEV_PASSWORD = 'DevPassword123!';

/**
 * A local MySQL that has just been started usually needs a few seconds before it
 * accepts connections, and the driver adapter reports that as a pool timeout with no
 * hint of the real reason. Retry a reachable-looking failure for a short while, then
 * give up and name the actual cause.
 *
 * Each attempt already costs ~10s inside the driver's own pool timeout, so five
 * attempts cover roughly a minute of MySQL booting without stalling a dev forever.
 */
const CONNECT_ATTEMPTS = 5;
const CONNECT_RETRY_DELAY_MS = 3000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run dev-seed with NODE_ENV=production.');
  }

  let adminRole: { id: string; name: string } | undefined;
  for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt++) {
    try {
      adminRole = await prisma.role.upsert({
        where: { name: 'admin' },
        update: {},
        create: { name: 'admin' },
      });
      break;
    } catch (error) {
      const failure = describeDbConnectionFailure(error);
      if (!failure || !failure.retryable || attempt === CONNECT_ATTEMPTS) {
        if (failure) {
          console.error(formatDbConnectionFailure(failure));
        }
        throw error;
      }
      console.log(`Menunggu database siap (${attempt}/${CONNECT_ATTEMPTS}) — ${failure.reason}`);
      await wait(CONNECT_RETRY_DELAY_MS);
    }
  }

  if (!adminRole) {
    throw new Error('Dev-seed tidak dapat membuat role admin.');
  }

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
    const failure = describeDbConnectionFailure(e);
    if (!failure) {
      console.error('Error saat dev-seed:', e);
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
