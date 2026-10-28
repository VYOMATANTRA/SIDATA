import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useIndicatorsStore, type IndicatorDto } from '../stores/indicators.store';

const sampleIndicator: IndicatorDto = {
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

  describe('fetchBySectionId', () => {
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

  describe('fetchBySlug & findBySlug', () => {
    it('fetches indicator by slug, caches in bySlug, and findBySlug retrieves it', async () => {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        json: async () => ({ indicator: sampleIndicator }),
      } as Response);
      globalThis.fetch = fetchMock;

      const store = useIndicatorsStore();
      const result = await store.fetchBySlug('jumlah-penduduk');

      expect(result).toEqual(sampleIndicator);
      expect(store.bySlug['jumlah-penduduk']).toEqual(sampleIndicator);
      expect(store.findBySlug('jumlah-penduduk')).toEqual(sampleIndicator);
      expect(fetchMock).toHaveBeenCalledWith('/api/indicators/jumlah-penduduk');

      // Subsequent call should return cached instance without extra fetch
      const cached = await store.fetchBySlug('jumlah-penduduk');
      expect(cached).toEqual(sampleIndicator);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('returns null and records the error against that slug without caching empty result', async () => {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);
      globalThis.fetch = fetchMock;

      const store = useIndicatorsStore();
      const result = await store.fetchBySlug('non-existent');

      expect(result).toBeNull();
      expect(store.errorsBySlug['non-existent']).toContain('404');
      expect(store.bySlug['non-existent']).toBeUndefined();
      expect(store.loadingBySlug['non-existent']).toBe(false);
    });

    it('dedupes concurrent requests for the same slug', async () => {
      let callCount = 0;
      const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          json: async () => ({ indicator: sampleIndicator }),
        } as Response;
      });
      globalThis.fetch = fetchMock;

      const store = useIndicatorsStore();
      const [res1, res2] = await Promise.all([
        store.fetchBySlug('jumlah-penduduk'),
        store.fetchBySlug('jumlah-penduduk'),
      ]);

      expect(res1).toEqual(sampleIndicator);
      expect(res2).toEqual(sampleIndicator);
      expect(callCount).toBe(1);
    });

    it('keeps one slug error from clobbering a sibling slug in-flight at the same time', async () => {
      const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('fail-slug')) {
          return { ok: false, status: 500 } as Response;
        }
        return { ok: true, json: async () => ({ indicator: sampleIndicator }) } as Response;
      });
      globalThis.fetch = fetchMock;

      const store = useIndicatorsStore();
      await Promise.all([
        store.fetchBySlug('fail-slug'),
        store.fetchBySlug('ok-slug'),
      ]);

      expect(store.errorsBySlug['fail-slug']).toContain('500');
      expect(store.errorsBySlug['ok-slug']).toBeNull();
      expect(store.bySlug['ok-slug']).toEqual(sampleIndicator);
      expect(store.loadingBySlug['fail-slug']).toBe(false);
      expect(store.loadingBySlug['ok-slug']).toBe(false);
    });
  });
});
