import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { usePagesStore } from '../stores/pages.store';

function json(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return { ok, status, json: async () => body } as Response;
}

describe('pages store', () => {
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
