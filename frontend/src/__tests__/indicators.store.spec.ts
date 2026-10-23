import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useIndicatorsStore, type PublicIndicator } from '../stores/indicators.store';

describe('indicators store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('initializes with empty state', () => {
    const store = useIndicatorsStore();
    expect(store.indicators).toEqual([]);
    expect(store.isLoading).toBe(false);
    expect(store.error).toBeNull();
  });

  it('fetchBySlug fetches indicator by slug and caches in store', async () => {
    const mockIndicator: PublicIndicator = {
      id: 'ind-pop',
      sectionId: 'sec-1',
      slug: 'jumlah-penduduk',
      label: 'Jumlah Penduduk',
      unit: 'jiwa',
      valueCurrent: '125000',
      valuePrevious: '120000',
      periodCurrent: '2025',
      periodPrevious: '2024',
      isComputedComparison: true,
      isStale: false,
      source: 'Prodeskel',
      hedgeNote: null,
      comparison: 'naik',
    };

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ indicator: mockIndicator }),
    } as Response);
    globalThis.fetch = fetchMock;

    const store = useIndicatorsStore();
    const result = await store.fetchBySlug('jumlah-penduduk');

    expect(result).toEqual(mockIndicator);
    expect(store.indicators.length).toBe(1);
    expect(store.findBySlug('jumlah-penduduk')).toEqual(mockIndicator);
    expect(fetchMock).toHaveBeenCalledWith('/api/indicators/jumlah-penduduk');

    // Subsequent call should return cached instance without extra fetch
    const cached = await store.fetchBySlug('jumlah-penduduk');
    expect(cached).toEqual(mockIndicator);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetchBySlug returns null and sets error when request fails', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);
    globalThis.fetch = fetchMock;

    const store = useIndicatorsStore();
    const result = await store.fetchBySlug('non-existent');

    expect(result).toBeNull();
    expect(store.error).toContain('404');
    expect(store.isLoading).toBe(false);
  });

  it('fetchBySlug dedupes concurrent requests for the same slug', async () => {
    let callCount = 0;
    const mockIndicator: PublicIndicator = {
      id: 'ind-1',
      sectionId: 'sec-1',
      slug: 'jumlah-penduduk',
      label: 'Jumlah Penduduk',
      unit: 'jiwa',
      valueCurrent: '125000',
      valuePrevious: null,
      periodCurrent: '2025',
      isStale: false,
    };

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({ indicator: mockIndicator }),
      } as Response;
    });
    globalThis.fetch = fetchMock;

    const store = useIndicatorsStore();
    const [res1, res2] = await Promise.all([
      store.fetchBySlug('jumlah-penduduk'),
      store.fetchBySlug('jumlah-penduduk'),
    ]);

    expect(res1).toEqual(mockIndicator);
    expect(res2).toEqual(mockIndicator);
    expect(callCount).toBe(1);
  });
});
