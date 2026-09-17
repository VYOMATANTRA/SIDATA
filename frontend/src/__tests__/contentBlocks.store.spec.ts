import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  useContentBlocksStore,
  DEFAULT_HERO_BLOCK,
  DEFAULT_SAMBUTAN_BLOCK,
  DEFAULT_HIGHLIGHTS_BLOCK,
} from '../stores/contentBlocks.store';

describe('contentBlocks store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('initializes with default content blocks', () => {
    const store = useContentBlocksStore();

    expect(store.hero.slug).toBe('landing-hero');
    expect(store.hero.title).toBe(DEFAULT_HERO_BLOCK.title);
    expect(store.sambutanLurah.slug).toBe('landing-sambutan-lurah');
    expect(store.sambutanLurah.title).toBe(DEFAULT_SAMBUTAN_BLOCK.title);
    expect(store.highlights.slug).toBe('landing-highlights');
    expect(store.highlights.title).toBe(DEFAULT_HIGHLIGHTS_BLOCK.title);
    expect(store.isLoading).toBe(false);
    expect(store.isLoaded).toBe(false);
  });

  it('fetchBlocks loads content blocks from backend and updates store', async () => {
    const mockBlocks = [
      {
        id: '1',
        sectionId: null,
        type: 'hero',
        slug: 'landing-hero',
        title: 'Judul Hero Baru Dinamis',
        body: 'Narasi hero baru dari server.',
        metadata: { badge: 'Resmi Baru', ctaText: 'Lihat Data', ctaLink: '#potensi' },
        sortOrder: null,
        updatedAt: '2026-09-17T00:00:00.000Z',
      },
    ];

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ blocks: mockBlocks }),
    } as Response);
    globalThis.fetch = fetchMock;

    const store = useContentBlocksStore();
    await store.fetchBlocks();

    expect(store.hero.title).toBe('Judul Hero Baru Dinamis');
    expect(store.isLoaded).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/content-blocks');
  });

  it('dedupes concurrent fetchBlocks calls into a single network request', async () => {
    let callCount = 0;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({ blocks: [] }),
      } as Response;
    });
    globalThis.fetch = fetchMock;

    const store = useContentBlocksStore();
    await Promise.all([store.fetchBlocks(), store.fetchBlocks()]);

    expect(callCount).toBe(1);
  });

  it('gracefully handles network error and keeps fallback defaults', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('Network error'));
    globalThis.fetch = fetchMock;

    const store = useContentBlocksStore();
    await store.fetchBlocks();

    expect(store.error).toBe('Network error');
    expect(store.hero.title).toBe(DEFAULT_HERO_BLOCK.title);
    expect(store.isLoading).toBe(false);
  });

  it('updateBlock sends PATCH request with CSRF token and updates store block', async () => {
    const updatedBlock = {
      id: '1',
      sectionId: null,
      type: 'hero',
      slug: 'landing-hero',
      title: 'Judul Diperbarui Editor',
      body: 'Isi baru',
      metadata: null,
      sortOrder: null,
      updatedAt: '2026-09-17T12:00:00.000Z',
    };

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('csrf-token')) {
        return {
          ok: true,
          json: async () => ({ csrfToken: 'test-csrf-token' }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ block: updatedBlock }),
      } as Response;
    });
    globalThis.fetch = fetchMock;

    const store = useContentBlocksStore();
    const result = await store.updateBlock('landing-hero', {
      title: 'Judul Diperbarui Editor',
      body: 'Isi baru',
    });

    expect(result.title).toBe('Judul Diperbarui Editor');
    expect(store.hero.title).toBe('Judul Diperbarui Editor');
  });
});
