import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import AdminSidebar from '../components/admin/AdminSidebar.vue';
import { useAuthStore } from '../stores/auth';

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Public Home</div>' } },
      { path: '/login', component: { template: '<div>Login</div>' } },
      { path: '/admin', component: { template: '<div>Dashboard</div>' } },
      { path: '/data', component: { template: '<div>Data</div>' } },
      { path: '/users', component: { template: '<div>Users</div>' } },
      { path: '/audit-logs', component: { template: '<div>Audit</div>' } },
      {
        path: '/settings/audit-retention',
        component: { template: '<div>Retention</div>' },
        meta: { navActiveFor: '/users' },
      },
      { path: '/admin/:pathMatch(.*)*', component: { template: '<div>Admin Page</div>' } },
    ],
  });
}

async function mountSidebar(role: 'editor' | 'admin', path = '/admin') {
  setActivePinia(createPinia());
  const authStore = useAuthStore();
  authStore.user = { id: 'u1', email: 'u@example.com', role };
  authStore.accessToken = 'token';

  const router = createTestRouter();
  await router.push(path);
  await router.isReady();

  const wrapper = mount(AdminSidebar, { global: { plugins: [router] } });
  return { wrapper, router };
}

describe('AdminSidebar.vue', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('hides Admin-only Sistem items and the Sistem group itself for Editor role', async () => {
    const { wrapper } = await mountSidebar('editor');

    expect(wrapper.find('[data-test="nav-sistem"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="nav-sistem-akun-pengguna"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="nav-sistem-templat-kalimat"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="nav-sistem-konfigurasi"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="nav-sistem-log"]').exists()).toBe(false);

    // Editor-or-admin items remain visible
    expect(wrapper.find('[data-test="nav-beranda"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="nav-data"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="nav-cerita"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="nav-peta"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="nav-publikasi"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="nav-rukun-tetangga"]').exists()).toBe(true);
  });

  it('shows every item, including the Sistem group, for Admin role', async () => {
    const { wrapper } = await mountSidebar('admin');

    expect(wrapper.find('[data-test="nav-sistem"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="nav-sistem-akun-pengguna"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="nav-sistem-templat-kalimat"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="nav-sistem-konfigurasi"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="nav-sistem-log"]').exists()).toBe(true);
  });

  it('marks the active route with aria-current="page"', async () => {
    const { wrapper } = await mountSidebar('admin', '/data');

    const dataLink = wrapper.find('[data-test="nav-data"]');
    expect(dataLink.attributes('aria-current')).toBe('page');

    const peta = wrapper.find('[data-test="nav-peta"]');
    expect(peta.attributes('aria-current')).toBeUndefined();
  });

  it('auto-opens the Sistem group and marks a nested child active when its route is current', async () => {
    const { wrapper } = await mountSidebar('admin', '/users');

    const sistemToggle = wrapper.find('[data-test="nav-sistem"]');
    expect(sistemToggle.attributes('aria-expanded')).toBe('true');

    const akunPengguna = wrapper.find('[data-test="nav-sistem-akun-pengguna"]');
    expect(akunPengguna.attributes('aria-current')).toBe('page');
  });

  it('toggles the Sistem group open/closed via its aria-expanded button and is keyboard-operable', async () => {
    const { wrapper } = await mountSidebar('admin', '/admin');

    const sistemToggle = wrapper.find('[data-test="nav-sistem"]');
    expect(sistemToggle.element.tagName).toBe('BUTTON');
    expect(sistemToggle.attributes('aria-expanded')).toBe('false');

    await sistemToggle.trigger('click');
    expect(sistemToggle.attributes('aria-expanded')).toBe('true');

    await sistemToggle.trigger('click');
    expect(sistemToggle.attributes('aria-expanded')).toBe('false');
  });

  it('marks /data and /audit-logs active, proving those routes stay nested in the shell', async () => {
    const { wrapper: dataWrapper } = await mountSidebar('admin', '/data');
    expect(dataWrapper.find('[data-test="nav-data"]').attributes('aria-current')).toBe('page');

    const { wrapper: auditWrapper } = await mountSidebar('admin', '/audit-logs');
    expect(auditWrapper.find('[data-test="nav-sistem-log"]').attributes('aria-current')).toBe(
      'page',
    );
  });

  // Bug fix: /settings/audit-retention is a child page reached via a link inside
  // UserManagement.vue, not directly from the sidebar, so its path never matches any ADMIN_NAV
  // `to`. It declares meta.navActiveFor: '/users' so the sidebar can still orient the user:
  // "Akun pengguna" highlighted, aria-current set, and the Sistem group auto-expanded.
  it('highlights "Akun pengguna" and expands the Sistem group on /settings/audit-retention via meta.navActiveFor', async () => {
    const { wrapper } = await mountSidebar('admin', '/settings/audit-retention');

    const akunPengguna = wrapper.find('[data-test="nav-sistem-akun-pengguna"]');
    expect(akunPengguna.attributes('aria-current')).toBe('page');

    const sistemToggle = wrapper.find('[data-test="nav-sistem"]');
    expect(sistemToggle.attributes('aria-expanded')).toBe('true');

    // Beranda's `to` is '/admin' — naive prefix-matching against '/settings/audit-retention'
    // would not accidentally match it either way, but this pins that only the declared target
    // lights up, not every other item.
    const beranda = wrapper.find('[data-test="nav-beranda"]');
    expect(beranda.attributes('aria-current')).toBeUndefined();
  });

  it('does not let prefix-like paths under /admin/* cross-highlight each other (e.g. Beranda vs Cerita)', async () => {
    const { wrapper } = await mountSidebar('admin', '/admin/cerita');

    expect(wrapper.find('[data-test="nav-cerita"]').attributes('aria-current')).toBe('page');
    expect(wrapper.find('[data-test="nav-beranda"]').attributes('aria-current')).toBeUndefined();
  });

  it('toggles collapse state via the collapse button with aria-expanded', async () => {
    const { wrapper } = await mountSidebar('admin');

    const toggle = wrapper.find('[data-test="sidebar-collapse-toggle"]');
    expect(toggle.element.tagName).toBe('BUTTON');
    expect(toggle.attributes('aria-expanded')).toBe('true');

    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('false');
  });

  it('renders as a labelled nav landmark', async () => {
    const { wrapper } = await mountSidebar('admin');
    expect(wrapper.find('nav').attributes('aria-label')).toBe('Navigasi Admin');
  });

  // Product fix: links that only open a placeholder view ("belum dibangun") used to look
  // identical to fully built ones, so an editor had no way to tell before clicking. Unbuilt
  // links now carry a "Segera hadir" badge instead of being hidden, keeping them discoverable.
  it('marks links that only open a placeholder view with a "Segera hadir" badge', async () => {
    const { wrapper } = await mountSidebar('admin');

    const unbuilt = [
      'nav-cerita',
      'nav-peta',
      'nav-publikasi',
      'nav-rukun-tetangga',
      'nav-sistem-templat-kalimat',
      'nav-sistem-konfigurasi',
    ];
    for (const dataTest of unbuilt) {
      const link = wrapper.find(`[data-test="${dataTest}"]`);
      expect(link.text()).toContain('Segera hadir');
    }

    const built = ['nav-beranda', 'nav-data', 'nav-sistem-akun-pengguna', 'nav-sistem-log'];
    for (const dataTest of built) {
      const link = wrapper.find(`[data-test="${dataTest}"]`);
      expect(link.text()).not.toContain('Segera hadir');
    }
  });

  // Accessibility fix: collapsing the rail used to remove the label text from the DOM entirely
  // (v-if), leaving every link and the Sistem toggle with no accessible name. Labels now stay in
  // the DOM as sr-only text when collapsed instead of being removed.
  it('keeps an accessible name on every nav link and the Sistem toggle when the sidebar is collapsed', async () => {
    const { wrapper } = await mountSidebar('admin');

    await wrapper.find('[data-test="sidebar-collapse-toggle"]').trigger('click');

    const dataLink = wrapper.find('[data-test="nav-data"]');
    expect(dataLink.text()).toContain('Data');
    expect(dataLink.find('span').classes()).toContain('md:sr-only');

    const sistemToggle = wrapper.find('[data-test="nav-sistem"]');
    expect(sistemToggle.text()).toContain('Sistem');
    expect(sistemToggle.find('span').classes()).toContain('md:sr-only');

    const akunPengguna = wrapper.find('[data-test="nav-sistem-akun-pengguna"]');
    expect(akunPengguna.text()).toContain('Akun pengguna');
    expect(akunPengguna.find('span').classes()).toContain('md:sr-only');

    const logoutButton = wrapper.find('[data-test="nav-logout"]');
    expect(logoutButton.text()).toContain('Keluar');
    expect(logoutButton.find('span').classes()).toContain('md:sr-only');
  });

  it('shows visible (non-sr-only) labels when the sidebar is expanded', async () => {
    const { wrapper } = await mountSidebar('admin');

    const dataLink = wrapper.find('[data-test="nav-data"]');
    expect(dataLink.find('span').classes()).not.toContain('sr-only');
    expect(dataLink.find('span').classes()).not.toContain('md:sr-only');
  });

  // Bug fix: "collapsed" is a desktop-rail preference persisted in localStorage. It used to apply
  // bare `sr-only` regardless of viewport, so someone who collapsed the rail on desktop would open
  // the app on a phone to a drawer of unlabeled icons with no way to undo it (the collapse toggle
  // is desktop-only, md:inline-flex). The label classes must use the `md:` variant so they stay
  // visible below that breakpoint even when isCollapsed is true.
  it('never applies bare sr-only to labels — only the md: variant, so a collapsed desktop preference cannot hide labels on the mobile drawer', async () => {
    const { wrapper } = await mountSidebar('admin');
    await wrapper.find('[data-test="sidebar-collapse-toggle"]').trigger('click');

    const classLists = wrapper.findAll('span').map((s) => s.classes());
    for (const classes of classLists) {
      expect(classes).not.toContain('sr-only');
    }
  });
});

describe('AdminSidebar.vue — navigation out of the admin area', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders a link back to the public site', async () => {
    const { wrapper } = await mountSidebar('admin');
    const link = wrapper.find('[data-test="nav-public-site"]');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toBe('/');
    expect(link.text()).toContain('Kembali ke Situs Publik');
  });

  it('logs out, clears auth state, and redirects to /login on successful logout', async () => {
    const { wrapper, router } = await mountSidebar('admin');
    const authStore = useAuthStore();

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    await wrapper.find('[data-test="nav-logout"]').trigger('click');
    await vi.waitUntil(() => !authStore.isAuthenticated);

    expect(authStore.isAuthenticated).toBe(false);
    expect(router.currentRoute.value.path).toBe('/login');
  });

  it('keeps the session and shows an inline error when the logout request fails with a server error', async () => {
    const { wrapper } = await mountSidebar('admin');
    const authStore = useAuthStore();

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response;
      }
      return { ok: false, status: 500, json: async () => ({}) } as Response;
    });

    await wrapper.find('[data-test="nav-logout"]').trigger('click');
    await vi.waitUntil(() => wrapper.find('[data-test="logout-error"]').exists());

    expect(authStore.isAuthenticated).toBe(true);
    expect(wrapper.find('[data-test="logout-error"]').text()).toContain('Gagal keluar');
  });

  // Bug fix: a 401/403 from /api/auth/logout means the server already considers the session
  // dead (e.g. the refresh token already expired), not that logout failed. Treating it as a
  // failure trapped the user: every retry hit the same already-expired session and failed the
  // same way, so there was no way to actually sign out.
  it('clears auth state and redirects to /login even when the logout request itself returns 401 (session already expired)', async () => {
    const { wrapper, router } = await mountSidebar('admin');
    const authStore = useAuthStore();

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response;
      }
      return { ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) } as Response;
    });

    await wrapper.find('[data-test="nav-logout"]').trigger('click');
    await vi.waitUntil(() => !authStore.isAuthenticated);

    expect(authStore.isAuthenticated).toBe(false);
    expect(router.currentRoute.value.path).toBe('/login');
    expect(wrapper.find('[data-test="logout-error"]').exists()).toBe(false);
  });
});

describe('AdminSidebar.vue — mobile drawer', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('is translated off-screen by default and shown when mobileOpen is true', async () => {
    setActivePinia(createPinia());
    const authStore = useAuthStore();
    authStore.user = { id: 'u1', email: 'u@example.com', role: 'admin' };
    authStore.accessToken = 'token';

    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const closed = mount(AdminSidebar, { global: { plugins: [router] } });
    expect(closed.find('nav').classes()).toContain('-translate-x-full');

    const open = mount(AdminSidebar, {
      props: { mobileOpen: true },
      global: { plugins: [router] },
    });
    expect(open.find('nav').classes()).toContain('translate-x-0');
  });

  // Accessibility fix: -translate-x-full only moves the closed drawer off-screen visually —
  // every link inside stays focusable and screen-reader-announced, so tabbing on a phone walks
  // through invisible links (WCAG 2.1 §4.1.2). `invisible` (visibility:hidden) removes focusability
  // and AT announcement; `md:visible` keeps the desktop rail (always "open" there) unaffected.
  it('marks the closed drawer invisible (not just translated off-screen) below md, but always visible at md+', async () => {
    const { wrapper: closedWrapper } = await mountSidebar('admin');
    const closedClasses = closedWrapper.find('nav').classes();
    expect(closedClasses).toContain('invisible');
    expect(closedClasses).toContain('md:visible');

    setActivePinia(createPinia());
    const authStore = useAuthStore();
    authStore.user = { id: 'u1', email: 'u@example.com', role: 'admin' };
    authStore.accessToken = 'token';
    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const openWrapper = mount(AdminSidebar, {
      props: { mobileOpen: true },
      global: { plugins: [router] },
    });
    expect(openWrapper.find('nav').classes()).toContain('visible');
    expect(openWrapper.find('nav').classes()).not.toContain('invisible');
  });

  // Accessibility fix: opening the drawer must move focus into it (WCAG 2.1 §2.4.3), rather than
  // leaving focus wherever it was on the page behind the now-visible overlay.
  it('moves focus to the mobile close button when the drawer opens', async () => {
    setActivePinia(createPinia());
    const authStore = useAuthStore();
    authStore.user = { id: 'u1', email: 'u@example.com', role: 'admin' };
    authStore.accessToken = 'token';
    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminSidebar, {
      props: { mobileOpen: false },
      global: { plugins: [router] },
      attachTo: document.body,
    });

    await wrapper.setProps({ mobileOpen: true });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(document.activeElement).toBe(wrapper.find('[data-test="sidebar-mobile-close"]').element);
    wrapper.unmount();
  });

  it('emits close when the mobile close button is clicked', async () => {
    const { wrapper } = await mountSidebar('admin');
    await wrapper.find('[data-test="sidebar-mobile-close"]').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('emits close on Escape only while the mobile drawer is open', async () => {
    setActivePinia(createPinia());
    const authStore = useAuthStore();
    authStore.user = { id: 'u1', email: 'u@example.com', role: 'admin' };
    authStore.accessToken = 'token';

    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const closedWrapper = mount(AdminSidebar, { global: { plugins: [router] } });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await closedWrapper.vm.$nextTick();
    expect(closedWrapper.emitted('close')).toBeFalsy();
    closedWrapper.unmount();

    const openWrapper = mount(AdminSidebar, {
      props: { mobileOpen: true },
      global: { plugins: [router] },
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await openWrapper.vm.$nextTick();
    expect(openWrapper.emitted('close')).toBeTruthy();
    openWrapper.unmount();
  });

  it('closes the mobile drawer when a nav link is clicked', async () => {
    const { wrapper } = await mountSidebar('admin');
    await wrapper.find('[data-test="nav-data"]').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });
});
