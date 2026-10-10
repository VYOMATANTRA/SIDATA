import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import DashboardView from '../views/DashboardView.vue';
import { useAuthStore } from '../stores/auth';

function setupDashboardView() {
  const pinia = createPinia();
  setActivePinia(pinia);

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home Page</div>' } },
      { path: '/dashboard', component: DashboardView },
      { path: '/login', component: { template: '<div>Login Page</div>' } },
    ],
  });

  return { pinia, router };
}

describe('DashboardView (TDD: Edge Cases First, Happy Path Last)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Edge Case 1: Accessibility landmarks and single h1 constraint
  it('renders semantic <main> landmark and exactly one <h1> heading per docs/ACCESSIBILITY.md', async () => {
    const { pinia, router } = setupDashboardView();
    await router.push('/dashboard');
    await router.isReady();

    const authStore = useAuthStore(pinia);
    authStore.setAuth({ id: '1', email: 'petugas@manggar.go.id', role: 'user' }, 'token');

    const wrapper = mount(DashboardView, {
      global: { plugins: [pinia, router] },
    });

    const mainEl = wrapper.find('main');
    expect(mainEl.exists()).toBe(true);

    const h1Elements = wrapper.findAll('h1');
    expect(h1Elements.length).toBe(1);
    expect(h1Elements[0]?.text()).toContain('Login Berhasil');
  });

  // Edge Case 2: Null / missing user profile in authStore
  it('gracefully handles missing or null user object in store without throwing', async () => {
    const { pinia, router } = setupDashboardView();
    await router.push('/dashboard');
    await router.isReady();

    const authStore = useAuthStore(pinia);
    // Authenticated token without user object payload
    authStore.accessToken = 'test-token';
    authStore.user = null;

    expect(() => {
      mount(DashboardView, {
        global: { plugins: [pinia, router] },
      });
    }).not.toThrow();
  });

  // Edge Case 3: Network error during logout
  it('handles network failure during logout, shows error message, and retains authenticated session', async () => {
    const { pinia, router } = setupDashboardView();
    await router.push('/dashboard');
    await router.isReady();

    const authStore = useAuthStore(pinia);
    authStore.setAuth({ id: '1', email: 'petugas@manggar.go.id', role: 'user' }, 'token');

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response;
      }
      throw new Error('Network offline');
    });

    const wrapper = mount(DashboardView, {
      global: { plugins: [pinia, router] },
    });

    const logoutBtn = wrapper.find('button');
    await logoutBtn.trigger('click');
    await vi.waitUntil(() => wrapper.text().includes('kesalahan jaringan'));

    expect(wrapper.text()).toContain('Terjadi kesalahan jaringan saat keluar. Silakan coba lagi.');
    expect(authStore.isAuthenticated).toBe(true);
    expect(logoutBtn.attributes('disabled')).toBeUndefined();
  });

  // Edge Case 4: Server HTTP 500 error during logout
  it('handles server rejection (500) during logout, shows error message, and retains authenticated session', async () => {
    const { pinia, router } = setupDashboardView();
    await router.push('/dashboard');
    await router.isReady();

    const authStore = useAuthStore(pinia);
    authStore.setAuth({ id: '1', email: 'petugas@manggar.go.id', role: 'user' }, 'token');

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response;
      }
      return { ok: false, status: 500, json: async () => ({}) } as Response;
    });

    const wrapper = mount(DashboardView, {
      global: { plugins: [pinia, router] },
    });

    const logoutBtn = wrapper.find('button');
    await logoutBtn.trigger('click');
    await vi.waitUntil(() => wrapper.text().includes('Gagal keluar'));

    expect(wrapper.text()).toContain('Gagal keluar dari sesi. Silakan coba lagi.');
    expect(authStore.isAuthenticated).toBe(true);
    expect(logoutBtn.attributes('disabled')).toBeUndefined();
  });

  // Edge Case 5: CSRF token retrieval failure during logout
  it('handles CSRF token retrieval error during logout gracefully', async () => {
    const { pinia, router } = setupDashboardView();
    await router.push('/dashboard');
    await router.isReady();

    const authStore = useAuthStore(pinia);
    authStore.setAuth({ id: '1', email: 'petugas@manggar.go.id', role: 'user' }, 'token');

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('csrf-token')) {
        return {
          ok: false,
          status: 403,
          json: async () => ({ error: 'Invalid CSRF' }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const wrapper = mount(DashboardView, {
      global: { plugins: [pinia, router] },
    });

    const logoutBtn = wrapper.find('button');
    await logoutBtn.trigger('click');
    await vi.waitUntil(() => wrapper.text().includes('Gagal memvalidasi token keamanan'));

    expect(wrapper.text()).toContain(
      'Gagal memvalidasi token keamanan (CSRF). Silakan coba lagi.',
    );
    expect(authStore.isAuthenticated).toBe(true);
  });

  // Edge Case 6: Prevents concurrent re-entrance when handleLogout is called rapidly
  it('prevents concurrent re-entrance when handleLogout is invoked while already in-flight', async () => {
    const { pinia, router } = setupDashboardView();
    await router.push('/dashboard');
    await router.isReady();

    const authStore = useAuthStore(pinia);
    authStore.setAuth({ id: '1', email: 'petugas@manggar.go.id', role: 'user' }, 'token');

    let logoutCallCount = 0;
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
        logoutCallCount++;
        return logoutPromise;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const wrapper = mount(DashboardView, {
      global: { plugins: [pinia, router] },
    });

    const logoutBtn = wrapper.find('button');
    // Rapid multiple clicks
    await logoutBtn.trigger('click');
    await logoutBtn.trigger('click');
    await logoutBtn.trigger('click');

    expect(logoutCallCount).toBe(1);

    resolveLogout!({ ok: true, json: async () => ({}) } as Response);
    await vi.waitUntil(() => !authStore.isAuthenticated);
  });

  // Edge Case 7: Button disabled and shows loading indicator while request is in-flight
  it('disables the logout button and displays loading status while logout is processing', async () => {
    const { pinia, router } = setupDashboardView();
    await router.push('/dashboard');
    await router.isReady();

    const authStore = useAuthStore(pinia);
    authStore.setAuth({ id: '1', email: 'petugas@manggar.go.id', role: 'user' }, 'token');

    let resolveLogout: (res: Response) => void;
    const logoutPromise = new Promise<Response>((resolve) => {
      resolveLogout = resolve;
    });

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response;
      }
      return logoutPromise;
    });

    const wrapper = mount(DashboardView, {
      global: { plugins: [pinia, router] },
    });

    const logoutBtn = wrapper.find('button');
    await logoutBtn.trigger('click');

    // In flight
    expect(logoutBtn.attributes('disabled')).toBeDefined();
    expect(logoutBtn.text()).toContain('Memproses...');

    // Complete
    resolveLogout!({ ok: true, json: async () => ({}) } as Response);
    await vi.waitUntil(() => !authStore.isAuthenticated);
  });

  // Happy Path (Last): Display user profile metadata when authenticated
  it('displays user email and role badge when present', async () => {
    const { pinia, router } = setupDashboardView();
    await router.push('/dashboard');
    await router.isReady();

    const authStore = useAuthStore(pinia);
    authStore.setAuth(
      { id: 'admin-99', email: 'lurah@manggar.go.id', role: 'admin' },
      'valid-token',
    );

    const wrapper = mount(DashboardView, {
      global: { plugins: [pinia, router] },
    });

    expect(wrapper.text()).toContain('lurah@manggar.go.id');
    expect(wrapper.text()).toContain('admin');
  });

  // Happy Path (Last): Successful logout clears auth and redirects to /login
  it('clears auth store and redirects to /login on successful logout', async () => {
    const { pinia, router } = setupDashboardView();
    await router.push('/dashboard');
    await router.isReady();

    const authStore = useAuthStore(pinia);
    authStore.setAuth({ id: '1', email: 'user@example.com', role: 'user' }, 'token');

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const wrapper = mount(DashboardView, {
      global: { plugins: [pinia, router] },
    });

    const logoutBtn = wrapper.find('button');
    await logoutBtn.trigger('click');
    await vi.waitUntil(() => !authStore.isAuthenticated);

    expect(authStore.isAuthenticated).toBe(false);
    expect(router.currentRoute.value.path).toBe('/login');
  });
});
