import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useIndicatorsStore, type Indicator } from '../stores/indicators.store';
import { useAuthStore } from '../stores/auth';

function json(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return { ok, status, json: async () => body } as Response;
}

function makeIndicator(overrides: Partial<Indicator> = {}): Indicator {
  return {
    id: 'ind-1',
    sectionId: 'sec-1',
    slug: 'total-penduduk',
    label: 'Total Penduduk',
    unit: 'jiwa',
    valueCurrent: '53098',
    valuePrevious: '52386',
    periodCurrent: '2026',
    periodPrevious: '2025',
    isComputedComparison: true,
    isStale: false,
    source: 'Prodeskel',
    hedgeNote: null,
    sortOrder: 0,
    comparisonTemplateId: null,
    comparison: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const sampleIndicator = {
  id: 'ind-1',
  sectionId: 'sec-1',
  slug: 'jumlah-penduduk',
  label: 'Jumlah Penduduk',
  unit: 'jiwa',
  valueCurrent: '12480.0000',
  valuePrevious: null,
  periodCurrent: '2026',
  periodPrevious: null,
  isComputedComparison: false,
  isStale: false,
  source: null,
  hedgeNote: null,
  sortOrder: 0,
  comparisonTemplateId: null,
  comparison: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('indicators store (CMS list and edits)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('loads the first 200 indicators', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.startsWith('/api/indicators?pageSize=200')) {
        throw new Error(`unexpected fetch: ${url}`);
      }
      return json({ indicators: [makeIndicator()], total: 1, page: 1, pageSize: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const store = useIndicatorsStore();
    await store.fetchIndicators();

    expect(store.indicators).toHaveLength(1);
    expect(store.total).toBe(1);
    expect(store.isLoaded).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends both the CSRF token and the bearer token on PATCH, then replaces the row', async () => {
    let patchInit: RequestInit | undefined;

    globalThis.fetch = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/auth/csrf-token') return json({ csrfToken: 'csrf-1' });
      if (url === '/api/indicators?pageSize=200') {
        return json({ indicators: [makeIndicator()], total: 1 });
      }
      if (url === '/api/indicators/ind-1') {
        patchInit = init;
        return json({
          message: 'Indikator diperbarui',
          indicator: makeIndicator({ valueCurrent: '54000' }),
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const authStore = useAuthStore();
    authStore.accessToken = 'token-1';

    const store = useIndicatorsStore();
    await store.fetchIndicators();

    const updated = await store.updateIndicator('ind-1', { valueCurrent: '54000' });

    expect(updated.valueCurrent).toBe('54000');
    expect(store.indicators[0]?.valueCurrent).toBe('54000');

    expect(patchInit?.method).toBe('PATCH');
    const headers = new Headers(patchInit?.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-1');
    expect(headers.get('x-csrf-token')).toBe('csrf-1');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(patchInit?.body))).toEqual({ valueCurrent: '54000' });
  });

  it('surfaces the backend error message and keeps the previous state', async () => {
    globalThis.fetch = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/auth/csrf-token') return json({ csrfToken: 'csrf-1' });
      if (url === '/api/indicators?pageSize=200') {
        return json({ indicators: [makeIndicator()], total: 1 });
      }
      return json({ error: 'value_previous dan period_previous harus diisi bersama' }, false, 400);
    }) as typeof fetch;

    const store = useIndicatorsStore();
    await store.fetchIndicators();

    await expect(store.updateIndicator('ind-1', { valuePrevious: null })).rejects.toThrow(
      'value_previous dan period_previous harus diisi bersama',
    );

    expect(store.indicators[0]?.valuePrevious).toBe('52386');
  });

  it('reports a list failure instead of throwing', async () => {
    globalThis.fetch = vi.fn<typeof fetch>(async () =>
      json({ error: 'Gagal' }, false, 500),
    ) as typeof fetch;

    const store = useIndicatorsStore();
    await store.fetchIndicators();

    expect(store.error).toBe('Gagal');
    expect(store.isLoaded).toBe(false);
    expect(store.indicators).toEqual([]);
  });
});

describe('indicators store (public per-section reads)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('fetches indicators for a section and caches them by sectionId', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ indicators: [sampleIndicator], total: 1, page: 1, pageSize: 50 }),
    } as Response);
    globalThis.fetch = fetchMock;

    const store = useIndicatorsStore();
    const result = await store.fetchBySectionId('sec-1');

    expect(result).toEqual([sampleIndicator]);
    expect(store.bySectionId['sec-1']).toEqual([sampleIndicator]);
    expect(fetchMock).toHaveBeenCalledWith('/api/indicators?sectionId=sec-1&pageSize=200');
  });

  it('does not refetch an already-cached sectionId', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ indicators: [sampleIndicator] }),
    } as Response);
    globalThis.fetch = fetchMock;

    const store = useIndicatorsStore();
    await store.fetchBySectionId('sec-1');
    await store.fetchBySectionId('sec-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns an empty list and records the error against that sectionId, not globally', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom' }),
    } as Response);
    globalThis.fetch = fetchMock;

    const store = useIndicatorsStore();
    const result = await store.fetchBySectionId('sec-1');

    expect(result).toEqual([]);
    expect(store.errorsBySectionId['sec-1']).toContain('500');
    // A failed fetch must never be written into bySectionId as [] — that would be
    // indistinguishable from a section that genuinely has no indicators.
    expect(store.bySectionId['sec-1']).toBeUndefined();
  });

  it('keeps one section error from clobbering a sibling section in-flight at the same time', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('sectionId=sec-fail')) {
        return { ok: false, status: 500, json: async () => ({ error: 'boom' }) } as Response;
      }
      return { ok: true, json: async () => ({ indicators: [sampleIndicator] }) } as Response;
    });
    globalThis.fetch = fetchMock;

    const store = useIndicatorsStore();
    await Promise.all([
      store.fetchBySectionId('sec-fail'),
      store.fetchBySectionId('sec-ok'),
    ]);

    expect(store.errorsBySectionId['sec-fail']).toContain('500');
    expect(store.errorsBySectionId['sec-ok']).toBeNull();
    expect(store.bySectionId['sec-ok']).toEqual([sampleIndicator]);
    expect(store.loadingBySectionId['sec-fail']).toBe(false);
    expect(store.loadingBySectionId['sec-ok']).toBe(false);
  });
});
