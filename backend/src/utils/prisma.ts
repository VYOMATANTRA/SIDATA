import { PrismaClient } from '../../generated/prisma/client.js';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { DATABASE_URL } from '../configs/index.js';
import { assertAuditLogAcknowledgeOnlyUpdate, AuditLogImmutableError } from './auditLogGuard.js';

// Prisma 7 has no dedicated MySQL adapter; `@prisma/adapter-mariadb` (the `mariadb` driver)
// is the officially documented adapter for both MySQL and MariaDB — this is the correct
// choice for our MySQL database, not a MariaDB-specific shortcut.
const databaseUrl = new URL(DATABASE_URL);

const basePrisma = new PrismaClient({
  adapter: new PrismaMariaDb({
    host: databaseUrl.hostname,
    port: Number(databaseUrl.port),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database: databaseUrl.pathname.slice(1),
  }),
});

// audit_logs is append-only from the app's perspective — see docs/SPEC.md §3 and
// src/utils/auditLogGuard.ts. This is a guardrail against a future contributor casually adding
// a `deleteMany` to tidy up logs; it is NOT a security boundary (see backend/scripts/grants/
// audit-logs-grants.sql for the layer that actually holds against a compromised app process).
// `acknowledgeAuditLog` in src/services/audit.service.ts is the sole intended write path
// against an existing row, and it only ever touches acknowledgedAt/acknowledgedById.
const prisma = basePrisma.$extends({
  name: 'audit-log-append-only-guard',
  query: {
    auditLog: {
      async update({ args, query }) {
        assertAuditLogAcknowledgeOnlyUpdate(args.data, 'update');
        return query(args);
      },
      async updateMany({ args, query }) {
        assertAuditLogAcknowledgeOnlyUpdate(args.data, 'updateMany');
        return query(args);
      },
      async upsert() {
        throw new AuditLogImmutableError('upsert');
      },
      async delete() {
        throw new AuditLogImmutableError('delete');
      },
      async deleteMany() {
        throw new AuditLogImmutableError('deleteMany');
      },
    },
  },
});

export default prisma;
