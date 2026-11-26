import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useIndicatorsStore, type Indicator } from '../stores/indicators.store';
import { usePageHighlightsStore } from '../stores/pageHighlights.store';

function json(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return { ok, status, json: async () => body } as Response;
}

function makeIndicator(overrides: Partial<Indicator>): Indicator {
  return {
    id: 'ind',
    sectionId: 'sec-1',
    slug: 'slug',
    label: 'Label',
    unit: 'jiwa',
    valueCurrent: '100',
    valuePrevious: null,
    periodCurrent: '2026',
    periodPrevious: null,
    isComputedComparison: false,
    isStale: false,
    source: null,
    hedgeNote: null,
    sortOrder: 0,
    pageSlug: 'kependudukan',
    ...overrides,
  };
}

/** Six indicators over two topics; the waste topic uses the long slug on one row, the short on another. */
const indicatorRows: Indicator[] = [
  makeIndicator({ id: 'k1', label: 'K satu', sortOrder: 0, pageSlug: 'kependudukan' }),
  makeIndicator({ id: 'k2', label: 'K dua', sortOrder: 1, pageSlug: 'kependudukan' }),
  makeIndicator({ id: 'k3', label: 'K tiga', sortOrder: 2, pageSlug: 'kependudukan' }),
  makeIndicator({ id: 'k4', label: 'K empat', sortOrder: 3, pageSlug: 'kependudukan' }),
  makeIndicator({ id: 'k5', label: 'K lima', sortOrder: 4, pageSlug: 'kependudukan' }),
  makeIndicator({
    id: 'w1',
    label: 'Sampah satu',
    sortOrder: 1,
    pageSlug: 'persampahan-dan-bank-sampah-unit',
  }),
  makeIndicator({ id: 'w2', label: 'Sampah dua', sortOrder: 0, pageSlug: 'persampahan' }),
];

function stubFetch(highlights: unknown): void {
  globalThis.fetch = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/indicators?pageSize=200')) {
      return json({ indicators: indicatorRows, total: indicatorRows.length });
    }
    if (url === '/api/pages/highlights') {
      return json({ highlights });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

describe('indicators store getStatsForPage (landing card)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('without chosen ids shows the topic’s first four in content order, never more', () => {
    stubFetch({});
    const store = useIndicatorsStore();
    store.indicators = indicatorRows;

    const labels = store.getStatsForPage('kependudukan').map((stat) => stat.label);
    expect(labels).toEqual(['K satu', 'K dua', 'K tiga', 'K empat']);
  });

  it('with chosen ids shows them in the chosen order, skipping unknown and off-topic ids', () => {
    const store = useIndicatorsStore();
    store.indicators = indicatorRows;

    const stats = store.getStatsForPage('kependudukan', ['k4', 'missing', 'w1', 'k1', 'k2']);
    expect(stats.map((stat) => stat.label)).toEqual(['K empat', 'K satu', 'K dua']);
  });

  it('caps chosen ids at four even when more are passed', () => {
    const store = useIndicatorsStore();
    store.indicators = indicatorRows;

    const stats = store.getStatsForPage('kependudukan', ['k5', 'k4', 'k3', 'k2', 'k1']);
    expect(stats.map((stat) => stat.label)).toEqual(['K lima', 'K empat', 'K tiga', 'K dua']);
  });

  it('returns nothing for chosen ids that are all unknown, rather than the fallback', () => {
    const store = useIndicatorsStore();
    store.indicators = indicatorRows;

    expect(store.getStatsForPage('kependudukan', ['gone'])).toEqual([]);
  });

  it('merges the waste topic across both slugs and caps the content-order fallback at four', () => {
    const store = useIndicatorsStore();
    store.indicators = [
      ...indicatorRows,
      makeIndicator({ id: 'w3', label: 'Sampah tiga', sortOrder: 2, pageSlug: 'persampahan' }),
      makeIndicator({ id: 'w4', label: 'Sampah empat', sortOrder: 3, pageSlug: 'persampahan' }),
    ];

    const fallback = store.getStatsForPage('persampahan-dan-bank-sampah-unit');
    expect(fallback.map((stat) => stat.label)).toEqual([
      'Sampah dua',
      'Sampah satu',
      'Sampah tiga',
      'Sampah empat',
    ]);
    expect(store.getStatsForPage('persampahan')).toHaveLength(4);
  });

  it('keeps the waste topic’s chosen ids from both slugs when the caller merges them', () => {
    const store = useIndicatorsStore();
    store.indicators = indicatorRows;

    const stats = store.getStatsForPage('persampahan', ['w1', 'w2']);
    expect(stats.map((stat) => stat.label)).toEqual(['Sampah satu', 'Sampah dua']);
  });
});

describe('pageHighlights store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('loads the public map and answers the chosen ids for a topic', async () => {
    stubFetch({
      kependudukan: { indicatorIds: ['k3', 'k1'], isFallback: false },
      pendidikan: { indicatorIds: ['p1'], isFallback: true },
    });
    const store = usePageHighlightsStore();

    await store.fetchHighlights();

    expect(store.isLoaded).toBe(true);
    expect(store.idsForPage('kependudukan')).toEqual(['k3', 'k1']);
    expect(store.idsForPage('pendidikan')).toEqual(['p1']);
    expect(store.idsForPage('kesehatan')).toBeUndefined();
  });

  it('merges the waste topic’s two slugs and caps the result at four', async () => {
    stubFetch({
      persampahan: { indicatorIds: ['w2', 'w3', 'w4'], isFallback: false },
      'persampahan-dan-bank-sampah-unit': { indicatorIds: ['w1', 'w2', 'w5'], isFallback: false },
    });
    const store = usePageHighlightsStore();
    await store.fetchHighlights();

    // Each slug merges its own list first, then the other slug's, capped at four.
    expect(store.idsForPage('persampahan')).toEqual(['w2', 'w3', 'w4', 'w1']);
    expect(store.idsForPage('persampahan-dan-bank-sampah-unit')).toEqual(['w1', 'w2', 'w5', 'w3']);
  });

  it('keeps the last good map and reports a failed refetch', async () => {
    stubFetch({ kependudukan: { indicatorIds: ['k1'], isFallback: false } });
    const store = usePageHighlightsStore();
    await store.fetchHighlights();

    globalThis.fetch = vi.fn<typeof fetch>(async () => json({}, false, 500)) as typeof fetch;
    await store.fetchHighlights(true);

    expect(store.error).not.toBeNull();
    expect(store.errorKind).not.toBeNull();
    expect(store.idsForPage('kependudukan')).toEqual(['k1']);
  });

  it('does not refetch a loaded map unless forced', async () => {
    stubFetch({});
    const store = usePageHighlightsStore();
    await store.fetchHighlights();
    await store.fetchHighlights();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
