import assert from 'node:assert/strict';
import { describe, it, beforeEach, mock } from 'node:test';
import {
  getManggarForecast,
  resetWeatherCache,
  expireWeatherCacheForTests,
} from '../services/weather.service.js';

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
});
