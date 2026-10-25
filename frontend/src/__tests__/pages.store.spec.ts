import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { usePagesStore } from '../stores/pages.store';

const samplePage = {
  id: 'page-1',
  slug: 'kependudukan',
  title: 'Kependudukan',
  sortOrder: 1,
  chapters: [
    {
      id: 'chap-1',
      slug: 'jumlah-penduduk',
      number: '01',
      title: 'Jumlah Penduduk',
      sortOrder: 1,
      sections: [{ id: 'sec-1', slug: 'jumlah-penduduk-total', title: null, sortOrder: 1 }],
    },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('pages store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('fetches a page by slug and caches it', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ page: samplePage }),
    } as Response);
    globalThis.fetch = fetchMock;

    const store = usePagesStore();
    const result = await store.fetchPageBySlug('kependudukan');

    expect(result).toEqual(samplePage);
    expect(store.pagesBySlug['kependudukan']).toEqual(samplePage);
    expect(fetchMock).toHaveBeenCalledWith('/api/pages/kependudukan');
  });

  it('does not refetch an already-cached slug', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ page: samplePage }),
    } as Response);
    globalThis.fetch = fetchMock;

    const store = usePagesStore();
    await store.fetchPageBySlug('kependudukan');
    await store.fetchPageBySlug('kependudukan');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent requests for the same slug', async () => {
    let callCount = 0;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      callCount++;
      return { ok: true, status: 200, json: async () => ({ page: samplePage }) } as Response;
    });
    globalThis.fetch = fetchMock;

    const store = usePagesStore();
    await Promise.all([store.fetchPageBySlug('kependudukan'), store.fetchPageBySlug('kependudukan')]);

    expect(callCount).toBe(1);
  });

  it('sets notFound on a 404 and returns null', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Halaman tidak ditemukan' }),
    } as Response);
    globalThis.fetch = fetchMock;

    const store = usePagesStore();
    const result = await store.fetchPageBySlug('tidak-ada');

    expect(result).toBeNull();
    expect(store.notFound).toBe(true);
  });

  it('records a network error without throwing', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('Network error'));
    globalThis.fetch = fetchMock;

    const store = usePagesStore();
    const result = await store.fetchPageBySlug('kependudukan');

    expect(result).toBeNull();
    expect(store.error).toBe('Network error');
    expect(store.isLoading).toBe(false);
  });
});
