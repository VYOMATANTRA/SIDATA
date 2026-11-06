import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../../generated/prisma/client.js';

export interface QueryClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

export const ACTOR = { id: null, email: 'integration@example.com', role: 'admin' };
export const REQUEST_CONTEXT = { ipAddress: '127.0.0.1', userAgent: 'integration-test' };

function parseDatabaseUrl(): URL {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set; integration setup did not run.');
  return new URL(url);
}

/** A connection pool separate from the shared client, for real concurrent transactions. */
export function createIsolatedClient(transactionTimeoutMs = 5_000): PrismaClient {
  const url = parseDatabaseUrl();
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
    }),
    // Barrier-controlled interleavings intentionally keep a transaction open while a
    // competing one queues on its row lock; the 5s default is too tight for that.
    transactionOptions: { timeout: transactionTimeoutMs, maxWait: transactionTimeoutMs },
  });
}

/**
 * Single-connection client for the reset. `SET FOREIGN_KEY_CHECKS = 0` is session
 * state, so it only affects the TRUNCATEs if they share one pooled connection.
 */
let resetClient: PrismaClient | null = null;

function getResetClient(): PrismaClient {
  if (resetClient) return resetClient;
  const url = parseDatabaseUrl();
  resetClient = new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      connectionLimit: 1,
    }),
  });
  return resetClient;
}

export async function disconnectResetClient(): Promise<void> {
  await resetClient?.$disconnect();
  resetClient = null;
}

/**
 * Empties every application table. `_prisma_migrations` is kept so
 * `prisma migrate deploy` stays applied across runs.
 */
export async function resetDatabase(): Promise<void> {
  const client: QueryClient = getResetClient();
  await client.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
  try {
    const rows = await client.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`,
    );
    for (const row of rows) {
      const name = String(Object.values(row)[0]);
      await client.$executeRawUnsafe(`TRUNCATE TABLE \`${name.replaceAll('`', '``')}\``);
    }
  } finally {
    await client.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
  }
}

/**
 * Server-wide InnoDB deadlock counter. A delta of zero across a concurrency test is
 * the direct evidence that no lock-order inversion occurred — including deadlocks the
 * service silently recovered from with its internal retry.
 */
export async function innodbDeadlockCount(client: QueryClient): Promise<number> {
  // MySQL 8.4 no longer exposes the `Innodb_deadlocks` status variable, so read the
  // performance_schema error summary instead. CAST keeps BIGINT out of Prisma's JSON mapping.
  const rows = await client.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT CAST(SUM_ERROR_RAISED AS CHAR) AS raised
       FROM performance_schema.events_errors_summary_global_by_error
      WHERE ERROR_NUMBER = 1213`,
  );
  const row = rows[0];
  const value = row ? (row.raised ?? row.RAISED) : undefined;
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    throw new Error(
      'InnoDB deadlock counter unavailable: performance_schema error 1213 has no row. ' +
        'Refusing to treat a missing counter as zero deadlocks.',
    );
  }
  return Number(value);
}

/**
 * Wraps a client so its transaction pauses right after the FIRST
 * `spatialPointRt.findMany` has returned. That read is the import's pre-lock coverage
 * snapshot; pausing there lets a test commit a competing write between the snapshot and
 * the post-lock reads without any wall-clock guesswork.
 */
export function gateAfterFirstCoverageRead<T extends object>(
  client: T,
  hooks: { onPaused: () => void; resume: Promise<void> },
): T {
  const gateTx = (tx: object): object =>
    new Proxy(tx, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (prop !== 'spatialPointRt' || value === null || value === undefined) {
          return typeof value === 'function' ? value.bind(target) : value;
        }
        let paused = false;
        return new Proxy(value as object, {
          get(model, modelProp, modelReceiver) {
            const member = Reflect.get(model, modelProp, modelReceiver);
            if (modelProp !== 'findMany' || paused || typeof member !== 'function') {
              return typeof member === 'function' ? member.bind(model) : member;
            }
            return async (...args: unknown[]) => {
              paused = true;
              const rows = await (member as (...a: unknown[]) => Promise<unknown>).apply(
                model,
                args,
              );
              hooks.onPaused();
              await hooks.resume;
              return rows;
            };
          },
        });
      },
    });

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === '$transaction') {
        const transaction = Reflect.get(target, prop, target) as (
          fn: (tx: object) => Promise<unknown>,
          options?: unknown,
        ) => Promise<unknown>;
        return (fn: (tx: object) => Promise<unknown>, options?: unknown) =>
          transaction.call(target, async (tx) => fn(gateTx(tx)), options);
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as T;
}

export async function insertLeader(
  client: {
    rtLeader: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
  },
  rtNumber: number,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  await client.rtLeader.create({
    data: {
      rtNumber,
      name: `Ketua RT ${String(rtNumber).padStart(2, '0')}`,
      phone: '',
      phoneIsWhatsapp: false,
      alamat: null,
      ...overrides,
    },
  });
}

export async function insertPoint(
  client: {
    spatialPoint: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
  },
  point: {
    id: string;
    name?: string;
    type?: 'ketua_rt' | 'bank_sampah' | 'fasilitas_umum';
    latitude?: number;
    longitude?: number;
    rts?: number[];
  },
): Promise<void> {
  await client.spatialPoint.create({
    data: {
      id: point.id,
      name: point.name ?? `Pos ${point.id}`,
      type: point.type ?? 'ketua_rt',
      latitude: point.latitude ?? -1.25,
      longitude: point.longitude ?? 116.95,
      ...(point.rts && point.rts.length > 0
        ? { rtCoverages: { create: point.rts.map((rtNumber) => ({ rtNumber })) } }
        : {}),
    },
  });
}
