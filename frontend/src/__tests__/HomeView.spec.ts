import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import { useAuthStore } from '../stores/auth';

function setupHomeView() {
  const pinia = createPinia();
  setActivePinia(pinia);

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: HomeView },
      { path: '/login', component: { template: '<div>login</div>' } },
      { path: '/users', component: { template: '<div>users</div>' } },
      { path: '/dashboard', component: { template: '<div>dashboard</div>' } },
    ],
  });

  return { pinia, router };
}

describe('HomeView Phase 2 Assembly & Accessibility (TDD: Edge Cases First, Happy Path Last)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
  });

  // Edge Case 1: Semantic Landmarks & Skip Link per docs/ACCESSIBILITY.md
  it('renders semantic landmarks: skip link, AppNavbar header, main, and AppFooter with section-level Hero', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(HomeView, {
      global: { plugins: [pinia, router] },
    });

    // 1. Skip to content link
    const skipLink = wrapper.find('a[href="#main-content"]');
    expect(skipLink.exists()).toBe(true);
    expect(skipLink.text()).toContain('Lewati ke konten utama');

    // 2. AppNavbar header landmark
    const header = wrapper.find('header');
    expect(header.exists()).toBe(true);
    expect(header.find('nav[aria-label="Navigasi Utama"]').exists()).toBe(true);

    // 3. Exactly one main landmark
    const mainElements = wrapper.findAll('main');
    expect(mainElements.length).toBe(1);
    expect(mainElements[0]?.attributes('id')).toBe('main-content');

    // 4. SectionHero inside main must be a <section>, not an ambiguous nested <header>
    const heroSection = wrapper.find('main section#hero');
    expect(heroSection.exists()).toBe(true);

    // 5. AppFooter footer landmark
    const footer = wrapper.find('footer');
    expect(footer.exists()).toBe(true);
    expect(footer.classes()).toContain('app-footer-root');
  });

  // Edge Case 2: Heading Hierarchy - Exactly one h1, strict descending order without skips
  it('enforces strict heading hierarchy with single <h1> and no skipped levels in DOM order', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(HomeView, {
      global: { plugins: [pinia, router] },
    });

    // Exactly one h1 on the entire page
    const h1Elements = wrapper.findAll('h1');
    expect(h1Elements.length).toBe(1);
    expect(h1Elements[0]?.text()).toContain('Portal Data Terpadu');

    // Collect all headings across the view in DOM order
    const headings = wrapper.findAll('h1, h2, h3, h4, h5, h6');
    const headingLevels = headings.map((h) => parseInt(h.element.tagName.replace('H', ''), 10));

    // Verify no level jumps greater than 1 (e.g. h1 -> h3 is forbidden)
    for (let i = 1; i < headingLevels.length; i++) {
      const prev = headingLevels[i - 1]!;
      const curr = headingLevels[i]!;
      expect(curr - prev).toBeLessThanOrEqual(1);
    }

    // Check specific section headings exist with h2
    expect(wrapper.find('h2#sambutan-title').exists()).toBe(true);
    expect(wrapper.find('h2#cerita-preview-title').exists()).toBe(true);
    expect(wrapper.find('h2#highlights-title').exists()).toBe(true);
    expect(wrapper.find('h2#weather-widget-title').exists()).toBe(true);
  });

  // Edge Case 3: Sections Assembled in Exact Spec §8 Order inside <main>
  it('assembles sections in exact Spec §8 order: Hero -> Sambutan -> Cerita preview -> Highlights -> Cuaca', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(HomeView, {
      global: { plugins: [pinia, router] },
    });

    const mainEl = wrapper.find('main#main-content').element;
    const heroEl = wrapper.find('section#hero').element;
    const sambutanEl = wrapper.find('section[aria-labelledby="sambutan-title"]').element;
    const ceritaEl = wrapper.find('section#cerita-preview').element;
    const highlightsEl = wrapper.find('section#potensi').element;
    const weatherEl = wrapper.find('section#widget-cuaca').element;

    // Verify all 5 sections are inside main#main-content
    expect(mainEl.contains(heroEl)).toBe(true);
    expect(mainEl.contains(sambutanEl)).toBe(true);
    expect(mainEl.contains(ceritaEl)).toBe(true);
    expect(mainEl.contains(highlightsEl)).toBe(true);
    expect(mainEl.contains(weatherEl)).toBe(true);

    // Verify DOM position order using compareDocumentPosition (DOCUMENT_POSITION_FOLLOWING = 4)
    expect(heroEl.compareDocumentPosition(sambutanEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sambutanEl.compareDocumentPosition(ceritaEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ceritaEl.compareDocumentPosition(highlightsEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(highlightsEl.compareDocumentPosition(weatherEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // Edge Case 4: Default Fallback Content when Cerita and Weather Slots are Omitted
  it('renders accessible fallback placeholders when cerita-preview and weather slots are not provided', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(HomeView, {
      global: { plugins: [pinia, router] },
    });

    const ceritaSection = wrapper.find('section#cerita-preview');
    expect(ceritaSection.exists()).toBe(true);
    expect(ceritaSection.find('h2#cerita-preview-title').text()).toContain('Cerita & Data Wilayah');

    const weatherSection = wrapper.find('section#widget-cuaca');
    expect(weatherSection.exists()).toBe(true);
    expect(weatherSection.find('h2#weather-widget-title').text()).toContain('Prakiraan Cuaca');
  });

  // Edge Case 5: Custom Slot Injection into Cerita Preview and Weather Widget Slots
  it('renders custom slotted content when cerita-preview and weather slots are passed', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(HomeView, {
      global: { plugins: [pinia, router] },
      slots: {
        'cerita-preview': '<div id="custom-cerita-content">Kartu Cerita Terintegrasi</div>',
        weather: '<div id="custom-weather-content">BMKG Weather Widget Active</div>',
      },
    });

    expect(wrapper.find('section#cerita-preview #custom-cerita-content').exists()).toBe(true);
    expect(wrapper.find('section#cerita-preview').text()).toContain('Kartu Cerita Terintegrasi');

    expect(wrapper.find('section#widget-cuaca #custom-weather-content').exists()).toBe(true);
    expect(wrapper.find('section#widget-cuaca').text()).toContain('BMKG Weather Widget Active');
  });

  // Edge Case 6: Concurrency Re-entrance Guard on Logout
  it('prevents concurrent logout requests when logout is clicked repeatedly in HomeView', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    const authStore = useAuthStore(pinia);
    authStore.setAuth({ id: '1', email: 'user@manggar.go.id', role: 'user' }, 'token');

    let logoutCount = 0;
    let resolveLogout: (res: Response) => void;
    const logoutPromise = new Promise<Response>((resolve) => {
      resolveLogout = resolve;
    });

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response;
      }
      if (url.includes('/api/auth/logout')) {
        logoutCount++;
        return logoutPromise;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const wrapper = mount(HomeView, {
      global: { plugins: [pinia, router] },
    });

    const logoutBtn = wrapper.find('[data-test="logout-btn"]');
    expect(logoutBtn.exists()).toBe(true);

    // Rapid concurrent clicks
    await logoutBtn.trigger('click');
    await logoutBtn.trigger('click');
    await logoutBtn.trigger('click');

    expect(logoutCount).toBe(1);

    resolveLogout!({ ok: true, json: async () => ({}) } as Response);
    await vi.waitUntil(() => !authStore.isAuthenticated);
  });

  // Edge Case 7: Logout Error Handling (Server Failure & Network Failure)
  it('handles server logout failure and displays error banner without destroying session', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    const authStore = useAuthStore(pinia);
    authStore.setAuth({ id: '1', email: 'user@manggar.go.id', role: 'user' }, 'token');

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response;
      }
      if (url.includes('/api/auth/logout')) {
        return { ok: false, status: 500, json: async () => ({}) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const wrapper = mount(HomeView, {
      global: { plugins: [pinia, router] },
    });

    const logoutBtn = wrapper.find('[data-test="logout-btn"]');
    await logoutBtn.trigger('click');
    await vi.waitUntil(() => wrapper.text().includes('Gagal keluar'));

    expect(wrapper.text()).toContain('Gagal keluar dari sesi. Silakan coba lagi.');
    expect(authStore.isAuthenticated).toBe(true);
  });

  // Edge Case 8: Unexpected Exception during Logout Handling
  it('handles unexpected exceptions during logout gracefully with an error banner', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    const authStore = useAuthStore(pinia);
    authStore.setAuth({ id: '1', email: 'user@manggar.go.id', role: 'user' }, 'token');

    vi.spyOn(authStore, 'logout').mockRejectedValue(new Error('Network offline or unexpected crash'));

    const wrapper = mount(HomeView, {
      global: { plugins: [pinia, router] },
    });

    const logoutBtn = wrapper.find('[data-test="logout-btn"]');
    await logoutBtn.trigger('click');
    await vi.waitUntil(() => wrapper.find('[role="alert"]').exists());

    expect(wrapper.text()).toContain('Terjadi kesalahan tidak terduga');
    expect(authStore.isAuthenticated).toBe(true);
  });

  // Edge Case 9: Mobile Drawer Auth State and Mobile Logout Action
  it('renders mobile navigation links and supports logout inside the mobile drawer', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    const authStore = useAuthStore(pinia);
    authStore.setAuth({ id: '1', email: 'mobile@manggar.go.id', role: 'admin' }, 'token');

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const wrapper = mount(HomeView, {
      global: { plugins: [pinia, router] },
    });

    // Open drawer via hamburger toggle
    const hamburgerBtn = wrapper.find('[data-test="hamburger-btn"]');
    expect(hamburgerBtn.exists()).toBe(true);
    await hamburgerBtn.trigger('click');

    const drawer = wrapper.find('[data-test="nav-menu-drawer"]');
    expect(drawer.exists()).toBe(true);
    expect(drawer.isVisible()).toBe(true);

    // Verify mobile drawer admin link and mobile logout button
    expect(wrapper.find('[data-test="mobile-admin-link"]').exists()).toBe(true);
    const mobileLogoutBtn = wrapper.find('[data-test="mobile-logout-btn"]');
    expect(mobileLogoutBtn.exists()).toBe(true);

    // Trigger logout from mobile drawer
    await mobileLogoutBtn.trigger('click');
    await vi.waitUntil(() => !authStore.isAuthenticated);

    expect(authStore.isAuthenticated).toBe(false);
    expect(router.currentRoute.value.path).toBe('/login');
  });

  // Happy Path (Last): Unauthenticated Public Visitor Navigation
  it('renders login link in AppNavbar actions for unauthenticated public visitors', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(HomeView, {
      global: { plugins: [pinia, router] },
    });

    expect(wrapper.text()).toContain('Masuk (Login)');
    expect(wrapper.find('a[href="/login"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="logout-btn"]').exists()).toBe(false);
  });

  // Happy Path (Last): Authenticated Visitor Navigation and User Management Access
  it('renders user details, admin link, and logout button for authenticated admin user', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    const authStore = useAuthStore(pinia);
    authStore.setAuth(
      { id: 'admin-1', email: 'admin@manggar.go.id', role: 'admin' },
      'access-token',
    );

    const wrapper = mount(HomeView, {
      global: { plugins: [pinia, router] },
    });

    expect(wrapper.text()).toContain('admin@manggar.go.id');
    expect(wrapper.text()).toContain('admin');
    expect(wrapper.find('a[href="/users"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="logout-btn"]').exists()).toBe(true);
  });

  // Happy Path (Last): Successful Logout Redirect
  it('clears auth state and redirects to /login when user logs out successfully', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    const authStore = useAuthStore(pinia);
    authStore.setAuth({ id: '1', email: 'user@example.com', role: 'user' }, 'access-token');

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const wrapper = mount(HomeView, {
      global: { plugins: [pinia, router] },
    });

    const logoutBtn = wrapper.find('[data-test="logout-btn"]');
    await logoutBtn.trigger('click');
    await vi.waitUntil(() => !authStore.isAuthenticated);

    expect(authStore.isAuthenticated).toBe(false);
    expect(router.currentRoute.value.path).toBe('/login');
  });
});
