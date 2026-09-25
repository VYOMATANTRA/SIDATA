import prisma from './prisma.js';
import { Prisma } from '../../generated/prisma/client.js';

export interface VersionedTtlCacheOptions {
  ttlMs: number;
  baseClient?: unknown;
}

export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export interface CacheInvalidator {
  invalidate(): void;
}

/**
 * In-memory TTL cache with monotonic version tracking and deep-clone isolation.
 *
 * Enforces two key guarantees:
 * 1. Client isolation: transaction clients (`tx`) and custom clients bypass reading from
 *    and writing to the shared cache, preventing dirty or uncommitted reads.
 * 2. Anti-TOCTOU versioning: concurrent invalidations during in-flight asynchronous DB
 *    fetches discard stale results instead of overwriting freshly invalidated state.
 */
export class VersionedTtlCache<T> implements CacheInvalidator {
  private readonly ttlMs: number;
  private readonly baseClient: unknown;
  private entry: CacheEntry<T> | null = null;
  private lastKnownGood: T | null = null;
  private hasLastKnownGood = false;
  private version = 0;
  private inFlightPromise: Promise<T> | null = null;

  constructor(options: VersionedTtlCacheOptions) {
    if (
      typeof options?.ttlMs !== 'number' ||
      !Number.isFinite(options.ttlMs) ||
      options.ttlMs <= 0
    ) {
      throw new TypeError('ttlMs must be a positive finite number');
    }
    this.ttlMs = options.ttlMs;
    this.baseClient = options.baseClient ?? prisma;
  }

  /**
   * Current cache version. Incremented on every invalidation.
   */
  getVersion(): number {
    return this.version;
  }

  /**
   * Checks if an unexpired cache entry exists for the given client.
   */
  has(client: unknown = this.baseClient, skipCache = false): boolean {
    if (skipCache) return false;
    if (client !== this.baseClient) return false;
    if (!this.entry) return false;
    if (Date.now() >= this.entry.expiresAt) {
      this.entry = null;
      return false;
    }
    return true;
  }

  /**
   * Retrieves cached data if present, unexpired, skipCache is false, and client matches baseClient.
   * Transaction clients or different mock clients return null to prevent stale/uncommitted reads.
   */
  get(client: unknown = this.baseClient, skipCache = false): T | null {
    if (!this.has(client, skipCache)) return null;
    return structuredClone(this.entry!.data);
  }

  /**
   * Retrieves the last-known-good cached data (or a provided fallback) without querying DB.
   * Uses explicit existence flag to safely return null, false, 0, or empty string if cached.
   */
  getLastKnownGood(fallback: T): T {
    if (this.hasLastKnownGood) {
      return structuredClone(this.lastKnownGood as T);
    }
    return structuredClone(fallback);
  }

  /**
   * Stores data in cache conditionally.
   *
   * Guarded by:
   * - !skipCache (skips caching if skipCache is true)
   * - client === baseClient (never caches uncommitted transaction or third-party client writes)
   * - this.version === versionAtStart (anti-TOCTOU: discards stale data if invalidated while in-flight)
   */
  set(
    data: T,
    versionAtStart: number,
    client: unknown = this.baseClient,
    skipCache = false,
  ): boolean {
    if (skipCache) return false;
    if (client !== this.baseClient) return false;
    if (this.version !== versionAtStart) return false;

    const cloned = structuredClone(data);
    this.entry = {
      data: cloned,
      expiresAt: Date.now() + this.ttlMs,
    };
    this.lastKnownGood = structuredClone(cloned);
    this.hasLastKnownGood = true;
    return true;
  }

  /**
   * Sets newly committed data directly post-transaction, warming the cache and
   * synchronizing last-known-good state immediately.
   */
  setCommitted(data: T): void {
    const cloned = structuredClone(data);
    this.entry = {
      data: cloned,
      expiresAt: Date.now() + this.ttlMs,
    };
    this.lastKnownGood = structuredClone(cloned);
    this.hasLastKnownGood = true;
  }

  /**
   * Invalidates cache and bumps version counter.
   * Resets entry and in-flight promise. Resets lastKnownGood unless preserveLastKnownGood is true.
   */
  invalidate(options?: { preserveLastKnownGood?: boolean }): void {
    this.version++;
    this.entry = null;
    this.inFlightPromise = null;
    if (!options?.preserveLastKnownGood) {
      this.lastKnownGood = null;
      this.hasLastKnownGood = false;
    }
  }

  /**
   * Convenience helper to read from cache or fetch from DB with:
   * 1. Anti-TOCTOU version validation (discards stale data if invalidated while in-flight).
   * 2. Request deduplication (coalesces concurrent reads on cold cache to prevent thundering herd).
   * 3. Client isolation (transaction clients bypass shared cache and in-flight promises).
   */
  async getOrFetch<C>(
    fetcher: (client: C) => Promise<T>,
    client?: C,
    options?: { skipCache?: boolean },
  ): Promise<T> {
    const effectiveClient = (client ?? this.baseClient) as C;
    if (this.has(effectiveClient, options?.skipCache)) {
      return structuredClone(this.entry!.data);
    }

    const isSharedRootRead = effectiveClient === this.baseClient && !options?.skipCache;

    if (isSharedRootRead && this.inFlightPromise) {
      return structuredClone(await this.inFlightPromise);
    }

    const versionAtStart = this.version;
    const executeFetch = async (): Promise<T> => {
      const fresh = await fetcher(effectiveClient);
      this.set(fresh, versionAtStart, effectiveClient, options?.skipCache);
      return fresh;
    };

    if (isSharedRootRead) {
      const pending = executeFetch().finally(() => {
        if (this.inFlightPromise === pending) {
          this.inFlightPromise = null;
        }
      });
      this.inFlightPromise = pending;
      return structuredClone(await pending);
    }

    const fresh = await executeFetch();
    return structuredClone(fresh);
  }
}

export type LockQueryOrFn<Tx> = Prisma.Sql | ((tx: Tx) => Promise<unknown>);

export const LOCKED_OPERATION_RESULT = Symbol.for('sidata.lockedOperationResult');

export interface OperationResultWithChange<T> {
  [LOCKED_OPERATION_RESULT]: true;
  result: T;
  didChange: boolean;
}

export function withChangeResult<T>(result: T, didChange: boolean): OperationResultWithChange<T> {
  return {
    [LOCKED_OPERATION_RESULT]: true,
    result,
    didChange,
  };
}

function isOperationResultWithChange<T>(val: unknown): val is OperationResultWithChange<T> {
  if (typeof val !== 'object' || val === null) return false;
  return (val as Record<symbol, unknown>)[LOCKED_OPERATION_RESULT] === true;
}

export type LockedOperationOutput<T> = T | OperationResultWithChange<T>;

export interface TransactionRunner<Tx = unknown> {
  $transaction: (fn: (tx: Tx) => Promise<unknown>) => Promise<unknown>;
}

export interface ExecuteLockedTransactionOptions<T, Tx = unknown> {
  client?: TransactionRunner<Tx> | undefined;
  lockQuery?: LockQueryOrFn<Tx> | undefined;
  cache?: CacheInvalidator | CacheInvalidator[] | undefined;
  onCommit?: ((result: T, didChange: boolean) => void | Promise<void>) | undefined;
  execute: (tx: Tx) => Promise<LockedOperationOutput<T>>;
}

/**
 * Coordinates row-level pessimistic locking (`SELECT ... FOR UPDATE`), transaction isolation,
 * and post-commit cache invalidation for CMS and settings data.
 */
export async function executeLockedTransaction<T, Tx = unknown>(
  options: ExecuteLockedTransactionOptions<T, Tx>,
): Promise<T> {
  const runner = (options.client ?? prisma) as TransactionRunner<Tx>;

  const txOutput = (await runner.$transaction(async (tx: Tx) => {
    // 1. Acquire lock if specified
    if (options.lockQuery) {
      if (typeof options.lockQuery === 'function') {
        await options.lockQuery(tx);
      } else {
        await (tx as { $queryRaw: (query: Prisma.Sql) => Promise<unknown> }).$queryRaw(
          options.lockQuery,
        );
      }
    }

    // 2. Execute mutation logic
    const opOutput = await options.execute(tx);

    let result: T;
    let didChange = true;

    if (isOperationResultWithChange<T>(opOutput)) {
      result = opOutput.result;
      didChange = opOutput.didChange;
    } else {
      result = opOutput as T;
    }

    return { result, didChange };
  })) as OperationResultWithChange<T>;

  // 3. Post-commit cache invalidation & callbacks
  if (txOutput.didChange) {
    if (Array.isArray(options.cache)) {
      for (const c of options.cache) {
        if (c && typeof c.invalidate === 'function') {
          c.invalidate();
        }
      }
    } else if (options.cache && typeof options.cache.invalidate === 'function') {
      options.cache.invalidate();
    }
  }

  if (options.onCommit) {
    await options.onCommit(txOutput.result, txOutput.didChange);
  }

  return txOutput.result;
}
