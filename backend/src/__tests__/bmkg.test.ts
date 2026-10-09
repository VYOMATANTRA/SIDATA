import assert from 'node:assert/strict';
import { describe, it, beforeEach, mock } from 'node:test';
import { fetchBmkgForecast, validateBmkgAdm4 } from '../utils/bmkg.js';

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

describe('validateBmkgAdm4', () => {
  beforeEach(() => {
    mock.restoreAll();
  });

  it('resolves without error when BMKG returns a valid response with location and forecast', async () => {
    mock.method(
      globalThis,
      'fetch',
      async () => new Response(JSON.stringify(sampleBmkgResponse), { status: 200 }),
    );

    await assert.doesNotReject(() => validateBmkgAdm4('64.71.01.1001'));
  });

  it('rejects when BMKG response contains empty data array', async () => {
    mock.method(
      globalThis,
      'fetch',
      async () =>
        new Response(
          JSON.stringify({
            lokasi: { desa: 'Manggar', lat: -1.2, lon: 116.9 },
            data: [],
          }),
          { status: 200 },
        ),
    );

    await assert.rejects(() => validateBmkgAdm4('64.71.01.1001'), {
      message: 'Kode adm4 BMKG tidak memiliki data prakiraan cuaca',
    });
  });

  it('rejects when BMKG returns a non-200 HTTP status', async () => {
    mock.method(globalThis, 'fetch', async () => new Response('Not Found', { status: 404 }));

    await assert.rejects(() => validateBmkgAdm4('99.99.99.9999'), {
      message: 'BMKG API merespons dengan status 404',
    });
  });

  it('rejects when network fetch times out or fails', async () => {
    mock.method(globalThis, 'fetch', async () => {
      throw new DOMException('The operation was aborted.', 'TimeoutError');
    });

    await assert.rejects(() => validateBmkgAdm4('64.71.01.1001'), {
      name: 'TimeoutError',
    });
  });
});
