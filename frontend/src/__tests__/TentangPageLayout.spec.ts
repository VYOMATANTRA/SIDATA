import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import TentangPageLayout from '../components/tentang/TentangPageLayout.vue';
import PublicLayout from '../layouts/PublicLayout.vue';
import router from '../router/index';

async function createTestRouter() {
  const testRouter = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  });
  await testRouter.push('/tentang/kelurahan-manggar');
  await testRouter.isReady();
  return testRouter;
}

describe('TentangPageLayout (compatibility wrapper)', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('wraps content in the public shell when mounted on its own', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const testRouter = await createTestRouter();

    const wrapper = mount(TentangPageLayout, {
      slots: { default: () => h('p', { 'data-test': 'content' }, 'Isi halaman') },
      global: { plugins: [pinia, testRouter] },
    });
    await flushPromises();

    expect(wrapper.findAll('main')).toHaveLength(1);
    expect(wrapper.find('main#main-content [data-test="content"]').exists()).toBe(true);
    expect(wrapper.find('header nav[aria-label="Navigasi Utama"]').exists()).toBe(true);
    expect(wrapper.find('a[href="#main-content"]').exists()).toBe(true);
    expect(wrapper.find('footer').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders only its content (no second navbar, main, skip link or footer) inside the shell', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const testRouter = await createTestRouter();

    const wrapper = mount(PublicLayout, {
      slots: {
        default: () =>
          h(TentangPageLayout, null, {
            default: () => h('p', { 'data-test': 'content' }, 'Isi halaman'),
          }),
      },
      global: { plugins: [pinia, testRouter] },
    });
    await flushPromises();

    expect(wrapper.findAll('main')).toHaveLength(1);
    expect(wrapper.findAll('header')).toHaveLength(1);
    expect(wrapper.findAll('footer')).toHaveLength(1);
    expect(wrapper.findAll('a[href="#main-content"]')).toHaveLength(1);
    expect(wrapper.find('main [data-test="content"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('public shell route metadata', () => {
  const byName = (name: string) => router.getRoutes().find((r) => r.name === name);

  it.each([
    'home',
    'cerita-page',
    'tentang-kelurahan-manggar',
    'tentang-desa-cantik',
    'tentang-vyomatantra',
    'permintaan-data',
    'ketua-rt',
    'peta',
    'publikasi',
  ])('mounts %s inside the public layout', (name) => {
    expect(byName(name)?.meta.layout).toBe('public');
  });

  it('overlays the header on Home only', () => {
    const overlayRoutes = router
      .getRoutes()
      .filter((r) => r.meta.headerOverlay)
      .map((r) => r.name);
    expect(overlayRoutes).toEqual(['home']);
  });

  it.each(['login', 'register', 'setup-password', 'auth-callback', 'dashboard', 'admin-shell'])(
    'keeps %s outside the public layout',
    (name) => {
      expect(byName(name)?.meta.layout).toBeUndefined();
    },
  );
});
