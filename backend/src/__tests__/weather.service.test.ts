import assert from 'node:assert/strict';
import { describe, it, beforeEach, mock } from 'node:test';
import {
  getManggarForecast,
  resetWeatherCache,
  expireWeatherCacheForTests,
  evictWeatherCache,
  getWeatherCacheKeysForTests,
  MAX_WEATHER_CACHE_ENTRIES,
} from '../services/weather.service.js';
import {
  weatherConfigCache,
  DEFAULT_WEATHER_CONFIG_SETTINGS,
} from '../services/settings.service.js';

const sampleBmkgResponse = {
  lokasi: { desa: 'Manggar', lat: -1.2251283, lon: 116.9438184 },
  data: [
    {
      cuaca: [
        [
          {
            local_datetime: '2026-08-13 12:00:00',
            t: 29,
            hu: 80,
            weather_desc: 'Berawan',
            ws: 10,
            wd: 'N',
          },
        ],
      ],
    },
  ],
};

function mockFetchOnce() {
  return mock.method(
    globalThis,
    'fetch',
    async () => new Response(JSON.stringify(sampleBmkgResponse), { status: 200 }),
  );
}

describe('getManggarForecast', () => {
  beforeEach(() => {
    resetWeatherCache();
    weatherConfigCache.invalidate();
    weatherConfigCache.set(DEFAULT_WEATHER_CONFIG_SETTINGS, weatherConfigCache.getVersion());
    mock.restoreAll();
  });

  it('fetches and transforms BMKG data on a cold cache', async () => {
    mockFetchOnce();

    const result = await getManggarForecast();

    assert.equal(result.location.desa, 'Manggar');
    assert.equal(result.forecast.length, 1);
    assert.equal(result.forecast[0]?.description, 'Berawan');
    assert.equal(result.stale, false);
  });

  it('dedupes concurrent requests on a cold cache into a single BMKG fetch', async () => {
    const fetchMock = mockFetchOnce();

    const [first, second, third] = await Promise.all([
      getManggarForecast(),
      getManggarForecast(),
      getManggarForecast(),
    ]);

    assert.equal(fetchMock.mock.callCount(), 1);
    assert.deepEqual(first, second);
    assert.deepEqual(second, third);
  });

  it('serves cached data without calling BMKG again', async () => {
    const fetchMock = mockFetchOnce();

    await getManggarForecast();
    await getManggarForecast();

    assert.equal(fetchMock.mock.callCount(), 1);
  });

  it('falls back to stale cache when BMKG fails', async () => {
    mockFetchOnce();
    await getManggarForecast();
    expireWeatherCacheForTests();

    mock.method(globalThis, 'fetch', async () => {
      throw new Error('network error');
    });

    const result = await getManggarForecast();

    assert.equal(result.stale, true);
    assert.equal(result.location.desa, 'Manggar');
  });

  it('backs off from BMKG after a failure instead of retrying on every request', async () => {
    mockFetchOnce();
    await getManggarForecast();
    expireWeatherCacheForTests();

    const failingFetch = mock.method(globalThis, 'fetch', async () => {
      throw new Error('network error');
    });

    const first = await getManggarForecast();
    const second = await getManggarForecast();

    assert.equal(failingFetch.mock.callCount(), 1);
    assert.equal(first.stale, true);
    assert.equal(second.stale, true);
  });

  it('falls back to stale cache when BMKG times out', async () => {
    mockFetchOnce();
    await getManggarForecast();
    expireWeatherCacheForTests();

    mock.method(globalThis, 'fetch', async () => {
      throw new DOMException('The operation was aborted.', 'TimeoutError');
    });

    const result = await getManggarForecast();

    assert.equal(result.stale, true);
    assert.equal(result.location.desa, 'Manggar');
  });

  it('calls BMKG API with custom adm4 parameter', async () => {
    let calledUrl = '';
    mock.method(globalThis, 'fetch', async (url: string | URL) => {
      calledUrl = String(url);
      return new Response(JSON.stringify(sampleBmkgResponse), { status: 200 });
    });

    const result = await getManggarForecast('64.71.02.2002');
    assert.equal(result.location.desa, 'Manggar');
    assert.ok(calledUrl.includes('adm4=64.71.02.2002'));
  });

  it('isolates cache per adm4 so different areas do not serve cross-area cached data', async () => {
    let callCount = 0;
    mock.method(globalThis, 'fetch', async (url: string | URL) => {
      callCount++;
      const isArea1 = String(url).includes('64.71.01.1001');
      return new Response(
        JSON.stringify({
          lokasi: { desa: isArea1 ? 'Manggar' : 'Manggar Baru', lat: -1.22, lon: 116.94 },
          data: [
            {
              cuaca: [
                [
                  {
                    local_datetime: '2026-08-13 12:00:00',
                    t: 30,
                    hu: 75,
                    weather_desc: isArea1 ? 'Cerah' : 'Hujan Ringan',
                    ws: 12,
                    wd: 'S',
                  },
                ],
              ],
            },
          ],
        }),
        { status: 200 },
      );
    });

    const resArea1 = await getManggarForecast('64.71.01.1001');
    assert.equal(resArea1.location.desa, 'Manggar');
    assert.equal(resArea1.forecast[0]?.description, 'Cerah');

    // Requesting a different adm4 must NOT return the cached result of the first adm4
    const resArea2 = await getManggarForecast('64.71.01.1002');
    assert.equal(resArea2.location.desa, 'Manggar Baru');
    assert.equal(resArea2.forecast[0]?.description, 'Hujan Ringan');

    assert.equal(callCount, 2, 'BMKG should be fetched for both distinct adm4 codes');

    // Second request to Area 1 should now hit Area 1's cache
    const resArea1Cached = await getManggarForecast('64.71.01.1001');
    assert.equal(resArea1Cached.location.desa, 'Manggar');
    assert.equal(callCount, 2, 'Should not trigger third fetch because Area 1 is cached');
  });

  it('dedupes concurrent requests per adm4 independently', async () => {
    let callCount = 0;
    mock.method(globalThis, 'fetch', async (url: string | URL) => {
      callCount++;
      const isArea1 = String(url).includes('64.71.01.1001');
      return new Response(
        JSON.stringify({
          lokasi: { desa: isArea1 ? 'Manggar' : 'Manggar Baru', lat: -1.22, lon: 116.94 },
          data: [
            {
              cuaca: [
                [
                  {
                    local_datetime: '2026-08-13 12:00:00',
                    t: 28,
                    hu: 80,
                    weather_desc: 'Berawan',
                    ws: 10,
                    wd: 'N',
                  },
                ],
              ],
            },
          ],
        }),
        { status: 200 },
      );
    });

    const [a1, a2, b1, b2] = await Promise.all([
      getManggarForecast('64.71.01.1001'),
      getManggarForecast('64.71.01.1001'),
      getManggarForecast('64.71.01.1002'),
      getManggarForecast('64.71.01.1002'),
    ]);

    assert.equal(a1.location.desa, 'Manggar');
    assert.equal(a2.location.desa, 'Manggar');
    assert.equal(b1.location.desa, 'Manggar Baru');
    assert.equal(b2.location.desa, 'Manggar Baru');
    assert.equal(callCount, 2, 'One fetch per unique adm4');
  });

  it('boundary testing: evictWeatherCache handles empty string, whitespace, null, and undefined safely', () => {
    // Boundary inputs: whitespace, null, undefined, empty string must not throw
    evictWeatherCache(null as unknown as string);
    evictWeatherCache(undefined);
    evictWeatherCache('');
    evictWeatherCache('   ');
    assert.equal(getWeatherCacheKeysForTests().length, 0);
  });

  it('evicts targeted adm4 without affecting other cached areas', async () => {
    mock.method(globalThis, 'fetch', async () => {
      return new Response(JSON.stringify(sampleBmkgResponse), { status: 200 });
    });

    await getManggarForecast('64.71.01.1001');
    await getManggarForecast('64.71.01.1002');

    const keysBefore = getWeatherCacheKeysForTests();
    assert.ok(keysBefore.includes('64.71.01.1001'));
    assert.ok(keysBefore.includes('64.71.01.1002'));
    assert.equal(keysBefore.length, 2);

    // Evict only area 1
    evictWeatherCache('64.71.01.1001');

    const keysAfter = getWeatherCacheKeysForTests();
    assert.equal(keysAfter.includes('64.71.01.1001'), false, 'Area 1 must be evicted');
    assert.equal(keysAfter.includes('64.71.01.1002'), true, 'Area 2 must remain cached');
  });

  it('enforces MAX_WEATHER_CACHE_ENTRIES capacity cap and evicts least recently used entry (LRU)', async () => {
    mock.method(globalThis, 'fetch', async () => {
      return new Response(JSON.stringify(sampleBmkgResponse), { status: 200 });
    });

    assert.equal(MAX_WEATHER_CACHE_ENTRIES, 5);

    // Insert 5 distinct adm4 codes (filling cache to capacity: 1001, 1002, 1003, 1004, 1005)
    for (let i = 1; i <= 5; i++) {
      await getManggarForecast(`64.71.01.100${i}`);
    }

    let keys = getWeatherCacheKeysForTests();
    assert.equal(keys.length, 5);
    assert.equal(keys[0], '64.71.01.1001');

    // Access 1001 again (cache hit) — this must bump 1001 to most-recently-used, leaving 1002 as the least recently used
    await getManggarForecast('64.71.01.1001');
    keys = getWeatherCacheKeysForTests();
    assert.equal(keys[0], '64.71.01.1002', '1002 should now be the least recently used entry');
    assert.equal(
      keys[keys.length - 1],
      '64.71.01.1001',
      '1001 should now be the most recently used entry',
    );

    // Insert 6th adm4 code: must evict the least recently used entry ('64.71.01.1002'), keeping 1001 cached
    await getManggarForecast('64.71.01.1006');

    keys = getWeatherCacheKeysForTests();
    assert.equal(keys.length, 5, 'Map size must not exceed MAX_WEATHER_CACHE_ENTRIES');
    assert.equal(
      keys.includes('64.71.01.1002'),
      false,
      'Least recently used entry 1002 must have been evicted',
    );
    assert.ok(
      keys.includes('64.71.01.1001'),
      'Frequently/recently accessed entry 1001 must remain cached',
    );
    assert.ok(keys.includes('64.71.01.1006'), 'New entry 1006 must be present');
  });

  it('respects dynamic operational weather settings from getWeatherConfigSettings', async () => {
    let calledUrl: string | undefined;

    mock.method(globalThis, 'fetch', async (url: string) => {
      calledUrl = url;
      return new Response(JSON.stringify(sampleBmkgResponse), { status: 200 });
    });

    weatherConfigCache.set(
      {
        bmkgBaseUrl: 'https://custom-bmkg.test/api/cuaca',
        cacheTtlMs: 120_000,
        staleRetryMs: 30_000,
        fetchTimeoutMs: 7_500,
      },
      weatherConfigCache.getVersion(),
    );

    const result = await getManggarForecast('64.71.01.1001');
    assert.equal(result.location.desa, 'Manggar');
    assert.ok(
      calledUrl?.startsWith('https://custom-bmkg.test/api/cuaca?adm4='),
      `Expected custom base URL, got: ${calledUrl}`,
    );
  });

  it('prevents in-flight refresh race condition from repopulating evicted cache or removing newer in-flight promise', async () => {
    let resolveFirstFetch!: (val: Response) => void;
    const firstFetchPromise = new Promise<Response>((resolve) => {
      resolveFirstFetch = resolve;
    });

    let fetchCount = 0;
    mock.method(globalThis, 'fetch', async () => {
      fetchCount++;
      if (fetchCount === 1) {
        return firstFetchPromise;
      }
      return new Response(JSON.stringify(sampleBmkgResponse), { status: 200 });
    });

    // 1. Start initial refresh (slow in-flight)
    const initialPromise = getManggarForecast('64.71.01.1001');

    // 2. Mid-flight eviction occurs
    evictWeatherCache('64.71.01.1001');
    assert.equal(getWeatherCacheKeysForTests().includes('64.71.01.1001'), false);

    // 3. Second request arrives while first is still pending
    const secondPromise = getManggarForecast('64.71.01.1001');
    assert.notEqual(initialPromise, secondPromise, 'Must create a new promise after eviction');

    // 4. First fetch resolves after eviction
    resolveFirstFetch(new Response(JSON.stringify(sampleBmkgResponse), { status: 200 }));
    await initialPromise;

    // Second fetch completes
    const secondResult = await secondPromise;
    assert.equal(secondResult.location.desa, 'Manggar');
    assert.ok(fetchCount >= 2, 'Second fetch must be initiated after eviction');
  });
});
