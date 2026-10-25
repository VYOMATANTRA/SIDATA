import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { usePagesStore } from '../stores/pages.store';

function json(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return { ok, status, json: async () => body } as Response;
}

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

describe('pages store (CMS hierarchy)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('flattens the page hierarchy into a section lookup with breadcrumbs', async () => {
    globalThis.fetch = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === '/api/pages') {
        return json({
          pages: [
            {
              id: 'p1',
              slug: 'kependudukan',
              title: 'Kependudukan',
              sortOrder: 0,
              chapterCount: 1,
            },
          ],
        });
      }
      if (url === '/api/pages/kependudukan') {
        return json({
          page: {
            id: 'p1',
            slug: 'kependudukan',
            title: 'Kependudukan',
            sortOrder: 0,
            chapters: [
              {
                id: 'c1',
                slug: 'jumlah-penduduk',
                number: null,
                title: 'Jumlah Penduduk',
                sortOrder: 0,
                sections: [{ id: 's1', slug: 'ringkasan', title: 'Ringkasan', sortOrder: 0 }],
              },
            ],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const store = usePagesStore();
    await store.fetchHierarchy();

    expect(store.sections).toHaveLength(1);
    expect(store.breadcrumbParts('s1')).toEqual(['Kependudukan', 'Jumlah Penduduk', 'Ringkasan']);
    expect(store.pageTitleFor('s1')).toBe('Kependudukan');
    expect(store.labelFor('s1')).toBe('Kependudukan > Jumlah Penduduk > Ringkasan');
    expect(store.isLoaded).toBe(true);
  });

  it('omits a null section title from the breadcrumb', async () => {
    globalThis.fetch = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === '/api/pages') {
        return json({
          pages: [
            { id: 'p1', slug: 'pendidikan', title: 'Pendidikan', sortOrder: 0, chapterCount: 1 },
          ],
        });
      }
      return json({
        page: {
          id: 'p1',
          slug: 'pendidikan',
          title: 'Pendidikan',
          sortOrder: 0,
          chapters: [
            {
              id: 'c1',
              slug: 'tingkat-pendidikan',
              number: null,
              title: 'Tingkat Pendidikan',
              sortOrder: 0,
              sections: [{ id: 's1', slug: 'ringkasan', title: null, sortOrder: 0 }],
            },
          ],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      });
    }) as typeof fetch;

    const store = usePagesStore();
    await store.fetchHierarchy();

    expect(store.breadcrumbParts('s1')).toEqual(['Pendidikan', 'Tingkat Pendidikan']);
  });

  it('reuses a page already cached by the public read instead of refetching it', async () => {
    let detailFetches = 0;

    globalThis.fetch = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === '/api/pages') {
        return json({
          pages: [
            {
              id: 'p1',
              slug: 'kependudukan',
              title: 'Kependudukan',
              sortOrder: 0,
              chapterCount: 1,
            },
          ],
        });
      }
      if (url === '/api/pages/kependudukan') {
        detailFetches += 1;
        return json({
          page: {
            id: 'p1',
            slug: 'kependudukan',
            title: 'Kependudukan',
            sortOrder: 0,
            chapters: [
              {
                id: 'c1',
                slug: 'jumlah-penduduk',
                number: null,
                title: 'Jumlah Penduduk',
                sortOrder: 0,
                sections: [{ id: 's1', slug: 'ringkasan', title: null, sortOrder: 0 }],
              },
            ],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const store = usePagesStore();
    await store.fetchPageBySlug('kependudukan');
    await store.fetchHierarchy();

    expect(detailFetches).toBe(1);
    expect(store.sections.map((section) => section.sectionId)).toEqual(['s1']);
  });

  it('falls back to a neutral label for unknown sections', () => {
    const store = usePagesStore();

    expect(store.breadcrumbParts('missing')).toEqual([]);
    expect(store.pageTitleFor('missing')).toBeNull();
    expect(store.labelFor('missing')).toBe('Tanpa bagian');
    expect(store.labelFor(null)).toBe('Tanpa bagian');
  });

  it('keeps the rest of the hierarchy when one page detail fails', async () => {
    globalThis.fetch = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === '/api/pages') {
        return json({
          pages: [
            {
              id: 'p1',
              slug: 'kependudukan',
              title: 'Kependudukan',
              sortOrder: 0,
              chapterCount: 1,
            },
            { id: 'p2', slug: 'rusak', title: 'Rusak', sortOrder: 1, chapterCount: 1 },
          ],
        });
      }
      if (url === '/api/pages/rusak') {
        return json({ error: 'Terjadi kesalahan internal server' }, false, 500);
      }
      return json({
        page: {
          id: 'p1',
          slug: 'kependudukan',
          title: 'Kependudukan',
          sortOrder: 0,
          chapters: [
            {
              id: 'c1',
              slug: 'jumlah-penduduk',
              number: null,
              title: 'Jumlah Penduduk',
              sortOrder: 0,
              sections: [{ id: 's1', slug: 'ringkasan', title: 'Ringkasan', sortOrder: 0 }],
            },
          ],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      });
    }) as typeof fetch;

    const store = usePagesStore();
    await store.fetchHierarchy();

    expect(store.sections.map((section) => section.sectionId)).toEqual(['s1']);
    expect(store.isLoaded).toBe(true);
  });
});

describe('pages store (public page by slug)', () => {
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
