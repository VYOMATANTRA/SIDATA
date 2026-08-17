import assert from 'node:assert/strict';
import { describe, it, beforeEach, mock } from 'node:test';
import { fetchBmkgForecast } from '../utils/bmkg.js';

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

describe('fetchBmkgForecast', () => {
  beforeEach(() => {
    mock.restoreAll();
  });

  it('resolves with the parsed BMKG response on success', async () => {
    mock.method(
      globalThis,
      'fetch',
      async () => new Response(JSON.stringify(sampleBmkgResponse), { status: 200 }),
    );

    const result = await fetchBmkgForecast('64.71.01.1001');

    assert.equal(result.lokasi.desa, 'Manggar');
  });

  it('passes an abort signal so a hanging request can be timed out', async () => {
    const fetchMock = mock.method(
      globalThis,
      'fetch',
      async () => new Response(JSON.stringify(sampleBmkgResponse), { status: 200 }),
    );

    await fetchBmkgForecast('64.71.01.1001');

    const [, options] = fetchMock.mock.calls[0]?.arguments ?? [];
    assert.ok(options?.signal instanceof AbortSignal);
  });

  it('propagates a timeout/abort error to the caller', async () => {
    mock.method(globalThis, 'fetch', async () => {
      throw new DOMException('The operation was aborted.', 'TimeoutError');
    });

    await assert.rejects(() => fetchBmkgForecast('64.71.01.1001'), {
      name: 'TimeoutError',
    });
  });
});
