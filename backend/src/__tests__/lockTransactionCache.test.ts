import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  VersionedTtlCache,
  executeLockedTransaction,
  withChangeResult,
  LOCKED_OPERATION_RESULT,
} from '../utils/lockTransactionCache.js';
import { Prisma } from '../../generated/prisma/client.js';

describe('utils/lockTransactionCache VersionedTtlCache', () => {
  it('returns null on cold cache and serves structured-cloned data on warm cache', () => {
    const dummyClient = { name: 'db' };
    const cache = new VersionedTtlCache<{ count: number; nested: { value: string } }>({
      ttlMs: 5000,
      baseClient: dummyClient,
    });

    assert.equal(cache.get(dummyClient), null);

    const versionAtStart = cache.getVersion();
    const stored = { count: 42, nested: { value: 'initial' } };
    const setSuccess = cache.set(stored, versionAtStart, dummyClient);
    assert.equal(setSuccess, true);

    const retrieved = cache.get(dummyClient);
    assert.ok(retrieved);
    assert.equal(retrieved.count, 42);
    assert.equal(retrieved.nested.value, 'initial');

    // Immutability test: mutating retrieved object must not affect cached data
    retrieved.count = 99;
    retrieved.nested.value = 'mutated';

    const secondRetrieval = cache.get(dummyClient);
    assert.ok(secondRetrieval);
    assert.equal(secondRetrieval.count, 42);
    assert.equal(secondRetrieval.nested.value, 'initial');
  });

  it('bypasses cache when skipCache is true', () => {
    const dummyClient = { name: 'db' };
    const cache = new VersionedTtlCache<string>({
      ttlMs: 5000,
      baseClient: dummyClient,
    });

    const v = cache.getVersion();
    cache.set('hello', v, dummyClient);

    assert.equal(cache.get(dummyClient, false), 'hello');
    assert.equal(cache.get(dummyClient, true), null);
  });

  it('enforces client isolation: transaction or custom clients bypass read and write', () => {
    const defaultClient = { name: 'prisma-root' };
    const txClient = { name: 'prisma-tx' };

    const cache = new VersionedTtlCache<{ app: string }>({
      ttlMs: 5000,
      baseClient: defaultClient,
    });

    // Populate cache with default client
    const v = cache.getVersion();
    cache.set({ app: 'SIDATA' }, v, defaultClient);

    // Default client can read
    assert.deepEqual(cache.get(defaultClient), { app: 'SIDATA' });

    // Transaction client bypasses read
    assert.equal(cache.get(txClient), null);

    // Transaction client cannot write to cache
    const writeResult = cache.set({ app: 'TX Write' }, cache.getVersion(), txClient);
    assert.equal(writeResult, false);

    // Global cache remains unaffected
    assert.deepEqual(cache.get(defaultClient), { app: 'SIDATA' });
  });

  it('expires cached data after TTL', async () => {
    const dummyClient = { name: 'db' };
    const cache = new VersionedTtlCache<string>({
      ttlMs: 20, // 20ms TTL
      baseClient: dummyClient,
    });

    const v = cache.getVersion();
    cache.set('expiring-soon', v, dummyClient);
    assert.equal(cache.get(dummyClient), 'expiring-soon');

    await new Promise((resolve) => setTimeout(resolve, 30));

    assert.equal(cache.get(dummyClient), null);
  });

  it('bumps version on invalidate and clears cache', () => {
    const dummyClient = { name: 'db' };
    const cache = new VersionedTtlCache<string>({
      ttlMs: 5000,
      baseClient: dummyClient,
    });

    assert.equal(cache.getVersion(), 0);

    cache.set('val', cache.getVersion(), dummyClient);
    assert.equal(cache.get(dummyClient), 'val');

    cache.invalidate();
    assert.equal(cache.getVersion(), 1);
    assert.equal(cache.get(dummyClient), null);
  });

  it('anti-TOCTOU: discards cache write if invalidate was called while async operation was in-flight', () => {
    const dummyClient = { name: 'db' };
    const cache = new VersionedTtlCache<string>({
      ttlMs: 5000,
      baseClient: dummyClient,
    });

    // Capture version at start of hypothetical DB query
    const versionAtStart = cache.getVersion();

    // Concurrent mutation occurs in-flight
    cache.invalidate();
    assert.equal(cache.getVersion(), versionAtStart + 1);

    // DB query finishes with stale data and attempts to write
    const writeSuccess = cache.set('stale-data', versionAtStart, dummyClient);
    assert.equal(writeSuccess, false);
    assert.equal(cache.get(dummyClient), null);
  });

  it('getOrFetch caches on miss, serves on hit, and respects in-flight invalidations', async () => {
    const dummyClient = { name: 'db' };
    const cache = new VersionedTtlCache<{ key: string }>({
      ttlMs: 5000,
      baseClient: dummyClient,
    });

    let fetchCount = 0;
    const fetcher = async () => {
      fetchCount++;
      return { key: 'fetched' };
    };

    // First call: cache miss
    const res1 = await cache.getOrFetch(fetcher, dummyClient);
    assert.deepEqual(res1, { key: 'fetched' });
    assert.equal(fetchCount, 1);

    // Second call: cache hit
    const res2 = await cache.getOrFetch(fetcher, dummyClient);
    assert.deepEqual(res2, { key: 'fetched' });
    assert.equal(fetchCount, 1);

    // Third call with in-flight invalidation
    const inFlightFetcher = async () => {
      fetchCount++;
      cache.invalidate();
      return { key: 'stale' };
    };
    const res3 = await cache.getOrFetch(inFlightFetcher, dummyClient, { skipCache: true });
    assert.deepEqual(res3, { key: 'stale' });
    assert.equal(fetchCount, 2);

    // Next call must re-fetch because stale data was discarded
    const res4 = await cache.getOrFetch(fetcher, dummyClient);
    assert.deepEqual(res4, { key: 'fetched' });
    assert.equal(fetchCount, 3);
  });
});

describe('utils/lockTransactionCache executeLockedTransaction', () => {
  it('acquires lock via Prisma.Sql, executes mutation, invalidates cache, and returns result', async () => {
    let sqlExecuted: unknown = null;
    let transactionExecuted = false;
    let cacheInvalidated = false;
    let onCommitCalled = false;

    const mockTx = {
      $queryRaw: async (sql: unknown) => {
        sqlExecuted = sql;
        return [];
      },
    };

    const mockClient = {
      $transaction: async (fn: (tx: typeof mockTx) => Promise<unknown>) => {
        transactionExecuted = true;
        return fn(mockTx);
      },
    };

    const mockCache = {
      invalidate: () => {
        cacheInvalidated = true;
      },
    };

    const testLockSql = Prisma.sql`SELECT id FROM items WHERE id = ${123} FOR UPDATE`;

    const result = await executeLockedTransaction({
      client: mockClient,
      lockQuery: testLockSql,
      cache: mockCache,
      onCommit: async (committedResult, didChange) => {
        assert.equal(committedResult, 'updated-result');
        assert.equal(didChange, true);
        onCommitCalled = true;
      },
      execute: async (tx) => {
        assert.equal(tx, mockTx);
        return 'updated-result';
      },
    });

    assert.equal(result, 'updated-result');
    assert.equal(transactionExecuted, true);
    assert.equal(sqlExecuted, testLockSql);
    assert.equal(cacheInvalidated, true);
    assert.equal(onCommitCalled, true);
  });

  it('acquires lock via custom function and supports array of caches', async () => {
    let lockFnCalled = false;
    let cache1Invalidated = false;
    let cache2Invalidated = false;

    const mockTx = {};
    const mockClient = {
      $transaction: async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
    };

    const cache1 = {
      invalidate: () => {
        cache1Invalidated = true;
      },
    };
    const cache2 = {
      invalidate: () => {
        cache2Invalidated = true;
      },
    };

    const result = await executeLockedTransaction({
      client: mockClient,
      lockQuery: async (tx) => {
        assert.equal(tx, mockTx);
        lockFnCalled = true;
      },
      cache: [cache1, cache2],
      execute: async () => 100,
    });

    assert.equal(result, 100);
    assert.equal(lockFnCalled, true);
    assert.equal(cache1Invalidated, true);
    assert.equal(cache2Invalidated, true);
  });

  it('skips cache invalidation when didChange is false', async () => {
    let cacheInvalidated = false;
    let onCommitCalled = false;

    const mockTx = {
      $queryRaw: async () => [],
    };
    const mockClient = {
      $transaction: async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
    };

    const mockCache = {
      invalidate: () => {
        cacheInvalidated = true;
      },
    };

    const result = await executeLockedTransaction({
      client: mockClient,
      cache: mockCache,
      onCommit: async (committedResult, didChange) => {
        assert.equal(committedResult, 'no-change');
        assert.equal(didChange, false);
        onCommitCalled = true;
      },
      execute: async () => withChangeResult('no-change', false),
    });

    assert.equal(result, 'no-change');
    assert.equal(cacheInvalidated, false);
    assert.equal(onCommitCalled, true);
  });

  it('rolls back and does not invalidate cache or call onCommit when transaction fails', async () => {
    let cacheInvalidated = false;
    let onCommitCalled = false;

    const mockTx = {
      $queryRaw: async () => [],
    };
    const mockClient = {
      $transaction: async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
    };

    const mockCache = {
      invalidate: () => {
        cacheInvalidated = true;
      },
    };

    await assert.rejects(
      async () => {
        await executeLockedTransaction({
          client: mockClient,
          cache: mockCache,
          onCommit: async () => {
            onCommitCalled = true;
          },
          execute: async () => {
            throw new Error('Transaction aborted');
          },
        });
      },
      {
        message: 'Transaction aborted',
      },
    );

    assert.equal(cacheInvalidated, false);
    assert.equal(onCommitCalled, false);
  });

  it('does not unwrap domain objects that contain a result property without didChange boolean', async () => {
    const mockTx = {
      $queryRaw: async () => [],
    };
    const mockClient = {
      $transaction: async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
    };

    let cacheInvalidated = false;
    const mockCache = {
      invalidate: () => {
        cacheInvalidated = true;
      },
    };

    const domainObject = {
      id: 'item-1',
      result: 'PASSED_INSPECTION',
      score: 98,
    };

    const returned = await executeLockedTransaction({
      client: mockClient,
      cache: mockCache,
      execute: async () => domainObject,
    });

    assert.deepEqual(returned, domainObject);
    assert.equal(cacheInvalidated, true);
  });

  it('boundary testing: handles sparse cache arrays and non-invalidator entries safely', async () => {
    let validCacheInvalidated = false;
    const mockTx = {};
    const mockClient = {
      $transaction: async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
    };

    const validCache = {
      invalidate: () => {
        validCacheInvalidated = true;
      },
    };

    const returned = await executeLockedTransaction({
      client: mockClient,
      cache: [
        null as unknown as typeof validCache,
        undefined as unknown as typeof validCache,
        validCache,
        {} as typeof validCache,
      ],
      execute: async () => 'ok',
    });

    assert.equal(returned, 'ok');
    assert.equal(validCacheInvalidated, true);
  });

  it('boundary testing: handles falsy and primitive return values correctly', async () => {
    const mockTx = {};
    const mockClient = {
      $transaction: async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
    };

    // 0
    assert.equal(await executeLockedTransaction({ client: mockClient, execute: async () => 0 }), 0);

    // false
    assert.equal(
      await executeLockedTransaction({ client: mockClient, execute: async () => false }),
      false,
    );

    // empty string
    assert.equal(
      await executeLockedTransaction({ client: mockClient, execute: async () => '' }),
      '',
    );

    // null
    assert.equal(
      await executeLockedTransaction({ client: mockClient, execute: async () => null }),
      null,
    );

    // empty array []
    assert.deepEqual(
      await executeLockedTransaction({ client: mockClient, execute: async () => [] }),
      [],
    );

    // { result: null, didChange: false }
    let cacheInv = false;
    const res1 = await executeLockedTransaction({
      client: mockClient,
      cache: {
        invalidate: () => {
          cacheInv = true;
        },
      },
      execute: async () => withChangeResult(null, false),
    });
    assert.equal(res1, null);
    assert.equal(cacheInv, false);

    // { result: 0, didChange: false }
    const res2 = await executeLockedTransaction({
      client: mockClient,
      cache: {
        invalidate: () => {
          cacheInv = true;
        },
      },
      execute: async () => withChangeResult(0, false),
    });
    assert.equal(res2, 0);
    assert.equal(cacheInv, false);

    // { result: false, didChange: false }
    const res3 = await executeLockedTransaction({
      client: mockClient,
      cache: {
        invalidate: () => {
          cacheInv = true;
        },
      },
      execute: async () => withChangeResult(false, false),
    });
    assert.equal(res3, false);
    assert.equal(cacheInv, false);
  });
});

describe('utils/lockTransactionCache boundary conditions & sanity checks', () => {
  it('rejects invalid ttlMs inputs: 0, negative numbers, NaN, Infinity, and non-numbers', () => {
    const invalidTtls = [0, -1, -100, NaN, Infinity, -Infinity, '60000', null, undefined, {}];
    for (const badTtl of invalidTtls) {
      assert.throws(
        () => new VersionedTtlCache({ ttlMs: badTtl as unknown as number }),
        /ttlMs must be a positive finite number/,
      );
    }

    // Happy path last: valid positive numbers succeed
    const validCache = new VersionedTtlCache({ ttlMs: 1000 });
    assert.equal(validCache.getVersion(), 0);
  });

  it('boundary testing: getOrFetch correctly caches null and falsy values without redundant DB queries', async () => {
    const dummyClient = { name: 'db' };
    const cache = new VersionedTtlCache<unknown>({
      ttlMs: 5000,
      baseClient: dummyClient,
    });

    const falsyValues = [null, 0, false, '', []];

    for (const val of falsyValues) {
      cache.invalidate();
      let queryCount = 0;
      const fetcher = async () => {
        queryCount++;
        return val;
      };

      // 1. First call: cold cache, queries fetcher
      const res1 = await cache.getOrFetch(fetcher, dummyClient);
      assert.deepEqual(res1, val);
      assert.equal(queryCount, 1);

      // 2. Second call: MUST hit cache and NOT call fetcher again
      const res2 = await cache.getOrFetch(fetcher, dummyClient);
      assert.deepEqual(res2, val);
      assert.equal(
        queryCount,
        1,
        `Falsy value (${JSON.stringify(val)}) must be served from cache without re-querying`,
      );
    }
  });

  it('coalesces concurrent in-flight getOrFetch requests into a single database fetch (anti-thundering herd)', async () => {
    const dummyClient = { name: 'db' };
    const cache = new VersionedTtlCache<string>({
      ttlMs: 5000,
      baseClient: dummyClient,
    });

    let fetchCount = 0;
    const slowFetcher = async () => {
      fetchCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 'shared-fresh-data';
    };

    // 10 concurrent requests on a cold cache
    const results = await Promise.all([
      cache.getOrFetch(slowFetcher, dummyClient),
      cache.getOrFetch(slowFetcher, dummyClient),
      cache.getOrFetch(slowFetcher, dummyClient),
      cache.getOrFetch(slowFetcher, dummyClient),
      cache.getOrFetch(slowFetcher, dummyClient),
      cache.getOrFetch(slowFetcher, dummyClient),
      cache.getOrFetch(slowFetcher, dummyClient),
      cache.getOrFetch(slowFetcher, dummyClient),
      cache.getOrFetch(slowFetcher, dummyClient),
      cache.getOrFetch(slowFetcher, dummyClient),
    ]);

    // All 10 callers must receive the exact data
    for (const r of results) {
      assert.equal(r, 'shared-fresh-data');
    }
    // Exactly 1 database fetch must have been performed
    assert.equal(
      fetchCount,
      1,
      'Concurrent calls on cold cache must share single in-flight promise',
    );
  });

  it('bypasses in-flight promise coalescing for transaction clients', async () => {
    const dummyClient = { name: 'db' };
    const txClient = { name: 'tx' };
    const cache = new VersionedTtlCache<string>({
      ttlMs: 5000,
      baseClient: dummyClient,
    });

    let txFetchCount = 0;
    const txFetcher = async () => {
      txFetchCount++;
      return `tx-data-${txFetchCount}`;
    };

    const res1 = await cache.getOrFetch(txFetcher, txClient);
    const res2 = await cache.getOrFetch(txFetcher, txClient);

    assert.equal(res1, 'tx-data-1');
    assert.equal(res2, 'tx-data-2');
    assert.equal(txFetchCount, 2, 'Transaction client must bypass shared in-flight cache');
  });

  it('maintains lastKnownGood safely under anti-TOCTOU rules and supports setCommitted', async () => {
    const dummyClient = { name: 'db' };
    const cache = new VersionedTtlCache<{ appName: string }>({
      ttlMs: 5000,
      baseClient: dummyClient,
    });

    // 1. Initially returns default fallback
    assert.deepEqual(cache.getLastKnownGood({ appName: 'Default' }), { appName: 'Default' });

    // 2. Fetch updates lastKnownGood when committed
    await cache.getOrFetch(async () => ({ appName: 'Fetched V1' }), dummyClient);
    assert.deepEqual(cache.getLastKnownGood({ appName: 'Default' }), { appName: 'Fetched V1' });

    // 3. Stale fetch discarded during in-flight invalidation does NOT update lastKnownGood
    const versionBefore = cache.getVersion();
    cache.invalidate({ preserveLastKnownGood: true }); // bumps version
    const staleResult = cache.set({ appName: 'Stale V1' }, versionBefore, dummyClient);
    assert.equal(staleResult, false);
    // lastKnownGood must NOT be corrupted with Stale V1!
    assert.deepEqual(cache.getLastKnownGood({ appName: 'Default' }), { appName: 'Fetched V1' });

    // 4. setCommitted directly warms cache and updates lastKnownGood
    cache.setCommitted({ appName: 'Committed V2' });
    assert.deepEqual(cache.get(dummyClient), { appName: 'Committed V2' });
    assert.deepEqual(cache.getLastKnownGood({ appName: 'Default' }), { appName: 'Committed V2' });

    // 5. Invalidation with preserveLastKnownGood preserves it for fallback resilience
    cache.invalidate({ preserveLastKnownGood: true });
    assert.equal(cache.get(dummyClient), null);
    assert.deepEqual(cache.getLastKnownGood({ appName: 'Default' }), { appName: 'Committed V2' });

    // 6. Default invalidation clears it cleanly (e.g. between unit tests)
    cache.invalidate();
    assert.deepEqual(cache.getLastKnownGood({ appName: 'Default' }), { appName: 'Default' });
  });

  it('boundary testing: getLastKnownGood correctly preserves null and falsy values without falling back', async () => {
    const dummyClient = { name: 'db' };
    const cache = new VersionedTtlCache<unknown>({
      ttlMs: 5000,
      baseClient: dummyClient,
    });

    const fallbackSentinel = { fallback: true };
    const falsyValues = [null, false, 0, '', []];

    for (const val of falsyValues) {
      cache.invalidate();
      // Before setting: returns fallback
      assert.deepEqual(cache.getLastKnownGood(fallbackSentinel), fallbackSentinel);

      // Set legitimate falsy value
      cache.setCommitted(val);

      // Must return the stored falsy value, NOT the fallback!
      assert.deepEqual(
        cache.getLastKnownGood(fallbackSentinel),
        val,
        `getLastKnownGood must preserve ${JSON.stringify(val)} and not return fallback`,
      );
    }
  });

  it('boundary testing: handles negative numbers, MAX_SAFE_INTEGER, and deep immutability across cache calls', () => {
    const dummyClient = { name: 'db' };
    const cache = new VersionedTtlCache<number>({
      ttlMs: 5000,
      baseClient: dummyClient,
    });

    // 1. Boundary: Negative integers
    const negativeNumbers = [-1, -42, -999999];
    for (const neg of negativeNumbers) {
      cache.setCommitted(neg);
      assert.equal(cache.get(dummyClient), neg);
      assert.equal(cache.getLastKnownGood(999), neg);
    }

    // 2. Boundary: Maximum safe integer
    cache.setCommitted(Number.MAX_SAFE_INTEGER);
    assert.equal(cache.get(dummyClient), Number.MAX_SAFE_INTEGER);
    assert.equal(cache.getLastKnownGood(0), Number.MAX_SAFE_INTEGER);

    // 3. Boundary: 0
    cache.setCommitted(0);
    assert.equal(cache.get(dummyClient), 0);
    assert.equal(cache.getLastKnownGood(999), 0);

    // Happy path last: standard positive integer
    cache.setCommitted(12345);
    assert.equal(cache.get(dummyClient), 12345);
  });

  it('boundary testing: prevents silent truncation when execute returns domain objects having result and didChange alongside other properties', async () => {
    const mockClient = {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    };

    // 1. Boundary: Domain object with result, didChange, AND extra properties MUST NOT be stripped!
    const complexDomainObject = {
      result: 'verified',
      didChange: true,
      timestamp: 1726830000,
      metadata: { actorId: 'user-1' },
      items: [1, 2, 3],
    };

    const returnedComplex = await executeLockedTransaction({
      client: mockClient,
      execute: async () => complexDomainObject,
    });

    assert.deepEqual(
      returnedComplex,
      complexDomainObject,
      'Domain object with extra properties must NOT be stripped down to result field!',
    );
    assert.equal(returnedComplex.timestamp, 1726830000);
    assert.deepEqual(returnedComplex.metadata, { actorId: 'user-1' });

    // 2. Boundary: Domain object where didChange is NOT a boolean (e.g. number 0, 1, or string "yes") MUST NOT be stripped!
    const nonBooleanDidChange = {
      result: 42,
      didChange: 1 as unknown as boolean,
    };
    const returnedNonBoolean = await executeLockedTransaction({
      client: mockClient,
      execute: async () => nonBooleanDidChange,
    });
    assert.deepEqual(returnedNonBoolean, nonBooleanDidChange);

    // 3. Boundary: Domain object with EXACTLY { result, didChange: boolean } but lacking LOCKED_OPERATION_RESULT symbol MUST NOT be stripped!
    const plainDtoWithResultAndDidChange = {
      result: 'plain-dto-result',
      didChange: true,
    };
    const returnedPlainDto = await executeLockedTransaction({
      client: mockClient,
      execute: async () => plainDtoWithResultAndDidChange,
    });
    assert.deepEqual(
      returnedPlainDto,
      plainDtoWithResultAndDidChange,
      'Plain DTO shaped { result, didChange } without symbol tag must NOT be unwrapped!',
    );

    // 4. Boundary: withChangeResult explicitly wraps and marks didChange: false without stripping
    let cacheInvalidated = false;
    const dummyCache = {
      invalidate: () => {
        cacheInvalidated = true;
      },
    };

    assert.equal(typeof LOCKED_OPERATION_RESULT, 'symbol');

    const returnedWithChange = await executeLockedTransaction({
      client: mockClient,
      cache: dummyCache,
      execute: async () =>
        withChangeResult(
          {
            id: 'block-1',
            slug: 'about-us',
            title: 'Tentang Kami',
          },
          false,
        ),
    });

    assert.deepEqual(returnedWithChange, {
      id: 'block-1',
      slug: 'about-us',
      title: 'Tentang Kami',
    });
    assert.equal(cacheInvalidated, false, 'didChange: false must suppress cache invalidation');

    // Happy path last: standard return value without change wrapper
    const standardReturn = await executeLockedTransaction({
      client: mockClient,
      execute: async () => 'simple-result',
    });
    assert.equal(standardReturn, 'simple-result');
  });

  it('boundary testing: executeLockedTransaction gracefully handles null, undefined, empty array, and non-invalidator cache options', async () => {
    const mockClient = {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    };

    // 1. Boundary: options.cache is empty array []
    await executeLockedTransaction({
      client: mockClient,
      cache: [],
      execute: async () => 'ok-empty-array',
    });

    // 2. Boundary: options.cache contains null, undefined, and primitives
    let validInvalidatorCalled = false;
    await executeLockedTransaction({
      client: mockClient,
      cache: [
        null as unknown as { invalidate: () => void },
        undefined as unknown as { invalidate: () => void },
        {} as unknown as { invalidate: () => void },
        {
          invalidate: () => {
            validInvalidatorCalled = true;
          },
        },
      ],
      execute: async () => 'ok-sparse-cache-array',
    });
    assert.equal(validInvalidatorCalled, true);

    // 3. Boundary: options.cache is undefined
    const resUndefinedCache = await executeLockedTransaction({
      client: mockClient,
      cache: undefined,
      execute: async () => 'ok-undefined-cache',
    });
    assert.equal(resUndefinedCache, 'ok-undefined-cache');

    // 4. Boundary: options.lockQuery is undefined or null
    const resNoLock = await executeLockedTransaction({
      client: mockClient,
      lockQuery: undefined,
      execute: async () => 'ok-no-lock',
    });
    assert.equal(resNoLock, 'ok-no-lock');

    // Happy path last: single valid cache invalidator
    let singleCacheInvalidated = false;
    await executeLockedTransaction({
      client: mockClient,
      cache: {
        invalidate: () => {
          singleCacheInvalidated = true;
        },
      },
      execute: async () => 'ok-single-cache',
    });
    assert.equal(singleCacheInvalidated, true);
  });
});
