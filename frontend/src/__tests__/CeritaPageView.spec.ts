import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import CeritaPageView from '../views/CeritaPageView.vue';

function makePage(slug: string, title: string) {
  return {
    id: `page-${slug}`,
    slug,
    title,
    sortOrder: 1,
    chapters: [
      {
        id: `chap-${slug}-1`,
        slug: `${slug}-bab-1`,
        number: '01',
        title: 'Bab Pertama',
        sortOrder: 1,
        sections: [{ id: `sec-${slug}-1`, slug: 'seksi-1', title: null, sortOrder: 1 }],
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

async function setupAndPush(slug: string) {
  const pinia = createPinia();
  setActivePinia(pinia);

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/cerita/:slug', component: CeritaPageView }],
  });

  await router.push(`/cerita/${slug}`);
  await router.isReady();
  return { pinia, router };
}

describe('CeritaPageView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['kependudukan', 'Kependudukan'],
    ['pendidikan', 'Pendidikan'],
    ['kesehatan', 'Kesehatan'],
  ])('renders the page title and chapter sections for /cerita/%s', async (slug, title) => {
    const page = makePage(slug, title);
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/pages/')) {
        return { ok: true, status: 200, json: async () => ({ page }) } as Response;
      }
      if (url.startsWith('/api/content-blocks')) {
        return { ok: true, json: async () => ({ blocks: [] }) } as Response;
      }
      if (url.startsWith('/api/indicators')) {
        return { ok: true, json: async () => ({ indicators: [] }) } as Response;
      }
      if (url.startsWith('/api/indicator-tables')) {
        return { ok: true, json: async () => ({ tables: [] }) } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { pinia, router } = await setupAndPush(slug);
    const wrapper = mount(CeritaPageView, { global: { plugins: [pinia, router] } });
    await flushPromises();

    expect(wrapper.find('h1').text()).toBe(title);
    expect(wrapper.find('[data-test="chapter-section"]').exists()).toBe(true);
    expect(wrapper.find('a[href="#main-content"]').exists()).toBe(true);
    expect(wrapper.find('main#main-content').exists()).toBe(true);
  });

  it('shows a loading state before the page resolves', async () => {
    let resolveFetch!: (value: Response) => void;
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const { pinia, router } = await setupAndPush('kependudukan');
    const wrapper = mount(CeritaPageView, { global: { plugins: [pinia, router] } });

    expect(wrapper.find('[data-test="cerita-loading"]').exists()).toBe(true);

    resolveFetch({ ok: true, status: 200, json: async () => ({ page: null }) } as Response);
    await flushPromises();
  });

  it('shows a not-found state for an unknown slug', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/pages/')) {
        return { ok: false, status: 404, json: async () => ({ error: 'Halaman tidak ditemukan' }) } as Response;
      }
      return { ok: true, json: async () => ({ blocks: [] }) } as Response;
    });

    const { pinia, router } = await setupAndPush('tidak-ada-halaman');
    const wrapper = mount(CeritaPageView, { global: { plugins: [pinia, router] } });
    await flushPromises();

    expect(wrapper.find('[data-test="cerita-not-found"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="cerita-not-found"]').text()).toContain('Halaman tidak ditemukan');
  });

  it('shows an error state with a retry button on a server error, instead of a blank main', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/pages/')) {
        return { ok: false, status: 500, json: async () => ({ error: 'boom' }) } as Response;
      }
      return { ok: true, json: async () => ({ blocks: [] }) } as Response;
    });

    const { pinia, router } = await setupAndPush('kependudukan');
    const wrapper = mount(CeritaPageView, { global: { plugins: [pinia, router] } });
    await flushPromises();

    expect(wrapper.find('main#main-content h1').exists()).toBe(true);
    expect(wrapper.find('[data-test="cerita-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="cerita-retry"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="cerita-not-found"]').exists()).toBe(false);
  });

  it('retries the fetch when the retry button is clicked and recovers', async () => {
    const page = makePage('kependudukan', 'Kependudukan');
    let callCount = 0;
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/pages/')) {
        callCount++;
        if (callCount === 1) {
          return { ok: false, status: 500, json: async () => ({ error: 'boom' }) } as Response;
        }
        return { ok: true, status: 200, json: async () => ({ page }) } as Response;
      }
      if (url.startsWith('/api/indicators')) {
        return { ok: true, json: async () => ({ indicators: [] }) } as Response;
      }
      if (url.startsWith('/api/indicator-tables')) {
        return { ok: true, json: async () => ({ tables: [] }) } as Response;
      }
      return { ok: true, json: async () => ({ blocks: [] }) } as Response;
    });

    const { pinia, router } = await setupAndPush('kependudukan');
    const wrapper = mount(CeritaPageView, { global: { plugins: [pinia, router] } });
    await flushPromises();

    expect(wrapper.find('[data-test="cerita-error"]').exists()).toBe(true);

    await wrapper.find('[data-test="cerita-retry"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-test="cerita-error"]').exists()).toBe(false);
    expect(wrapper.find('h1').text()).toBe('Kependudukan');
  });

  it('renders every prose block for a section in sort_order, not just the last one', async () => {
    const page = makePage('kependudukan', 'Kependudukan');
    const sectionId = page.chapters[0]!.sections[0]!.id;

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/pages/')) {
        return { ok: true, status: 200, json: async () => ({ page }) } as Response;
      }
      if (url.startsWith('/api/content-blocks')) {
        return {
          ok: true,
          json: async () => ({
            blocks: [
              // Deliberately out of sort_order and with the later block listed first, so a
              // last-write-wins map would both drop the first paragraph and show them reversed.
              {
                id: 'block-b',
                sectionId,
                type: 'prose',
                slug: 'kedua',
                title: null,
                body: 'Paragraf kedua.',
                metadata: null,
                sortOrder: 1,
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
              {
                id: 'block-a',
                sectionId,
                type: 'prose',
                slug: 'pertama',
                title: null,
                body: 'Paragraf pertama.',
                metadata: null,
                sortOrder: 0,
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
            ],
          }),
        } as Response;
      }
      if (url.startsWith('/api/indicators')) {
        return { ok: true, json: async () => ({ indicators: [] }) } as Response;
      }
      if (url.startsWith('/api/indicator-tables')) {
        return { ok: true, json: async () => ({ tables: [] }) } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { pinia, router } = await setupAndPush('kependudukan');
    const wrapper = mount(CeritaPageView, { global: { plugins: [pinia, router] } });
    await flushPromises();

    const paragraphs = wrapper.findAll('[data-test="section-prose"]');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.text()).toBe('Paragraf pertama.');
    expect(paragraphs[1]?.text()).toBe('Paragraf kedua.');
  });

  it('resets the active chapter when navigating to a different Cerita page', async () => {
    const pageA = makePage('kependudukan', 'Kependudukan');
    const pageB = makePage('pendidikan', 'Pendidikan');

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/pages/kependudukan')) {
        return { ok: true, status: 200, json: async () => ({ page: pageA }) } as Response;
      }
      if (url.includes('/api/pages/pendidikan')) {
        return { ok: true, status: 200, json: async () => ({ page: pageB }) } as Response;
      }
      if (url.startsWith('/api/indicators')) {
        return { ok: true, json: async () => ({ indicators: [] }) } as Response;
      }
      if (url.startsWith('/api/indicator-tables')) {
        return { ok: true, json: async () => ({ tables: [] }) } as Response;
      }
      return { ok: true, json: async () => ({ blocks: [] }) } as Response;
    });

    const { pinia, router } = await setupAndPush('kependudukan');
    const wrapper = mount(CeritaPageView, { global: { plugins: [pinia, router] } });
    await flushPromises();

    const firstPageChapterLink = () => wrapper.find('[data-test="chapter-toc-rail"] [aria-current="true"]');
    expect(firstPageChapterLink().exists()).toBe(true);
    expect(firstPageChapterLink().attributes('href')).toBe('#kependudukan-bab-1');

    await router.push('/cerita/pendidikan');
    await flushPromises();

    // Must highlight pendidikan's own chapter, never stay stuck on kependudukan's id (which no
    // longer matches anything in the new page's chapter list, so nothing would be highlighted).
    const secondPageChapterLink = () => wrapper.find('[data-test="chapter-toc-rail"] [aria-current="true"]');
    expect(secondPageChapterLink().exists()).toBe(true);
    expect(secondPageChapterLink().attributes('href')).toBe('#pendidikan-bab-1');
  });

  it('does not show a stale error for a cached page after a different page failed to load', async () => {
    // Repro: open B (succeeds, gets cached) -> open A (fails with 500) -> go back to B.
    // pagesStore.error is a single shared flag; its cache-hit path for B must not leave A's
    // error visible once B (already cached) resolves successfully again.
    const pageB = makePage('kesehatan', 'Kesehatan');

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/pages/kesehatan')) {
        return { ok: true, status: 200, json: async () => ({ page: pageB }) } as Response;
      }
      if (url.includes('/api/pages/kependudukan')) {
        return { ok: false, status: 500, json: async () => ({ error: 'boom' }) } as Response;
      }
      if (url.startsWith('/api/indicators')) {
        return { ok: true, json: async () => ({ indicators: [] }) } as Response;
      }
      if (url.startsWith('/api/indicator-tables')) {
        return { ok: true, json: async () => ({ tables: [] }) } as Response;
      }
      return { ok: true, json: async () => ({ blocks: [] }) } as Response;
    });

    const { pinia, router } = await setupAndPush('kesehatan');
    const wrapper = mount(CeritaPageView, { global: { plugins: [pinia, router] } });
    await flushPromises();

    expect(wrapper.find('h1').text()).toBe('Kesehatan');
    expect(wrapper.find('[data-test="cerita-error"]').exists()).toBe(false);

    await router.push('/cerita/kependudukan');
    await flushPromises();

    expect(wrapper.find('[data-test="cerita-error"]').exists()).toBe(true);

    await router.push('/cerita/kesehatan');
    await flushPromises();

    expect(wrapper.find('[data-test="cerita-error"]').exists()).toBe(false);
    expect(wrapper.find('h1').text()).toBe('Kesehatan');
  });

  it('discards a stale, out-of-order page response instead of letting it clear isLoading for the page actually in view', async () => {
    // A (kependudukan), B (pendidikan), and C (kesehatan) are all navigated to in quick
    // succession, all three requests still in flight. B then resolves out of order (after we've
    // already moved on to C) — a superseded request settling late must not touch isLoading or
    // run scroll-spy setup on C's behalf, or <main> would briefly show neither a loading state
    // nor content (isLoading false, but page for the current slug still unresolved).
    let resolveB!: (value: Response) => void;
    const pendingB = new Promise<Response>((resolve) => {
      resolveB = resolve;
    });
    let resolveC!: (value: Response) => void;
    const pendingC = new Promise<Response>((resolve) => {
      resolveC = resolve;
    });

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/pages/kependudukan')) {
        return new Promise<Response>(() => {}); // never resolves in this test
      }
      if (url.includes('/api/pages/pendidikan')) {
        return pendingB;
      }
      if (url.includes('/api/pages/kesehatan')) {
        return pendingC;
      }
      if (url.startsWith('/api/indicators')) {
        return { ok: true, json: async () => ({ indicators: [] }) } as Response;
      }
      if (url.startsWith('/api/indicator-tables')) {
        return { ok: true, json: async () => ({ tables: [] }) } as Response;
      }
      return { ok: true, json: async () => ({ blocks: [] }) } as Response;
    });

    const { pinia, router } = await setupAndPush('kependudukan');
    const wrapper = mount(CeritaPageView, { global: { plugins: [pinia, router] } });

    await router.push('/cerita/pendidikan');
    await flushPromises();
    await router.push('/cerita/kesehatan');
    await flushPromises();

    expect(wrapper.find('[data-test="cerita-loading"]').exists()).toBe(true);

    resolveB({
      ok: true,
      status: 200,
      json: async () => ({ page: makePage('pendidikan', 'Pendidikan') }),
    } as Response);
    await flushPromises();

    // Still kesehatan's request in flight — must still be loading, never a blank <main>.
    expect(wrapper.find('[data-test="cerita-loading"]').exists()).toBe(true);
    expect(wrapper.find('h1').exists()).toBe(false);

    resolveC({
      ok: true,
      status: 200,
      json: async () => ({ page: makePage('kesehatan', 'Kesehatan') }),
    } as Response);
    await flushPromises();

    expect(wrapper.find('[data-test="cerita-loading"]').exists()).toBe(false);
    expect(wrapper.find('h1').text()).toBe('Kesehatan');
  });
});
