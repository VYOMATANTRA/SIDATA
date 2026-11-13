import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { h } from 'vue';
import type { Pinia } from 'pinia';
import type { Router, RouteLocationNormalized } from 'vue-router';
import CeritaPageView from '../views/CeritaPageView.vue';
import PublicLayout from '../layouts/PublicLayout.vue';

const originalScrollIntoView = Element.prototype.scrollIntoView;

/** CeritaPageView as App.vue mounts it: inside the shared PublicLayout, which owns <main>. */
function mountInShell(pinia: Pinia, router: Router) {
  return mount(PublicLayout, {
    global: { plugins: [pinia, router] },
    slots: { default: () => h(CeritaPageView) },
  });
}

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

  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
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
    const wrapper = mountInShell(pinia, router);
    await flushPromises();

    expect(wrapper.findAll('h1')).toHaveLength(1);
    expect(wrapper.find('h1').text()).toBe(title);
    expect(wrapper.find('[data-test="chapter-section"]').exists()).toBe(true);
    // The shell owns the skip link and the single <main>; the view must not add its own.
    expect(wrapper.find('a[href="#main-content"]').exists()).toBe(true);
    expect(wrapper.findAll('main')).toHaveLength(1);
    expect(wrapper.find('main#main-content [data-test="cerita-hero"]').exists()).toBe(true);
    expect(wrapper.find('nav[aria-label="Navigasi Utama"]').exists()).toBe(true);
    expect(wrapper.find('footer').exists()).toBe(true);
  });

  describe('editorial headline and byline', () => {
    async function mountWith(extra: Record<string, unknown>) {
      const page = { ...makePage('kependudukan', 'Kependudukan'), ...extra };
      globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input);
        if (url.startsWith('/api/pages/')) {
          return { ok: true, status: 200, json: async () => ({ page }) } as Response;
        }
        if (url.startsWith('/api/content-blocks')) {
          return { ok: true, json: async () => ({ blocks: [] }) } as Response;
        }
        if (url.startsWith('/api/indicator-tables')) {
          return { ok: true, json: async () => ({ tables: [] }) } as Response;
        }
        if (url.startsWith('/api/indicators')) {
          return { ok: true, json: async () => ({ indicators: [] }) } as Response;
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });
      const { pinia, router } = await setupAndPush('kependudukan');
      const wrapper = mountInShell(pinia, router);
      await flushPromises();
      return wrapper;
    }

    it('shows the stored headline as the one h1 and the byline with its affiliation', async () => {
      const wrapper = await mountWith({
        headline: 'Potret Kependudukan Manggar',
        bylineAuthor: 'Tim Penyusun',
        bylineAffiliation: 'Kelurahan Manggar',
      });
      expect(wrapper.findAll('h1')).toHaveLength(1);
      expect(wrapper.find('h1').text()).toBe('Potret Kependudukan Manggar');
      expect(wrapper.find('[data-test="cerita-hero"]').text()).toContain('Kependudukan');
      const byline = wrapper.find('[data-test="cerita-byline"]');
      expect(byline.text()).toContain('Oleh Tim Penyusun');
      expect(byline.text()).toContain('Kelurahan Manggar');
    });

    it('shows neither when nothing is stored, and never a byline without an author', async () => {
      const plain = await mountWith({
        headline: null,
        bylineAuthor: null,
        bylineAffiliation: null,
      });
      expect(plain.find('h1').text()).toBe('Kependudukan');
      expect(plain.find('[data-test="cerita-byline"]').exists()).toBe(false);

      const orphan = await mountWith({
        bylineAuthor: null,
        bylineAffiliation: 'Kelurahan Manggar',
      });
      expect(orphan.find('[data-test="cerita-byline"]').exists()).toBe(false);
    });
  });

  it('scrolls to the #hash chapter once the chapters have rendered', async () => {
    const page = makePage('kependudukan', 'Kependudukan');
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/pages/')) {
        return { ok: true, status: 200, json: async () => ({ page }) } as Response;
      }
      const key = url.startsWith('/api/indicator-tables')
        ? 'tables'
        : url.startsWith('/api/indicators')
          ? 'indicators'
          : 'blocks';
      return { ok: true, json: async () => ({ [key]: [] }) } as Response;
    });
    const scrollIntoView = vi.fn<() => void>();
    Element.prototype.scrollIntoView = scrollIntoView;

    const { pinia, router } = await setupAndPush('kependudukan');
    await router.push('/cerita/kependudukan#kependudukan-bab-1');
    const wrapper = mount(CeritaPageView, {
      global: { plugins: [pinia, router] },
      attachTo: document.body,
    });
    await flushPromises();

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById('kependudukan-bab-1'));
    wrapper.unmount();
  });

  it('does not re-scroll to a stale savedPosition once chapters render', async () => {
    const page = makePage('kependudukan', 'Kependudukan');
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/pages/')) {
        return { ok: true, status: 200, json: async () => ({ page }) } as Response;
      }
      return {
        ok: true,
        json: async () => ({ blocks: [], indicators: [], tables: [] }),
      } as Response;
    });

    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    // Simulate popstate navigation with savedPosition
    const { scrollBehavior } = await import('@/router');
    const to = {
      path: '/cerita/kependudukan',
      hash: '',
      fullPath: '/cerita/kependudukan',
      name: 'cerita-page',
    } as unknown as RouteLocationNormalized;
    const from = { path: '/', hash: '', fullPath: '/' } as unknown as RouteLocationNormalized;
    const saved = { left: 0, top: 850 };
    expect(scrollBehavior(to, from, saved)).toEqual({ top: 0, left: 0, behavior: 'instant' });

    const { pinia, router } = await setupAndPush('kependudukan');
    const wrapper = mount(CeritaPageView, {
      global: { plugins: [pinia, router] },
      attachTo: document.body,
    });
    await flushPromises();

    expect(scrollToSpy).not.toHaveBeenCalled();
    scrollToSpy.mockRestore();
    wrapper.unmount();
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
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: 'Halaman tidak ditemukan' }),
        } as Response;
      }
      return { ok: true, json: async () => ({ blocks: [] }) } as Response;
    });

    const { pinia, router } = await setupAndPush('tidak-ada-halaman');
    const wrapper = mount(CeritaPageView, { global: { plugins: [pinia, router] } });
    await flushPromises();

    expect(wrapper.find('[data-test="cerita-not-found"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="cerita-not-found"]').text()).toContain(
      'Halaman tidak ditemukan',
    );
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
    const wrapper = mountInShell(pinia, router);
    await flushPromises();

    expect(wrapper.findAll('main#main-content h1')).toHaveLength(1);
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

    const firstPageChapterLink = () =>
      wrapper.find('[data-test="chapter-toc-rail"] [aria-current="true"]');
    expect(firstPageChapterLink().exists()).toBe(true);
    expect(firstPageChapterLink().attributes('href')).toBe('#kependudukan-bab-1');

    await router.push('/cerita/pendidikan');
    await flushPromises();

    // Must highlight pendidikan's own chapter, never stay stuck on kependudukan's id (which no
    // longer matches anything in the new page's chapter list, so nothing would be highlighted).
    const secondPageChapterLink = () =>
      wrapper.find('[data-test="chapter-toc-rail"] [aria-current="true"]');
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

  describe('anchor scroll behavior (127-2)', () => {
    let scrollSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      scrollSpy = vi.fn<() => void>();
      Element.prototype.scrollIntoView =
        scrollSpy as unknown as typeof Element.prototype.scrollIntoView;
    });

    afterEach(() => {
      Element.prototype.scrollIntoView = originalScrollIntoView;
      document.body.innerHTML = '';
    });

    function makeMultiChapterPage(slug: string) {
      return {
        id: `page-${slug}`,
        slug,
        title: 'Kependudukan',
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
          {
            id: `chap-${slug}-2`,
            slug: `${slug}-bab-2`,
            number: '02',
            title: 'Bab Kedua',
            sortOrder: 2,
            sections: [{ id: `sec-${slug}-2`, slug: 'seksi-2', title: null, sortOrder: 2 }],
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
    }

    function mockSuccess(page: ReturnType<typeof makeMultiChapterPage>) {
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
    }

    it('scrolls to chapter anchor once on first successful load with hash', async () => {
      const page = makeMultiChapterPage('kependudukan');
      mockSuccess(page);

      const pinia = createPinia();
      setActivePinia(pinia);
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/cerita/:slug', component: CeritaPageView }],
      });
      await router.push('/cerita/kependudukan#kependudukan-bab-1');
      await router.isReady();

      const wrapper = mount(CeritaPageView, {
        global: { plugins: [pinia, router] },
        attachTo: document.body,
      });
      await flushPromises();

      expect(scrollSpy).toHaveBeenCalledTimes(1);
      expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' });
      wrapper.unmount();
    });

    it('does not re-scroll on retry or reload of the same slug and hash', async () => {
      const page = makeMultiChapterPage('kependudukan');
      mockSuccess(page);

      const pinia = createPinia();
      setActivePinia(pinia);
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/cerita/:slug', component: CeritaPageView }],
      });
      await router.push('/cerita/kependudukan#kependudukan-bab-1');
      await router.isReady();

      const wrapper = mount(CeritaPageView, {
        global: { plugins: [pinia, router] },
        attachTo: document.body,
      });
      await flushPromises();
      expect(scrollSpy).toHaveBeenCalledTimes(1);

      // Trigger a reload / retry for the same slug and hash
      wrapper.vm.retryLoad();
      await flushPromises();

      expect(scrollSpy).toHaveBeenCalledTimes(1);
      wrapper.unmount();
    });

    it('scrolls to new anchor when hash changes on the same page', async () => {
      const page = makeMultiChapterPage('kependudukan');
      mockSuccess(page);

      const pinia = createPinia();
      setActivePinia(pinia);
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/cerita/:slug', component: CeritaPageView }],
      });
      await router.push('/cerita/kependudukan#kependudukan-bab-1');
      await router.isReady();

      const wrapper = mount(CeritaPageView, {
        global: { plugins: [pinia, router] },
        attachTo: document.body,
      });
      await flushPromises();
      expect(scrollSpy).toHaveBeenCalledTimes(1);

      await router.push('/cerita/kependudukan#kependudukan-bab-2');
      await flushPromises();

      expect(scrollSpy).toHaveBeenCalledTimes(2);
      wrapper.unmount();
    });

    it('scrolls to chapter anchor on first successful load after a failed attempt', async () => {
      const page = makeMultiChapterPage('kependudukan');
      let shouldFail = true;
      globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input);
        if (shouldFail && url.startsWith('/api/pages/')) {
          return { ok: false, status: 500, json: async () => ({}) } as Response;
        }
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

      const pinia = createPinia();
      setActivePinia(pinia);
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/cerita/:slug', component: CeritaPageView }],
      });
      await router.push('/cerita/kependudukan#kependudukan-bab-1');
      await router.isReady();

      const wrapper = mount(CeritaPageView, {
        global: { plugins: [pinia, router] },
        attachTo: document.body,
      });
      await flushPromises();

      expect(wrapper.find('[data-test="cerita-error"]').exists()).toBe(true);
      expect(scrollSpy).not.toHaveBeenCalled();

      // Now fix fetch and retry via "Coba lagi" button
      shouldFail = false;
      await wrapper.find('[data-test="cerita-error"] button').trigger('click');
      await flushPromises();

      expect(wrapper.find('[data-test="cerita-error"]').exists()).toBe(false);
      expect(scrollSpy).toHaveBeenCalledTimes(1);
      expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' });
      wrapper.unmount();
    });
  });
});
