import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  useContentBlocksStore,
  DEFAULT_HERO_BLOCK,
  DEFAULT_SAMBUTAN_BLOCK,
  DEFAULT_HIGHLIGHTS_BLOCK,
} from '../stores/contentBlocks.store';
import { useAuthStore } from '../stores/auth';
import { READ_USER_MESSAGES, classifyFailure } from '../utils/userMessages';

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
        metadata: { backgroundImage: 'https://example.com/hero.jpg' },
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

  it('keeps figure blocks out of the editable (CMS card) list but still stores them', async () => {
    const blocks = [
      {
        id: 'p1',
        sectionId: 's1',
        type: 'prose',
        slug: 'pembuka',
        title: 'Pembuka',
        body: 'Isi.',
        metadata: null,
        sortOrder: 0,
        updatedAt: '2026-09-17T00:00:00.000Z',
      },
      {
        id: 'f1',
        sectionId: 's1',
        type: 'figure',
        slug: 'figure-s1',
        title: null,
        body: '',
        metadata: { kind: 'photo', photos: [{ mediaId: 'm1', alt: 'Balai' }] },
        sortOrder: null,
        updatedAt: '2026-09-17T00:00:00.000Z',
      },
    ];
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ blocks }),
    } as Response);

    const store = useContentBlocksStore();
    await store.fetchBlocks();

    expect(store.editableBlocks.map((block) => block.slug)).toEqual(['pembuka']);
    expect(store.serverBlocks['figure-s1']).toBeDefined();
  });

  describe('a forced reload while a request is already running', () => {
    function block(body: string) {
      return {
        id: '1',
        sectionId: 's1',
        type: 'prose',
        slug: 'pembuka',
        title: 'Pembuka',
        body,
        metadata: null,
        sortOrder: 0,
        updatedAt: '2026-09-17T00:00:00.000Z',
      };
    }

    function deferredFetch(): {
      fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
      resolve: (index: number, body: string) => void;
    } {
      const resolvers: Array<(response: Response) => void> = [];
      const fetchMock = vi.fn<typeof fetch>(
        () => new Promise<Response>((resolve) => resolvers.push(resolve)),
      );
      return {
        fetchMock,
        resolve: (index, body) =>
          resolvers[index]!({
            ok: true,
            json: async () => ({ blocks: [block(body)] }),
          } as Response),
      };
    }

    it('waits for the running request, then fetches again so the result is newer than the save', async () => {
      const { fetchMock, resolve } = deferredFetch();
      globalThis.fetch = fetchMock;
      const store = useContentBlocksStore();

      const started = store.fetchBlocks(); // started before the save: will return old data
      const forced = store.fetchBlocks(true); // asked for after the save
      expect(fetchMock).toHaveBeenCalledTimes(1);

      resolve(0, 'lama (sebelum disimpan)');
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      await started;
      // The old answer is not what the forced caller waits for.
      let forcedDone = false;
      void forced.then(() => (forcedDone = true));
      await Promise.resolve();
      expect(forcedDone).toBe(false);

      resolve(1, 'baru (setelah disimpan)');
      await forced;
      expect(store.serverBlocks['pembuka']!.body).toBe('baru (setelah disimpan)');
    });

    it('shares one follow-up fetch between concurrent forced callers', async () => {
      const { fetchMock, resolve } = deferredFetch();
      globalThis.fetch = fetchMock;
      const store = useContentBlocksStore();

      void store.fetchBlocks();
      const a = store.fetchBlocks(true);
      const b = store.fetchBlocks(true);
      const c = store.fetchBlocks(true);

      resolve(0, 'lama');
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      resolve(1, 'baru');
      await Promise.all([a, b, c]);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(store.serverBlocks['pembuka']!.body).toBe('baru');
    });

    it('still lets a plain (not forced) caller share the running request', async () => {
      const { fetchMock, resolve } = deferredFetch();
      globalThis.fetch = fetchMock;
      const store = useContentBlocksStore();

      const first = store.fetchBlocks();
      const second = store.fetchBlocks();
      resolve(0, 'x');
      await Promise.all([first, second]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does nothing extra when no request is running', async () => {
      const { fetchMock, resolve } = deferredFetch();
      globalThis.fetch = fetchMock;
      const store = useContentBlocksStore();

      const forced = store.fetchBlocks(true);
      resolve(0, 'x');
      await forced;

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // The running request finishing and its follow-up starting are a few microtasks apart, and
    // nothing is in flight in between. A second forced caller can land anywhere in that window, so
    // sweep its arrival: whenever it comes, two requests must never run at once (the older answer
    // could land last and overwrite the newer data) and the loading flag must not drop early.
    it.each(Array.from({ length: 16 }, (_, ticks) => ticks))(
      'never overlaps requests when a second forced caller arrives %i ticks after the first answer',
      async (ticks) => {
        let active = 0;
        let maxActive = 0;
        const resolvers: Array<(response: Response) => void> = [];
        const fetchMock = vi.fn<typeof fetch>(
          () =>
            new Promise<Response>((resolve) => {
              active += 1;
              maxActive = Math.max(maxActive, active);
              resolvers.push((response) => {
                active -= 1;
                resolve(response);
              });
            }),
        );
        globalThis.fetch = fetchMock;
        const store = useContentBlocksStore();
        const answer = (index: number): Response =>
          ({ ok: true, json: async () => ({ blocks: [block(`v${index}`)] }) }) as Response;

        const running = store.fetchBlocks();
        const queued = store.fetchBlocks(true);
        expect(resolvers).toHaveLength(1);

        resolvers[0]!(answer(0));
        for (let i = 0; i < ticks; i += 1) {
          await Promise.resolve();
          // The follow-up is queued the whole time, so the screen must still read as loading.
          expect(store.isLoading).toBe(true);
        }
        const late = store.fetchBlocks(true);

        // Answer every request in the order it started, until all callers are done.
        let answered = 1;
        const callers = Promise.all([running, queued, late]);
        let settled = false;
        void callers.then(() => (settled = true));
        for (let guard = 0; guard < 50 && !settled; guard += 1) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          while (answered < resolvers.length) {
            resolvers[answered]!(answer(answered));
            answered += 1;
          }
        }
        await callers;

        expect(maxActive).toBe(1);
        // The newest request's answer is the one that stays.
        expect(store.serverBlocks['pembuka']!.body).toBe(`v${fetchMock.mock.calls.length - 1}`);
        expect(store.isLoading).toBe(false);
      },
    );
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
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    globalThis.fetch = fetchMock;

    const store = useContentBlocksStore();
    await store.fetchBlocks();

    expect(store.error).toBe(`Gagal memuat blok konten. ${READ_USER_MESSAGES.network}`);
    expect(store.hero.title).toBe(DEFAULT_HERO_BLOCK.title);
    expect(store.isLoading).toBe(false);
  });

  it('updateBlock sends PATCH request with CSRF token and auth header and updates store block', async () => {
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

    let capturedInit: RequestInit | undefined;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('csrf-token')) {
        return {
          ok: true,
          json: async () => ({ csrfToken: 'test-csrf-token' }),
        } as Response;
      }
      capturedInit = init;
      return {
        ok: true,
        json: async () => ({ block: updatedBlock }),
      } as Response;
    });
    globalThis.fetch = fetchMock;

    const authStore = useAuthStore();
    authStore.accessToken = 'mock-access-token';

    const store = useContentBlocksStore();
    const result = await store.updateBlock('landing-hero', {
      title: 'Judul Diperbarui Editor',
      body: 'Isi baru',
    });

    expect(result.title).toBe('Judul Diperbarui Editor');
    expect(store.hero.title).toBe('Judul Diperbarui Editor');
    const headers = new Headers(capturedInit?.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('x-csrf-token')).toBe('test-csrf-token');
    expect(headers.get('Authorization')).toBe('Bearer mock-access-token');
    expect(capturedInit?.credentials).toBe('include');
  });

  it('updateBlock omits Authorization header when user is unauthenticated', async () => {
    const updatedBlock = {
      id: '1',
      sectionId: null,
      type: 'hero',
      slug: 'landing-hero',
      title: 'Judul Publik',
      body: 'Isi publik',
      metadata: null,
      sortOrder: null,
      updatedAt: '2026-09-17T12:00:00.000Z',
    };

    let capturedInit: RequestInit | undefined;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('csrf-token')) {
        return {
          ok: true,
          json: async () => ({ csrfToken: 'test-csrf-token' }),
        } as Response;
      }
      capturedInit = init;
      return {
        ok: true,
        json: async () => ({ block: updatedBlock }),
      } as Response;
    });
    globalThis.fetch = fetchMock;

    const authStore = useAuthStore();
    authStore.accessToken = null;

    const store = useContentBlocksStore();
    await store.updateBlock('landing-hero', {
      title: 'Judul Publik',
      body: 'Isi publik',
    });

    const headers = new Headers(capturedInit?.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('x-csrf-token')).toBe('test-csrf-token');
    expect(headers.get('Authorization')).toBeNull();
  });

  it('updateBlock sends expectedUpdatedAt as the stale-write precondition', async () => {
    let sentBody: Record<string, unknown> | undefined;
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      if (String(input).includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response;
      }
      sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return {
        ok: true,
        json: async () => ({
          block: {
            id: '1',
            sectionId: null,
            type: 'hero',
            slug: 'landing-hero',
            title: 'T',
            body: 'B',
            metadata: null,
            sortOrder: null,
            updatedAt: '2026-09-18T00:00:00.000Z',
          },
        }),
      } as Response;
    });

    const store = useContentBlocksStore();
    await store.updateBlock('landing-hero', {
      title: 'T',
      body: 'B',
      expectedUpdatedAt: '2026-09-17T00:00:00.000Z',
    });

    expect(sentBody).toEqual({
      title: 'T',
      body: 'B',
      expectedUpdatedAt: '2026-09-17T00:00:00.000Z',
    });
    expect(store.hero.updatedAt).toBe('2026-09-18T00:00:00.000Z');
  });

  it('updateBlock surfaces a stale-write conflict as a stale failure and keeps the stored block', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (String(input).includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response;
      }
      return {
        ok: false,
        status: 409,
        json: async () => ({
          error: 'Blok konten telah diubah oleh pengguna lain. Muat ulang data lalu coba lagi.',
          code: 'STALE_WRITE',
          details: { currentUpdatedAt: '2026-09-18T00:00:00.000Z' },
        }),
      } as Response;
    });

    const store = useContentBlocksStore();
    const before = store.hero.title;
    const failure = await store
      .updateBlock('landing-hero', {
        title: 'Draf',
        body: 'Draf',
        expectedUpdatedAt: '2026-09-17T00:00:00.000Z',
      })
      .catch((error: unknown) => error);

    expect(classifyFailure(failure).kind).toBe('stale');
    expect(store.hero.title).toBe(before);
  });
});
