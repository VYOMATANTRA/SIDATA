import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PublicNavigationMenu from '../components/common/PublicNavigationMenu.vue';
import PublicLayout from '../layouts/PublicLayout.vue';
import { useAuthStore } from '../stores/auth';
import { usePagesStore } from '../stores/pages.store';
import { FOOTER_STORY_LINKS } from '../config/publicNav';

const STUB = { template: '<div />' };

const PUBLIC_PATHS = [
  '/',
  '/cerita/:slug',
  '/publikasi',
  '/peta',
  '/ketua-rt',
  '/permintaan-data',
  '/tentang/kelurahan-manggar',
  '/tentang/desa-cantik',
  '/tentang/vyomatantra',
  '/login',
  '/admin',
];

type Role = 'user' | 'editor' | 'admin';

async function setup(options: { path?: string; role?: Role | null; paths?: string[] } = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: (options.paths ?? PUBLIC_PATHS).map((path) => ({ path, component: STUB })),
  });
  await router.push(options.path ?? '/');
  await router.isReady();

  const authStore = useAuthStore(pinia);
  if (options.role) {
    authStore.setAuth(
      { id: '1', email: `${options.role}@manggar.go.id`, role: options.role },
      'tok',
    );
  }

  const wrapper = mount(PublicNavigationMenu, { global: { plugins: [pinia, router] } });
  return { wrapper, router, pinia, authStore };
}

function accountText(wrapper: ReturnType<typeof mount>) {
  return wrapper.find('[data-test="menu-account"]').text();
}

describe('PublicNavigationMenu', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);
  });

  describe('structure', () => {
    it('uses plain links and buttons, not an application role="menu"', async () => {
      const { wrapper } = await setup();
      expect(wrapper.find('[role="menu"], [role="menuitem"]').exists()).toBe(false);
      expect(wrapper.findAll('a').length).toBeGreaterThan(0);
    });

    it('renders Beranda and the Cerita, Sumber Daya and Tentang groups, each as a labelled list', async () => {
      const { wrapper } = await setup();

      expect(wrapper.find('[data-test="menu-link-home"]').attributes('href')).toBe('/');
      for (const [id, label] of [
        ['cerita', 'Cerita'],
        ['sumber-daya', 'Sumber Daya'],
        ['tentang', 'Tentang'],
      ] as const) {
        const group = wrapper.find(`[data-test="menu-group-${id}"]`);
        expect(group.exists()).toBe(true);
        const list = group.find('ul');
        const labelEl = wrapper.find(`#${list.attributes('aria-labelledby')}`);
        expect(labelEl.text()).toBe(label);
      }
    });

    it('keeps the Ketua RT, Permintaan Data, Publikasi and Peta links in Sumber Daya', async () => {
      const { wrapper } = await setup();
      const hrefs = wrapper
        .findAll('[data-test="menu-group-sumber-daya"] a')
        .map((a) => a.attributes('href'));
      expect(hrefs.sort()).toEqual(['/ketua-rt', '/peta', '/permintaan-data', '/publikasi'].sort());
    });

    it('lists the three Tentang pages', async () => {
      const { wrapper } = await setup();
      const hrefs = wrapper
        .findAll('[data-test="menu-group-tentang"] a')
        .map((a) => a.attributes('href'));
      expect(hrefs).toEqual([
        '/tentang/kelurahan-manggar',
        '/tentang/desa-cantik',
        '/tentang/vyomatantra',
      ]);
    });

    it('hides links whose routes are not registered, and empty groups', async () => {
      const { wrapper } = await setup({ paths: ['/', '/publikasi', '/login'] });
      expect(wrapper.find('[data-test="menu-group-cerita"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="menu-group-tentang"]').exists()).toBe(false);
      expect(wrapper.find('a[href="/publikasi"]').exists()).toBe(true);
      expect(wrapper.find('a[href="/peta"]').exists()).toBe(false);
    });

    it('emits navigate when any link is followed', async () => {
      const { wrapper } = await setup();
      await wrapper.find('a[href="/peta"]').trigger('click');
      await wrapper.find('[data-test="menu-link-home"]').trigger('click');
      expect(wrapper.emitted('navigate')).toHaveLength(2);
    });
  });

  describe('active destination', () => {
    it('marks only the current destination with aria-current and its group as active', async () => {
      const { wrapper } = await setup({ path: '/tentang/desa-cantik' });

      const current = wrapper.findAll('a[aria-current="page"]');
      expect(current).toHaveLength(1);
      expect(current[0]!.attributes('href')).toBe('/tentang/desa-cantik');

      expect(wrapper.find('[data-test="menu-group-tentang"]').attributes('data-active')).toBe(
        'true',
      );
      expect(
        wrapper.find('[data-test="menu-group-sumber-daya"]').attributes('data-active'),
      ).toBeUndefined();
    });

    it('marks Ketua RT under Sumber Daya, and Beranda only on home', async () => {
      const { wrapper } = await setup({ path: '/ketua-rt' });
      expect(wrapper.find('a[aria-current="page"]').attributes('href')).toBe('/ketua-rt');
      expect(
        wrapper.find('[data-test="menu-link-home"]').attributes('aria-current'),
      ).toBeUndefined();

      const home = await setup({ path: '/' });
      expect(home.wrapper.find('[data-test="menu-link-home"]').attributes('aria-current')).toBe(
        'page',
      );
    });

    it('marks the current Cerita topic', async () => {
      const { wrapper } = await setup({ path: '/cerita/pendidikan' });
      expect(wrapper.find('a[aria-current="page"]').attributes('href')).toBe('/cerita/pendidikan');
      expect(wrapper.find('[data-test="menu-group-cerita"]').attributes('data-active')).toBe(
        'true',
      );
    });
  });

  describe('Cerita topics', () => {
    it('derive from the page hierarchy', async () => {
      const { wrapper, pinia } = await setup();
      const pagesStore = usePagesStore(pinia);
      pagesStore.pages = [
        { id: '2', slug: 'topik-b', title: 'Topik B', sortOrder: 2, chapterCount: 0 },
        { id: '1', slug: 'topik-a', title: 'Topik A', sortOrder: 1, chapterCount: 0 },
      ];
      pagesStore.isLoaded = true;
      await flushPromises();

      const links = wrapper.findAll('[data-test="menu-group-cerita"] a');
      expect(links.map((a) => [a.text(), a.attributes('href')])).toEqual([
        ['Topik A', '/cerita/topik-a'],
        ['Topik B', '/cerita/topik-b'],
      ]);
    });

    it('fall back to the deterministic publicNav links while the hierarchy has not loaded', async () => {
      const { wrapper } = await setup();
      const hrefs = wrapper
        .findAll('[data-test="menu-group-cerita"] a')
        .map((a) => a.attributes('href'));
      expect(hrefs).toEqual(FOOTER_STORY_LINKS.map((l) => l.to));
    });

    it('fall back when the hierarchy fetch fails, and the rest of the menu still works', async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
      const pinia = createPinia();
      setActivePinia(pinia);
      const router = createRouter({
        history: createMemoryHistory(),
        routes: PUBLIC_PATHS.map((path) => ({ path, component: STUB, meta: { layout: 'public' } })),
      });
      await router.push('/peta');
      await router.isReady();

      const wrapper = mount(PublicLayout, { global: { plugins: [pinia, router] } });
      await wrapper.find('[data-test="hamburger-btn"]').trigger('click');
      await flushPromises();

      const pagesStore = usePagesStore(pinia);
      expect(pagesStore.isLoaded).toBe(false);
      expect(pagesStore.hierarchyError).toBeTruthy();

      const hrefs = wrapper
        .findAll('[data-test="menu-group-cerita"] a')
        .map((a) => a.attributes('href'));
      expect(hrefs).toEqual(FOOTER_STORY_LINKS.map((l) => l.to));
      expect(wrapper.find('a[href="/ketua-rt"]').exists()).toBe(true);
      wrapper.unmount();
    });

    it('fall back when the hierarchy loads empty', async () => {
      const { wrapper, pinia } = await setup();
      const pagesStore = usePagesStore(pinia);
      pagesStore.pages = [];
      pagesStore.isLoaded = true;
      await flushPromises();

      expect(wrapper.findAll('[data-test="menu-group-cerita"] a')).toHaveLength(
        FOOTER_STORY_LINKS.length,
      );
    });
  });

  describe('account area: parity per role', () => {
    it('logged out: exactly one action, a login link, and nothing else account-related', async () => {
      const { wrapper } = await setup({ role: null });

      const actions = wrapper.findAll(
        '[data-test="menu-account"] a, [data-test="menu-account"] button',
      );
      expect(actions).toHaveLength(1);
      expect(actions[0]!.attributes('href')).toBe('/login');
      expect(wrapper.find('[data-test="menu-logout-btn"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="menu-admin-link"]').exists()).toBe(false);
    });

    it('plain user: identity and logout only, no CMS entry', async () => {
      const { wrapper } = await setup({ role: 'user' });

      expect(wrapper.find('[data-test="menu-account-email"]').text()).toBe('user@manggar.go.id');
      expect(wrapper.find('[data-test="menu-account-role"]').text()).toContain('Pengguna');
      expect(wrapper.find('[data-test="menu-logout-btn"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="menu-admin-link"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="menu-login-link"]').exists()).toBe(false);
      expect(
        wrapper.find('a[href="/users"], a[href="/audit-logs"], a[href="/data"]').exists(),
      ).toBe(false);
    });

    it.each<Role>(['editor', 'admin'])(
      '%s: the permitted CMS entry from ADMIN_NAV plus logout',
      async (role) => {
        const { wrapper } = await setup({ role });

        expect(wrapper.find('[data-test="menu-admin-link"]').attributes('href')).toBe('/admin');
        expect(wrapper.find('[data-test="menu-logout-btn"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="menu-login-link"]').exists()).toBe(false);
      },
    );

    it('has one account area and one logout control, with no duplicate desktop/mobile buttons', async () => {
      const { wrapper } = await setup({ role: 'admin' });
      expect(wrapper.findAll('[data-test="menu-account"]')).toHaveLength(1);
      expect(wrapper.findAll('button').filter((b) => b.text().includes('Keluar'))).toHaveLength(1);
      expect(accountText(wrapper)).not.toContain('Masuk');
    });

    it('updates when the session changes', async () => {
      const { wrapper, authStore } = await setup({ role: null });
      expect(wrapper.find('[data-test="menu-login-link"]').exists()).toBe(true);

      authStore.setAuth({ id: '2', email: 'editor@manggar.go.id', role: 'editor' }, 'tok');
      await flushPromises();
      expect(wrapper.find('[data-test="menu-login-link"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="menu-admin-link"]').exists()).toBe(true);
    });
  });

  describe('logout flow', () => {
    function mockLogoutFetch(logout: () => Promise<Response> | Response) {
      globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('csrf-token')) {
          return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response;
        }
        if (url.includes('/api/auth/logout')) return logout();
        return { ok: true, json: async () => ({}) } as Response;
      });
    }

    it('clears the session and redirects to /login', async () => {
      mockLogoutFetch(() => ({ ok: true, json: async () => ({}) }) as Response);
      const { wrapper, router, authStore } = await setup({ role: 'user' });

      await wrapper.find('[data-test="menu-logout-btn"]').trigger('click');
      await vi.waitUntil(() => !authStore.isAuthenticated, { timeout: 5000 });
      await flushPromises();

      expect(router.currentRoute.value.path).toBe('/login');
    });

    it('treats a 401 from logout as an already-ended session', async () => {
      mockLogoutFetch(() => ({ ok: false, status: 401, json: async () => ({}) }) as Response);
      const { wrapper, router, authStore } = await setup({ role: 'user' });

      await wrapper.find('[data-test="menu-logout-btn"]').trigger('click');
      await vi.waitUntil(() => !authStore.isAuthenticated, { timeout: 5000 });
      await flushPromises();

      expect(router.currentRoute.value.path).toBe('/login');
    });

    it('ignores repeated clicks while a logout is in flight', async () => {
      let calls = 0;
      let resolve!: (res: Response) => void;
      const pending = new Promise<Response>((r) => (resolve = r));
      mockLogoutFetch(() => {
        calls += 1;
        return pending;
      });
      const { wrapper, authStore } = await setup({ role: 'user' });

      const button = wrapper.find('[data-test="menu-logout-btn"]');
      await button.trigger('click');
      await button.trigger('click');
      await button.trigger('click');
      expect(calls).toBe(1);
      // Stays enabled (so focus is never dropped to <body>) but announces and ignores presses.
      expect(button.attributes('disabled')).toBeUndefined();
      expect(button.attributes('aria-disabled')).toBe('true');
      expect(button.text()).toContain('Memproses');

      resolve({ ok: true, json: async () => ({}) } as Response);
      await vi.waitUntil(() => !authStore.isAuthenticated, { timeout: 5000 });
    });

    it('keeps the session and shows an alert when the server rejects the logout', async () => {
      mockLogoutFetch(() => ({ ok: false, status: 500, json: async () => ({}) }) as Response);
      const { wrapper, authStore } = await setup({ role: 'user' });

      await wrapper.find('[data-test="menu-logout-btn"]').trigger('click');
      await vi.waitUntil(() => wrapper.find('[data-test="menu-logout-error"]').exists(), {
        timeout: 5000,
      });

      expect(wrapper.find('[data-test="menu-logout-error"]').attributes('role')).toBe('alert');
      expect(wrapper.text()).toContain('Gagal keluar dari sesi');
      expect(authStore.isAuthenticated).toBe(true);
      expect(wrapper.find('[data-test="menu-logout-btn"]').attributes('disabled')).toBeUndefined();
      expect(
        wrapper.find('[data-test="menu-logout-btn"]').attributes('aria-disabled'),
      ).toBeUndefined();
    });

    it('clears a stale logout error when the menu closes and when the route changes', async () => {
      mockLogoutFetch(() => ({ ok: false, status: 500, json: async () => ({}) }) as Response);
      const { wrapper, router } = await setup({ role: 'user' });

      await wrapper.find('[data-test="menu-logout-btn"]').trigger('click');
      await vi.waitUntil(() => wrapper.find('[data-test="menu-logout-error"]').exists(), {
        timeout: 5000,
      });

      await wrapper.setProps({ open: false });
      expect(wrapper.find('[data-test="menu-logout-error"]').exists()).toBe(false);

      await wrapper.setProps({ open: true });
      await wrapper.find('[data-test="menu-logout-btn"]').trigger('click');
      await vi.waitUntil(() => wrapper.find('[data-test="menu-logout-error"]').exists(), {
        timeout: 5000,
      });
      await router.push('/peta');
      await flushPromises();
      expect(wrapper.find('[data-test="menu-logout-error"]').exists()).toBe(false);
    });

    it('shows an alert for an unexpected exception and keeps the session', async () => {
      const { wrapper, authStore } = await setup({ role: 'user' });
      vi.spyOn(authStore, 'logout').mockRejectedValue(new Error('crash'));

      await wrapper.find('[data-test="menu-logout-btn"]').trigger('click');
      await vi.waitUntil(() => wrapper.find('[role="alert"]').exists(), { timeout: 5000 });

      expect(wrapper.text()).toContain('Terjadi kesalahan tidak terduga');
      expect(authStore.isAuthenticated).toBe(true);
    });
  });
});
