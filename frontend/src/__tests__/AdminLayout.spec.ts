import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import AdminLayout from '../layouts/AdminLayout.vue';
import { useAuthStore } from '../stores/auth';
import { setAdminHeader } from '../composables/useAdminHeader';

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/admin',
        component: { template: '<div>Dashboard</div>' },
        meta: { title: 'Beranda', breadcrumb: [] },
      },
      {
        path: '/admin/cerita',
        component: { template: '<div data-test="cerita-body">Cerita Body</div>' },
        meta: { title: 'Cerita', breadcrumb: ['Cerita'] },
      },
    ],
  });
}

describe('AdminLayout.vue', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActivePinia(createPinia());
    const authStore = useAuthStore();
    authStore.user = { id: 'u1', email: 'admin@example.com', role: 'admin' };
    authStore.accessToken = 'token';
  });

  it('renders required semantic landmarks exactly once: header, nav, main', async () => {
    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });

    expect(wrapper.findAll('header').length).toBe(1);
    expect(wrapper.findAll('main').length).toBe(1);
    // AdminSidebar's <nav aria-label="Navigasi Admin"> + the breadcrumb <nav aria-label="Breadcrumb">
    const navs = wrapper.findAll('nav');
    expect(navs.length).toBe(2);
    expect(navs.some((n) => n.attributes('aria-label') === 'Navigasi Admin')).toBe(true);
    expect(navs.some((n) => n.attributes('aria-label') === 'Breadcrumb')).toBe(true);
  });

  it('renders a skip link pointing at the main content landmark', async () => {
    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });

    const skipLink = wrapper.find('a[href="#admin-main-content"]');
    expect(skipLink.exists()).toBe(true);
    expect(wrapper.find('main').attributes('id')).toBe('admin-main-content');
  });

  it('renders the breadcrumb trail from route meta, prefixed with Beranda', async () => {
    const router = createTestRouter();
    await router.push('/admin/cerita');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });

    const breadcrumb = wrapper.find('[data-test="admin-breadcrumb"]');
    expect(breadcrumb.exists()).toBe(true);
    expect(breadcrumb.text()).toContain('Beranda');
    expect(breadcrumb.text()).toContain('Cerita');

    // Beranda is a real link to a different page here (/admin/cerita -> /admin).
    expect(breadcrumb.find('a').exists()).toBe(true);
  });

  // Accessibility fix: on the dashboard itself (empty trail), "Beranda" was rendered as a link
  // to the page the user is already on, with no aria-current, giving a screen reader no hint
  // about the current location. It must render as plain text with aria-current="page" instead.
  it('renders "Beranda" as plain text with aria-current="page" when the trail is empty (the dashboard itself)', async () => {
    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });

    const breadcrumb = wrapper.find('[data-test="admin-breadcrumb"]');
    expect(breadcrumb.find('a').exists()).toBe(false);

    const beranda = breadcrumb.find('span[aria-current="page"]');
    expect(beranda.exists()).toBe(true);
    expect(beranda.text()).toBe('Beranda');
  });

  it('renders the routed child view inside the main content panel', async () => {
    const router = createTestRouter();
    await router.push('/admin/cerita');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });

    expect(wrapper.find('main [data-test="cerita-body"]').exists()).toBe(true);
  });

  it('sets the header title from route meta on navigation', async () => {
    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });
    expect(wrapper.find('[data-test="admin-header"] h1').text()).toBe('Beranda');

    await router.push('/admin/cerita');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="admin-header"] h1').text()).toBe('Cerita');
  });

  it('keeps the header subtitle when only the query string changes (e.g. a view syncing search filters to the URL)', async () => {
    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });
    setAdminHeader('Beranda', 'Ringkasan aktivitas dan pintasan menuju modul admin.');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="admin-header"] p').text()).toBe(
      'Ringkasan aktivitas dan pintasan menuju modul admin.',
    );

    await router.push('/admin?q=term');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="admin-header"] p').text()).toBe(
      'Ringkasan aktivitas dan pintasan menuju modul admin.',
    );
  });

  it('moves focus to <main> after navigating between admin pages, without hijacking focus on initial mount', async () => {
    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminLayout, {
      global: { plugins: [router] },
      attachTo: document.body,
    });
    const mainEl = wrapper.find('main#admin-main-content').element;

    // Initial mount must not hijack focus onto <main>.
    expect(document.activeElement).not.toBe(mainEl);

    await router.push('/admin/cerita');
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(document.activeElement).toBe(mainEl);
    wrapper.unmount();
  });

  it('does not steal focus onto <main> when a view has already focused an interactive element inside <main>', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/admin',
          component: { template: '<div><button data-test="inner-btn">Action</button></div>' },
          meta: { title: 'Beranda', breadcrumb: [] },
        },
        {
          path: '/admin/cerita',
          component: {
            mounted() {
              (this.$el as HTMLElement).querySelector<HTMLInputElement>('input')?.focus();
            },
            template: '<div><input data-test="cerita-input" /></div>',
          },
          meta: { title: 'Cerita', breadcrumb: ['Cerita'] },
        },
      ],
    });
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminLayout, {
      global: { plugins: [router] },
      attachTo: document.body,
    });

    await router.push('/admin/cerita');
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    const inputEl = wrapper.find('[data-test="cerita-input"]').element;
    expect(document.activeElement).toBe(inputEl);
    wrapper.unmount();
  });
});

describe('AdminLayout.vue — mobile sidebar drawer', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActivePinia(createPinia());
    const authStore = useAuthStore();
    authStore.user = { id: 'u1', email: 'admin@example.com', role: 'admin' };
    authStore.accessToken = 'token';
  });

  it('is closed by default: no backdrop, sidebar translated off-screen', async () => {
    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });

    expect(wrapper.find('[data-test="admin-sidebar-backdrop"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="admin-sidebar"]').classes()).toContain('-translate-x-full');
  });

  it('opens the sidebar and shows a backdrop when the header menu button is clicked', async () => {
    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });

    await wrapper.find('[data-test="admin-mobile-menu-toggle"]').trigger('click');

    expect(wrapper.find('[data-test="admin-sidebar-backdrop"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="admin-sidebar"]').classes()).toContain('translate-x-0');
  });

  it('closes the sidebar when the backdrop is clicked', async () => {
    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });
    await wrapper.find('[data-test="admin-mobile-menu-toggle"]').trigger('click');
    expect(wrapper.find('[data-test="admin-sidebar-backdrop"]').exists()).toBe(true);

    await wrapper.find('[data-test="admin-sidebar-backdrop"]').trigger('click');
    expect(wrapper.find('[data-test="admin-sidebar-backdrop"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="admin-sidebar"]').classes()).toContain('-translate-x-full');
  });

  it('closes the sidebar automatically after navigating to another admin page', async () => {
    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });
    await wrapper.find('[data-test="admin-mobile-menu-toggle"]').trigger('click');
    expect(wrapper.find('[data-test="admin-sidebar-backdrop"]').exists()).toBe(true);

    await router.push('/admin/cerita');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="admin-sidebar-backdrop"]').exists()).toBe(false);
  });

  // Accessibility fix: the hamburger button had no aria-expanded, so screen-reader users had no
  // way to know whether the drawer it controls was open or closed (WCAG 2.1 §4.1.2 Name, Role,
  // Value). Its aria-label stays constant ("Menu navigasi") so aria-expanded alone carries the
  // open/closed state without contradicting or duplicating the drawer's close button label.
  it('reflects drawer state on the hamburger button via aria-expanded while keeping a constant aria-label', async () => {
    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });
    const toggle = wrapper.find('[data-test="admin-mobile-menu-toggle"]');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(toggle.attributes('aria-label')).toBe('Menu navigasi');

    await toggle.trigger('click');
    const openToggle = wrapper.find('[data-test="admin-mobile-menu-toggle"]');
    expect(openToggle.attributes('aria-expanded')).toBe('true');
    expect(openToggle.attributes('aria-label')).toBe('Menu navigasi');
    expect(openToggle.attributes('aria-controls')).toBe('admin-sidebar');
    expect(wrapper.find('nav#admin-sidebar').exists()).toBe(true);
  });

  it('omits the mobile drawer toggle button on desktop viewports so assistive tech does not announce aria-expanded=false when the sidebar is permanently open', async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) =>
      ({
        matches: query === '(min-width: 768px)',
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList) as typeof window.matchMedia;

    try {
      const router = createTestRouter();
      await router.push('/admin');
      await router.isReady();

      const wrapper = mount(AdminLayout, { global: { plugins: [router] } });
      expect(wrapper.find('[data-test="admin-mobile-menu-toggle"]').exists()).toBe(false);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  // Accessibility fix: closing the drawer (from any trigger — its own close button, Escape, or
  // the backdrop) must return focus to the control that opened it, rather than dropping focus
  // into the document body (WCAG 2.1 §2.4.3 Focus Order).
  it('returns focus to the hamburger toggle when the drawer closes via the backdrop', async () => {
    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminLayout, {
      global: { plugins: [router] },
      attachTo: document.body,
    });

    const toggle = wrapper.find('[data-test="admin-mobile-menu-toggle"]');
    await toggle.trigger('click');
    await wrapper.find('[data-test="admin-sidebar-backdrop"]').trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(document.activeElement).toBe(
      wrapper.find('[data-test="admin-mobile-menu-toggle"]').element,
    );
    wrapper.unmount();
  });

  it('does not move focus back to the hamburger toggle when the drawer closes because a sidebar link was clicked', async () => {
    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminLayout, {
      global: { plugins: [router] },
      attachTo: document.body,
    });

    await wrapper.find('[data-test="admin-mobile-menu-toggle"]').trigger('click');
    await wrapper.vm.$nextTick();

    const ceritaLink = wrapper.find('[data-test="nav-cerita"]');
    (ceritaLink.element as HTMLElement).focus();
    await ceritaLink.trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(document.activeElement).not.toBe(
      wrapper.find('[data-test="admin-mobile-menu-toggle"]').element,
    );
    wrapper.unmount();
  });

  it('marks the header and main content area inert while the mobile drawer is open', async () => {
    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });
    const contentShell = wrapper.find('[data-test="admin-content-shell"]');
    expect(contentShell.attributes('inert')).toBeUndefined();

    await wrapper.find('[data-test="admin-mobile-menu-toggle"]').trigger('click');
    expect(contentShell.attributes('inert')).toBeDefined();

    await wrapper.find('[data-test="admin-sidebar-backdrop"]').trigger('click');
    expect(contentShell.attributes('inert')).toBeUndefined();
  });

  it('uses dynamic viewport height (h-dvh) on the root layout container so mobile browser chrome cannot clip the bottom', async () => {
    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });
    expect(wrapper.classes()).toContain('h-dvh');
  });
});
