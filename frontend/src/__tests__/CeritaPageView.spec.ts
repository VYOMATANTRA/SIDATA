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
});
