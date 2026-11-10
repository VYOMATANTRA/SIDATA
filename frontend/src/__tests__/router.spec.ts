import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import router, { scrollBehavior } from '../router/index';
import type { RouteLocationNormalized } from 'vue-router';
import { useAuthStore } from '../stores/auth';

let globalScrollToSpy: ReturnType<typeof vi.spyOn>;
beforeAll(() => {
  globalScrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterAll(() => {
  globalScrollToSpy.mockRestore();
});

describe('router auth guard retry behavior', () => {
  it(
    'REGRESSION (router isInitialized gate): a transient refresh failure does not ' +
      'permanently disable silent refresh on later navigations',
    async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const authStore = useAuthStore(pinia);

      let refreshShouldSucceed = false;
      globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('csrf-token')) {
          return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response;
        }
        if (!refreshShouldSucceed) {
          return { ok: false, json: async () => ({}) } as Response;
        }
        return {
          ok: true,
          json: async () => ({
            accessToken: 'new-token',
            user: { id: '1', email: 'admin@example.com', role: 'admin' },
          }),
        } as Response;
      });

      // First navigation to a guarded route: refresh fails transiently, bounced to /login.
      await router.push('/users');
      expect(router.currentRoute.value.name).toBe('login');
      expect(authStore.isAuthenticated).toBe(false);
      expect(authStore.isInitialized).toBe(true);

      // The session cookie is actually still valid on a later attempt (e.g. the earlier
      // failure was transient). Before the fix, the router guard never called initAuth()
      // again because isInitialized was already permanently true.
      refreshShouldSucceed = true;
      await router.push('/users');
      expect(router.currentRoute.value.name).toBe('user-management');
      expect(authStore.isAuthenticated).toBe(true);
    },
  );

  it('redirects to /login?reason=setup_required when navigating to /setup-password without setup token', async () => {
    sessionStorage.clear();
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async () => {
      return { ok: false, status: 401, json: async () => ({}) } as Response;
    });
    const pinia = createPinia();
    setActivePinia(pinia);
    const authStore = useAuthStore(pinia);
    authStore.clearAuth();

    await router.push('/setup-password');
    expect(router.currentRoute.value.name).toBe('login');
    expect(router.currentRoute.value.query.reason).toBe('setup_required');
  });

  it('allows navigating to /setup-password when setupToken is present', async () => {
    sessionStorage.clear();
    const pinia = createPinia();
    setActivePinia(pinia);
    const authStore = useAuthStore(pinia);
    authStore.setSetupAuth('valid-token');

    await router.push('/setup-password');
    expect(router.currentRoute.value.name).toBe('setup-password');
  });

  it('navigates to public routes /login, /register, and /auth/callback', async () => {
    sessionStorage.clear();
    const pinia = createPinia();
    setActivePinia(pinia);
    const authStore = useAuthStore(pinia);
    authStore.clearAuth();

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async () => {
      return { ok: false, status: 401, json: async () => ({}) } as Response;
    });

    await router.push('/login');
    expect(router.currentRoute.value.path).toBe('/login');
    expect(router.currentRoute.value.name).toBe('login');

    await router.push('/register');
    expect(router.currentRoute.value.path).toBe('/register');
    expect(router.currentRoute.value.name).toBe('register');

    await router.push('/auth/callback');
    expect(router.currentRoute.value.path).toBe('/auth/callback');
    expect(router.currentRoute.value.name).toBe('auth-callback');
  });

  it('navigates to public Tentang pages and Permintaan Data page without authentication', async () => {
    sessionStorage.clear();
    const pinia = createPinia();
    setActivePinia(pinia);
    const authStore = useAuthStore(pinia);
    authStore.clearAuth();
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async () => {
      return { ok: false, status: 401, json: async () => ({}) } as Response;
    });

    await router.push('/tentang/kelurahan-manggar');
    expect(router.currentRoute.value.path).toBe('/tentang/kelurahan-manggar');
    expect(router.currentRoute.value.name).toBe('tentang-kelurahan-manggar');
    expect(router.currentRoute.value.meta.title).toBe('Tentang Kelurahan Manggar');

    await router.push('/tentang/desa-cantik');
    expect(router.currentRoute.value.path).toBe('/tentang/desa-cantik');
    expect(router.currentRoute.value.name).toBe('tentang-desa-cantik');
    expect(router.currentRoute.value.meta.title).toBe('Program Desa Cantik');

    await router.push('/tentang/vyomatantra');
    expect(router.currentRoute.value.path).toBe('/tentang/vyomatantra');
    expect(router.currentRoute.value.name).toBe('tentang-vyomatantra');
    expect(router.currentRoute.value.meta.title).toBe('Inovasi Sosial VYOMATANTRA');

    await router.push('/permintaan-data');
    expect(router.currentRoute.value.path).toBe('/permintaan-data');
    expect(router.currentRoute.value.name).toBe('permintaan-data');
    expect(router.currentRoute.value.meta.title).toBe('Permintaan Data');

    await router.push('/ketua-rt');
    expect(router.currentRoute.value.path).toBe('/ketua-rt');
    expect(router.currentRoute.value.name).toBe('ketua-rt');
    expect(router.currentRoute.value.meta.title).toBe('Ketua RT');

    await router.push('/peta');
    expect(router.currentRoute.value.path).toBe('/peta');
    expect(router.currentRoute.value.name).toBe('peta');
    expect(router.currentRoute.value.meta.title).toBe('Peta');

    // Test redirect from /tentang to /tentang/kelurahan-manggar
    await router.push('/tentang');
    expect(router.currentRoute.value.path).toBe('/tentang/kelurahan-manggar');
    expect(router.currentRoute.value.name).toBe('tentang-kelurahan-manggar');
  });

  it('navigates to the public publications page', async () => {
    sessionStorage.clear();
    const pinia = createPinia();
    setActivePinia(pinia);
    const authStore = useAuthStore(pinia);
    authStore.clearAuth();

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response);

    await router.push('/publikasi');

    expect(router.currentRoute.value.path).toBe('/publikasi');
    expect(router.currentRoute.value.name).toBe('publikasi');
  });

  it('protects /users route with authentication and admin role guards', async () => {
    sessionStorage.clear();
    const pinia = createPinia();
    setActivePinia(pinia);
    const authStore = useAuthStore(pinia);
    authStore.clearAuth();

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async () => {
      return { ok: false, status: 401, json: async () => ({}) } as Response;
    });

    // Unauthenticated -> redirected to login
    await router.push('/users');
    expect(router.currentRoute.value.name).toBe('login');

    // Authenticated non-admin -> redirected to home
    authStore.setAuth({ id: '1', email: 'user@example.com', role: 'user' }, 'valid-token');
    await router.push('/users');
    expect(router.currentRoute.value.name).toBe('home');

    // Authenticated admin -> allowed to access user-management
    authStore.setAuth({ id: '2', email: 'admin@example.com', role: 'admin' }, 'valid-token');
    await router.push('/users');
    expect(router.currentRoute.value.name).toBe('user-management');
  });

  describe('public / and protected /dashboard routes (Edge Cases First, Happy Path Last)', () => {
    // Edge Case 1: Unauthenticated visitor accessing protected /dashboard with 401
    it('redirects unauthenticated visitor from protected /dashboard route to /login when silent refresh returns 401', async () => {
      sessionStorage.clear();
      const pinia = createPinia();
      setActivePinia(pinia);
      const authStore = useAuthStore(pinia);
      authStore.clearAuth();

      globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async () => {
        return { ok: false, status: 401, json: async () => ({}) } as Response;
      });

      await router.push('/dashboard');
      expect(router.currentRoute.value.path).toBe('/login');
      expect(router.currentRoute.value.name).toBe('login');
      expect(authStore.isAuthenticated).toBe(false);
    });

    // Edge Case 2: Unauthenticated visitor accessing /dashboard with network error
    it('redirects unauthenticated visitor from /dashboard to /login on network error during silent refresh', async () => {
      sessionStorage.clear();
      const pinia = createPinia();
      setActivePinia(pinia);
      const authStore = useAuthStore(pinia);
      authStore.clearAuth();

      globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async () => {
        throw new Error('Network offline');
      });

      await router.push('/dashboard');
      expect(router.currentRoute.value.path).toBe('/login');
      expect(router.currentRoute.value.name).toBe('login');
    });

    // Edge Case 3: User requiring password change attempting to access / or /dashboard
    it('redirects user requiring password change away from /dashboard and / to /setup-password', async () => {
      sessionStorage.clear();
      const pinia = createPinia();
      setActivePinia(pinia);
      const authStore = useAuthStore(pinia);
      authStore.setAuth({ id: '1', email: 'user@example.com', role: 'user' }, 'valid-token');
      authStore.mustChangePassword = true;

      await router.push('/dashboard');
      expect(router.currentRoute.value.path).toBe('/setup-password');
      expect(router.currentRoute.value.name).toBe('setup-password');

      await router.push('/');
      expect(router.currentRoute.value.path).toBe('/setup-password');
      expect(router.currentRoute.value.name).toBe('setup-password');
    });

    // Edge Case 4: Unauthenticated visitor accessing public / route with 401 or network error
    it('allows public visitor to navigate to / without redirection even when unauthenticated or refresh fails', async () => {
      sessionStorage.clear();
      const pinia = createPinia();
      setActivePinia(pinia);
      const authStore = useAuthStore(pinia);
      authStore.clearAuth();

      globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async () => {
        return { ok: false, status: 401, json: async () => ({}) } as Response;
      });

      await router.push('/');
      expect(router.currentRoute.value.path).toBe('/');
      expect(router.currentRoute.value.name).toBe('home');
      expect(authStore.isAuthenticated).toBe(false);
    });

    // Edge Case 5: Route metadata contracts for / and /dashboard
    it('declares correct route metadata contracts for / (public) and /dashboard (protected)', () => {
      const homeRoute = router.getRoutes().find((r) => r.path === '/');
      expect(homeRoute).toBeDefined();
      expect(homeRoute?.meta.title).toBe('Beranda');
      expect(homeRoute?.meta.requiresAuth).toBeFalsy();

      const dashboardRoute = router.getRoutes().find((r) => r.path === '/dashboard');
      expect(dashboardRoute).toBeDefined();
      expect(dashboardRoute?.meta.title).toBe('Dasbor');
      expect(dashboardRoute?.meta.requiresAuth).toBe(true);
    });

    // Edge Case 6: Authenticated editor role access to /dashboard
    it('allows authenticated user with editor role to access /dashboard', async () => {
      sessionStorage.clear();
      const pinia = createPinia();
      setActivePinia(pinia);
      const authStore = useAuthStore(pinia);

      authStore.setAuth(
        { id: '30', email: 'editor@manggar.go.id', role: 'editor' },
        'editor-token',
      );
      await router.push('/');
      await router.push('/dashboard');

      expect(router.currentRoute.value.path).toBe('/dashboard');
      expect(router.currentRoute.value.name).toBe('dashboard');
    });

    // Happy Path (Last): Authenticated regular user and admin user accessing /dashboard
    it('allows authenticated regular user and admin user to access /dashboard', async () => {
      sessionStorage.clear();
      const pinia = createPinia();
      setActivePinia(pinia);
      const authStore = useAuthStore(pinia);

      // 1. Regular authenticated user
      authStore.setAuth({ id: '10', email: 'warga@manggar.go.id', role: 'user' }, 'token');
      await router.push('/dashboard');
      expect(router.currentRoute.value.path).toBe('/dashboard');
      expect(router.currentRoute.value.name).toBe('dashboard');

      // 2. Admin authenticated user: Navigate away first so route guard actually executes
      authStore.setAuth({ id: '20', email: 'admin@manggar.go.id', role: 'admin' }, 'admin-token');
      await router.push('/');
      await router.push('/dashboard');
      expect(router.currentRoute.value.path).toBe('/dashboard');
      expect(router.currentRoute.value.name).toBe('dashboard');
    });
  });

  it('protects /settings/audit-retention route with authentication and admin role guards (SPEC §3)', async () => {
    sessionStorage.clear();
    const pinia = createPinia();
    setActivePinia(pinia);
    const authStore = useAuthStore(pinia);
    authStore.clearAuth();

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async () => {
      return { ok: false, status: 401, json: async () => ({}) } as Response;
    });

    // 1. Unauthenticated -> redirected to login (non-happy path)
    await router.push('/settings/audit-retention');
    expect(router.currentRoute.value.name).toBe('login');

    // 2. Authenticated non-admin -> redirected to home (non-happy path)
    authStore.setAuth({ id: '1', email: 'user@example.com', role: 'user' }, 'valid-token');
    await router.push('/settings/audit-retention');
    expect(router.currentRoute.value.name).toBe('home');

    // 3. Authenticated admin -> allowed to access audit-retention-settings (happy path last)
    authStore.setAuth({ id: '2', email: 'admin@example.com', role: 'admin' }, 'valid-token');
    await router.push('/settings/audit-retention');
    expect(router.currentRoute.value.name).toBe('audit-retention-settings');
    expect(router.currentRoute.value.meta.title).toBe('Pengaturan Retensi Audit');
  });
});

describe('router scrollBehavior', () => {
  const loc = (path: string, hash = '', fullPath = path + hash, name?: string) =>
    ({ path, hash, fullPath, name }) as unknown as RouteLocationNormalized;
  const mkEl = (id: string, margin = '0px') => {
    const el = document.createElement('section');
    el.id = id;
    el.style.scrollMarginTop = margin;
    document.body.appendChild(el);
    return el;
  };
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('resets to the top when the path changes (window-scrolling routes)', async () => {
    expect(await scrollBehavior(loc('/peta'), loc('/'), null)).toEqual({
      top: 0,
      left: 0,
      behavior: 'instant',
    });
    expect(await scrollBehavior(loc('/users'), loc('/data'), null)).toMatchObject({ top: 0 });
  });

  it('restores the saved position on cross-path back/forward without a hash', async () => {
    const saved = { left: 0, top: 1500 };
    expect(await scrollBehavior(loc('/peta'), loc('/'), saved)).toBe(saved);
  });

  it('keeps the position on a query-only change', async () => {
    expect(await scrollBehavior(loc('/peta'), loc('/peta'), null)).toBe(false);
  });

  it('restores savedPosition on same-path query-only history back/forward (popstate)', async () => {
    const saved = { left: 0, top: 450 };
    const from = loc('/peta', '', '/peta?page=2');
    const to = loc('/peta', '', '/peta?page=1');
    expect(await scrollBehavior(to, from, saved)).toBe(saved);
  });

  it('preserves scroll position (returns false) on same-path query-only changes even if the URL has a hash', async () => {
    mkEl('target', '50px');
    const from = loc('/peta', '#target', '/peta#target');
    const to = loc('/peta', '#target', '/peta?filter=rt#target');
    expect(await scrollBehavior(to, from, null)).toBe(false);
  });

  it('ignores savedPosition on Cerita routes and resets to top without a hash', async () => {
    const saved = { left: 0, top: 1500 };
    const to = loc('/cerita/penduduk', '', '/cerita/penduduk', 'cerita-page');
    const from = loc('/', '', '/');
    expect(await scrollBehavior(to, from, saved)).toEqual({
      top: 0,
      left: 0,
      behavior: 'instant',
    });
  });

  it('ignores savedPosition on Cerita routes and scrolls to the hash target', async () => {
    const el = mkEl('bab-2', '72px');
    const saved = { left: 0, top: 1500 };
    const to = loc('/cerita/penduduk', '#bab-2', '/cerita/penduduk#bab-2', 'cerita-page');
    const from = loc('/', '', '/');
    expect(await scrollBehavior(to, from, saved)).toEqual({
      el,
      top: 72,
      behavior: 'instant',
    });
  });

  it('scrolls to the hash target using its scroll-margin-top, on path or hash-only changes', async () => {
    const el = mkEl('bab-1', '88px');
    const expected = { el, top: 88, behavior: 'instant' };
    expect(await scrollBehavior(loc('/cerita/x', '#bab-1'), loc('/'), null)).toEqual(expected);
    expect(await scrollBehavior(loc('/cerita/x', '#bab-1'), loc('/cerita/x'), null)).toEqual(
      expected,
    );
  });

  it('prefers a same-path hash target over a stale savedPosition (native anchor click popstate)', async () => {
    const el = mkEl('a', '10px');
    const stale = { left: 0, top: 2500 };
    expect(await scrollBehavior(loc('/cerita/x', '#a'), loc('/cerita/x', '#a'), stale)).toEqual({
      el,
      top: 10,
      behavior: 'instant',
    });
  });

  it('A to B to A on the same path with different hashes lands on the hash target', async () => {
    const a = mkEl('a');
    const b = mkEl('b');
    const stale = { left: 0, top: 900 };
    expect(await scrollBehavior(loc('/c', '#b'), loc('/c', '#a'), stale)).toMatchObject({ el: b });
    expect(await scrollBehavior(loc('/c', '#a'), loc('/c', '#b'), stale)).toMatchObject({ el: a });
  });

  it('falls back to top (path change) or nothing (same path) for a missing hash target', async () => {
    expect(await scrollBehavior(loc('/a', '#none'), loc('/b'), null)).toMatchObject({ top: 0 });
    expect(await scrollBehavior(loc('/a', '#none'), loc('/a'), null)).toBe(false);
  });

  it('same-path missing hash target falls through to savedPosition when given', async () => {
    const saved = { left: 0, top: 321 };
    expect(await scrollBehavior(loc('/a', '#none'), loc('/a'), saved)).toBe(saved);
  });

  it('scrolls to top when hash is bare "#"', async () => {
    expect(await scrollBehavior(loc('/ketua-rt', '#'), loc('/previous'), null)).toEqual({
      top: 0,
      left: 0,
      behavior: 'instant',
    });
  });

  it('scrolls to top when hash is bare "#" even on the same path', async () => {
    expect(await scrollBehavior(loc('/publikasi', '#'), loc('/publikasi'), null)).toEqual({
      top: 0,
      left: 0,
      behavior: 'instant',
    });
  });

  it('is wired into the router instance configuration', () => {
    expect(typeof scrollBehavior).toBe('function');
    expect(router.options.scrollBehavior).toBe(scrollBehavior);
  });

  it('triggers window.scrollTo on actual router.push navigation', async () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    await router.push('/permintaan-data');
    await nextTick();
    expect(scrollToSpy).toHaveBeenCalledWith({ left: 0, top: 0, behavior: 'instant' });
    scrollToSpy.mockRestore();
  });
});
