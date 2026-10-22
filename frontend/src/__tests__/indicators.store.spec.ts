import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useIndicatorsStore, type IndicatorItem } from '../stores/indicators.store';

describe('indicators.store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('initializes with empty indicators and clean default state', () => {
    const store = useIndicatorsStore();
    expect(store.indicators).toEqual([]);
    expect(store.isLoading).toBe(false);
    expect(store.isLoaded).toBe(false);
    expect(store.error).toBeNull();
  });

  it('returns empty stats array when no indicators exist for a page slug', () => {
    const store = useIndicatorsStore();
    expect(store.getStatsForPage('kependudukan')).toEqual([]);
    expect(store.getStatsForPage('pendidikan')).toEqual([]);
    expect(store.getStatsForPage('kesehatan')).toEqual([]);
  });

  it('fetches indicators from /api/indicators successfully', async () => {
    const sampleIndicators: IndicatorItem[] = [
      {
        id: '1',
        slug: 'jumlah-penduduk',
        label: 'Penduduk',
        unit: 'jiwa',
        valueCurrent: '53.098',
        pageSlug: 'kependudukan',
        sortOrder: 1,
      },
      {
        id: '2',
        slug: 'rukun-tetangga',
        label: 'Rukun Tetangga',
        unit: 'RT',
        valueCurrent: '100',
        pageSlug: 'kependudukan',
        sortOrder: 2,
      },
    ];

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ indicators: sampleIndicators }),
    } as Response);

    const store = useIndicatorsStore();
    await store.fetchIndicators();

    expect(store.indicators).toHaveLength(2);
    expect(store.isLoaded).toBe(true);
    expect(store.isLoading).toBe(false);

    const stats = store.getStatsForPage('kependudukan');
    expect(stats).toHaveLength(2);
    expect(stats[0]).toEqual({
      icon: 'person',
      value: '53.098',
      label: 'Penduduk',
      unit: 'jiwa',
    });
    expect(stats[1]).toEqual({
      icon: 'house',
      value: '100',
      label: 'Rukun Tetangga',
      unit: 'RT',
    });
  });

  it('handles 404 endpoint not found gracefully without throwing or corrupting state', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not Found' }),
    } as Response);

    const store = useIndicatorsStore();
    await store.fetchIndicators();

    expect(store.indicators).toEqual([]);
    expect(store.isLoaded).toBe(true);
    expect(store.isLoading).toBe(false);
    expect(store.error).toBeNull();
  });

  it('handles network failure gracefully without throwing and leaves stats empty', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockRejectedValue(new Error('Network offline'));

    const store = useIndicatorsStore();
    await store.fetchIndicators();

    expect(store.indicators).toEqual([]);
    expect(store.isLoading).toBe(false);
    expect(store.getStatsForPage('kependudukan')).toEqual([]);
  });
});
