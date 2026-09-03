import { describe, it, expect, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import router from '../router/index';
import { useAuthStore } from '../stores/auth';

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
            user: { id: '1', email: 'user@example.com', role: 'user' },
          }),
        } as Response;
      });

      // First navigation to a guarded route: refresh fails transiently, bounced to /login.
      await router.push('/');
      expect(router.currentRoute.value.name).toBe('login');
      expect(authStore.isAuthenticated).toBe(false);
      expect(authStore.isInitialized).toBe(true);

      // The session cookie is actually still valid on a later attempt (e.g. the earlier
      // failure was transient). Before the fix, the router guard never called initAuth()
      // again because isInitialized was already permanently true.
      refreshShouldSucceed = true;
      await router.push('/');
      expect(router.currentRoute.value.name).toBe('home');
      expect(authStore.isAuthenticated).toBe(true);
    },
  )

  it('redirects to /login?reason=setup_required when navigating to /setup-password without setup token', async () => {
    sessionStorage.clear()
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async () => {
      return { ok: false, status: 401, json: async () => ({}) } as Response
    })
    const pinia = createPinia()
    setActivePinia(pinia)
    const authStore = useAuthStore(pinia)
    authStore.clearAuth()

    await router.push('/setup-password')
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.reason).toBe('setup_required')
  })

  it('allows navigating to /setup-password when setupToken is present', async () => {
    sessionStorage.clear()
    const pinia = createPinia()
    setActivePinia(pinia)
    const authStore = useAuthStore(pinia)
    authStore.setSetupAuth('valid-token')

    await router.push('/setup-password')
    expect(router.currentRoute.value.name).toBe('setup-password')
  })
})
