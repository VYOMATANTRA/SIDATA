import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useIndicatorsStore } from '../stores/indicators.store';

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

describe('indicators store', () => {
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

  it('returns an empty list and records an error on failure', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom' }),
    } as Response);
    globalThis.fetch = fetchMock;

    const store = useIndicatorsStore();
    const result = await store.fetchBySectionId('sec-1');

    expect(result).toEqual([]);
    expect(store.error).toContain('500');
  });
});
