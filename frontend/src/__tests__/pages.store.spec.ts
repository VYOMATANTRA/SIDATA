import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { usePagesStore } from '../stores/pages.store';
import { READ_USER_MESSAGES } from '../utils/userMessages';

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

  it('loads the whole hierarchy in one request and flattens it into a section lookup', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === '/api/pages?include=sections') {
        return json({
          pages: [
            {
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
          ],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const store = usePagesStore();
    await store.fetchHierarchy();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/pages?include=sections');
    expect(store.sections).toHaveLength(1);
    expect(store.breadcrumbParts('s1')).toEqual(['Kependudukan', 'Jumlah Penduduk', 'Ringkasan']);
    expect(store.pageTitleFor('s1')).toBe('Kependudukan');
    expect(store.labelFor('s1')).toBe('Kependudukan > Jumlah Penduduk > Ringkasan');
    expect(store.isLoaded).toBe(true);
  });

  it('omits a null section title from the breadcrumb', async () => {
    globalThis.fetch = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === '/api/pages?include=sections') {
        return json({
          pages: [
            {
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
          ],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const store = usePagesStore();
    await store.fetchHierarchy();

    expect(store.breadcrumbParts('s1')).toEqual(['Pendidikan', 'Tingkat Pendidikan']);
  });

  it('seeds the per-slug cache so a later Cerita read needs no second request', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === '/api/pages?include=sections') {
        return json({ pages: [samplePage] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    globalThis.fetch = fetchMock;

    const store = usePagesStore();
    await store.fetchHierarchy();
    const page = await store.fetchPageBySlug('kependudukan');

    expect(page?.id).toBe('page-1');
    expect(store.pagesBySlug['kependudukan']?.id).toBe('page-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.sections.map((section) => section.sectionId)).toEqual(['sec-1']);
  });

  it('records an error when the hierarchy request fails', async () => {
    globalThis.fetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ error: 'boom' }, false, 500)) as typeof fetch;

    const store = usePagesStore();
    await store.fetchHierarchy();

    expect(store.hierarchyError).toBe(
      `Gagal memuat struktur halaman. ${READ_USER_MESSAGES.server}`,
    );
    expect(store.hierarchyError).not.toContain('boom');
    expect(store.isLoaded).toBe(false);
  });

  it('falls back to a neutral label for unknown sections', () => {
    const store = usePagesStore();

    expect(store.breadcrumbParts('missing')).toEqual([]);
    expect(store.pageTitleFor('missing')).toBeNull();
    expect(store.labelFor('missing')).toBe('Tanpa bagian');
    expect(store.labelFor(null)).toBe('Tanpa bagian');
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
    await Promise.all([
      store.fetchPageBySlug('kependudukan'),
      store.fetchPageBySlug('kependudukan'),
    ]);

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

  it('keeps the outcome of each slug apart, so one topic failing never marks another', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/hilang')) {
        return { ok: false, status: 404, json: async () => ({}) } as Response;
      }
      if (url.endsWith('/rusak')) {
        return { ok: false, status: 500, json: async () => ({}) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ page: samplePage }) } as Response;
    });

    const store = usePagesStore();
    await store.fetchPageBySlug('hilang');
    await store.fetchPageBySlug('rusak');
    await store.fetchPageBySlug('kependudukan');

    expect(store.notFoundBySlug['hilang']).toBe(true);
    expect(store.notFoundBySlug['rusak']).toBeUndefined();
    expect(store.errorsBySlug['rusak']).toBe(`Gagal memuat halaman. ${READ_USER_MESSAGES.server}`);
    expect(store.errorsBySlug['hilang']).toBeUndefined();
    expect(store.errorsBySlug['kependudukan']).toBeUndefined();
    expect(store.notFoundBySlug['kependudukan']).toBeUndefined();
  });

  it('clears a slug failure when a later request for the same slug succeeds', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async () => {
      calls += 1;
      return calls === 1
        ? ({ ok: false, status: 500, json: async () => ({}) } as Response)
        : ({ ok: true, status: 200, json: async () => ({ page: samplePage }) } as Response);
    });

    const store = usePagesStore();
    await store.fetchPageBySlug('kependudukan');
    expect(store.errorsBySlug['kependudukan']).toBeTruthy();

    await store.fetchPageBySlug('kependudukan');
    expect(store.errorsBySlug['kependudukan']).toBeUndefined();
    expect(store.pagesBySlug['kependudukan']).toEqual(samplePage);
  });

  it('records a network error without throwing', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    globalThis.fetch = fetchMock;

    const store = usePagesStore();
    const result = await store.fetchPageBySlug('kependudukan');

    expect(result).toBeNull();
    expect(store.error).toBe(`Gagal memuat halaman. ${READ_USER_MESSAGES.network}`);
    expect(store.isLoading).toBe(false);
  });

  it('synchronizes page title, sortOrder, and chapterCount into summary list on fetchPageBySlug when loaded', async () => {
    const store = usePagesStore();
    store.pages = [
      {
        id: 'page-1',
        slug: 'kependudukan',
        title: 'Judul Lama',
        sortOrder: 1,
        chapterCount: 1,
      },
      {
        id: 'page-2',
        slug: 'pendidikan',
        title: 'Pendidikan',
        sortOrder: 2,
        chapterCount: 3,
      },
    ];
    store.isLoaded = true;

    const updatedPage = {
      ...samplePage,
      title: 'Judul Baru Kependudukan',
      sortOrder: 5,
      chapters: [
        ...samplePage.chapters,
        {
          id: 'chap-2',
          slug: 'komposisi',
          number: '02',
          title: 'Komposisi Penduduk',
          sortOrder: 2,
          sections: [],
        },
      ],
    };

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      json({ page: updatedPage }),
    );

    await store.fetchPageBySlug('kependudukan', true);

    const summary = store.pages.find((p) => p.slug === 'kependudukan');
    expect(summary).toEqual({
      id: 'page-1',
      slug: 'kependudukan',
      title: 'Judul Baru Kependudukan',
      sortOrder: 5,
      chapterCount: 2,
    });
    // Other pages remain untouched
    expect(store.pages.find((p) => p.slug === 'pendidikan')?.title).toBe('Pendidikan');
  });

  it('does not touch pages when isLoaded is false', async () => {
    const store = usePagesStore();
    store.pages = [];
    store.isLoaded = false;

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      json({ page: samplePage }),
    );

    await store.fetchPageBySlug('kependudukan', true);

    expect(store.pages).toEqual([]);
  });

  describe('a forced hierarchy reload while a request is already running', () => {
    function pagesBody(title: string) {
      return {
        pages: [
          {
            id: 'p1',
            slug: 'kependudukan',
            title,
            sortOrder: 0,
            chapters: [],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      };
    }

    function deferredFetch() {
      const resolvers: Array<(response: Response) => void> = [];
      const fetchMock = vi.fn<typeof fetch>(
        () => new Promise<Response>((resolve) => resolvers.push(resolve)),
      );
      return {
        fetchMock,
        // The request starts a tick after the call (the client awaits first), so wait for it.
        resolve: async (index: number, title: string) => {
          await vi.waitFor(() => expect(resolvers[index]).toBeDefined());
          resolvers[index]!(json(pagesBody(title)));
        },
      };
    }

    it('waits for the running request and then fetches again, so the result is newer than the save', async () => {
      const { fetchMock, resolve } = deferredFetch();
      vi.stubGlobal('fetch', fetchMock);
      const store = usePagesStore();

      const started = store.fetchHierarchy();
      const forced = store.fetchHierarchy(true);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

      await resolve(0, 'Judul lama');
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      await started;

      await resolve(1, 'Judul baru');
      await forced;
      expect(store.pages[0]!.title).toBe('Judul baru');
      expect(store.pagesBySlug['kependudukan']!.title).toBe('Judul baru');
    });

    it('shares one follow-up fetch between concurrent forced callers', async () => {
      const { fetchMock, resolve } = deferredFetch();
      vi.stubGlobal('fetch', fetchMock);
      const store = usePagesStore();

      void store.fetchHierarchy();
      const calls = [
        store.fetchHierarchy(true),
        store.fetchHierarchy(true),
        store.fetchHierarchy(true),
      ];
      await resolve(0, 'lama');
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      await resolve(1, 'baru');
      await Promise.all(calls);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(store.pages[0]!.title).toBe('baru');
    });

    it('keeps sharing the running request for a plain caller', async () => {
      const { fetchMock, resolve } = deferredFetch();
      vi.stubGlobal('fetch', fetchMock);
      const store = usePagesStore();

      const first = store.fetchHierarchy();
      const second = store.fetchHierarchy();
      await resolve(0, 'x');
      await Promise.all([first, second]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
