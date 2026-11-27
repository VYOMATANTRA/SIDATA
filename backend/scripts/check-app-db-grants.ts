// Verifies after `prisma migrate deploy` that the restricted runtime DB user (`DATABASE_URL`)
// has table privileges for every application table created by migrations.
//
// Why: `backend/scripts/grants/audit-logs-grants.sql` replaces the blanket `db.*` grant with
// explicit per-table grants. When a future migration adds a new table, `sidata_app` cannot read or
// write it until `audit-logs-grants.sql` is updated and re-run as MySQL `root`.
//
// Usage: npx tsx scripts/check-app-db-grants.ts [--env-file /path/to/.env]

import fs from 'node:fs';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

export type GrantCheckStatus = 'ok' | 'uninitialized' | 'unhardened' | 'missing_grants';

export interface GrantCheckResult {
  status: GrantCheckStatus;
  missingTables: string[];
  message: string;
}

const IGNORED_TABLES = new Set(['_prisma_migrations']);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function evaluateAppDbGrants(input: {
  dbName: string;
  adminTables: readonly string[];
  appVisibleTables: readonly string[];
  appGrants: readonly string[];
}): GrantCheckResult {
  const { dbName, adminTables, appVisibleTables, appGrants } = input;
  const expectedTables = adminTables.filter((table) => !IGNORED_TABLES.has(table)).sort();
  const visibleSet = new Set(appVisibleTables);
  const missingTables = expectedTables.filter((table) => !visibleSet.has(table));

  const dbEscaped = dbName.replace(/\\/g, '\\\\').replace(/_/g, '\\_');
  const dbPattern = `(?:${escapeRegex(dbName)}|${escapeRegex(dbEscaped)})`;
  const dbWildcardGrantRe = new RegExp(`\\bON\\s+\`${dbPattern}\`\\.\\*`, 'i');
  const globalNonUsageGrantRe = /^GRANT\s+(?!USAGE\b).*\bON\s+\*\.\*/i;
  const tableGrantRe = new RegExp(`\\bON\\s+\`${dbPattern}\`\\.\`[^\`]+\``, 'i');

  const hasBlanketGrant = appGrants.some(
    (grant) => dbWildcardGrantRe.test(grant) || globalNonUsageGrantRe.test(grant),
  );
  if (hasBlanketGrant) {
    return {
      status: 'unhardened',
      missingTables,
      message:
        'WARNING: Runtime DB user still holds a blanket database/global grant. ' +
        'Run backend/scripts/grants/audit-logs-grants.sql as MySQL root to enable layer-2 audit_logs protection.',
    };
  }

  const hasPerTableGrant = appGrants.some((grant) => tableGrantRe.test(grant));
  if (!hasPerTableGrant) {
    return {
      status: 'uninitialized',
      missingTables,
      message:
        'ACTION REQUIRED: Runtime DB user has no table grants yet (fresh install). ' +
        'Run backend/scripts/grants/audit-logs-grants.sql as MySQL root, then run npx prisma db seed.',
    };
  }

  if (missingTables.length > 0) {
    return {
      status: 'missing_grants',
      missingTables,
      message:
        `Runtime DB user is missing grants on table(s): ${missingTables.join(', ')}. ` +
        'Add GRANT lines to backend/scripts/grants/audit-logs-grants.sql and re-run it as MySQL root.',
    };
  }

  return {
    status: 'ok',
    missingTables: [],
    message: `Verified runtime DB grants across ${expectedTables.length} table(s).`,
  };
}

function parseArgs(argv: readonly string[]): { envFile?: string } {
  const index = argv.indexOf('--env-file');
  if (index === -1) return {};
  const value = argv[index + 1];
  if (!value) {
    throw new Error('--env-file requires a path argument.');
  }
  return { envFile: value };
}

function loadDatabaseUrls(envFile?: string): { databaseUrl: string; adminDatabaseUrl: string } {
  const envMap = envFile ? dotenv.parse(fs.readFileSync(envFile)) : process.env;
  const databaseUrl = envMap.DATABASE_URL?.trim();
  const adminDatabaseUrl = envMap.AUDIT_ADMIN_DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is missing or empty.');
  }
  if (!adminDatabaseUrl) {
    throw new Error('AUDIT_ADMIN_DATABASE_URL is missing or empty.');
  }

  return { databaseUrl, adminDatabaseUrl };
}

async function queryBaseTables(
  connectionUrl: string,
): Promise<{ dbName: string; tables: string[] }> {
  const connection = await mysql.createConnection(connectionUrl);
  try {
    const [dbRows] = await connection.query<mysql.RowDataPacket[]>('SELECT DATABASE() AS dbName');
    const dbName = String(dbRows[0]?.dbName ?? '');
    if (!dbName) {
      throw new Error('Database name is not selected in connection URL.');
    }

    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT TABLE_NAME AS tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'",
    );
    return {
      dbName,
      tables: rows.map((row) => String(row.tableName)),
    };
  } finally {
    await connection.end();
  }
}

async function queryCurrentGrants(connectionUrl: string): Promise<string[]> {
  const connection = await mysql.createConnection(connectionUrl);
  try {
    const [rows] = await connection.query<mysql.RowDataPacket[]>('SHOW GRANTS FOR CURRENT_USER()');
    return rows
      .map((row) => {
        const firstValue = Object.values(row)[0];
        return typeof firstValue === 'string' ? firstValue : '';
      })
      .filter(Boolean);
  } finally {
    await connection.end();
  }
}

async function main(): Promise<void> {
  const { envFile } = parseArgs(process.argv.slice(2));
  const { databaseUrl, adminDatabaseUrl } = loadDatabaseUrls(envFile);

  const [{ dbName, tables: adminTables }, { tables: appVisibleTables }, appGrants] =
    await Promise.all([
      queryBaseTables(adminDatabaseUrl),
      queryBaseTables(databaseUrl),
      queryCurrentGrants(databaseUrl),
    ]);

  const result = evaluateAppDbGrants({
    dbName,
    adminTables,
    appVisibleTables,
    appGrants,
  });

  if (result.status === 'missing_grants') {
    console.error(result.message);
    process.exit(1);
  }

  if (result.status === 'uninitialized' || result.status === 'unhardened') {
    console.warn(result.message);
    return;
  }

  console.log(result.message);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(
      'Failed to verify runtime DB table grants:',
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  });
}
