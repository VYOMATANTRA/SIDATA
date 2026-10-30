import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import router from '../router/index';
import { useAuthStore } from '../stores/auth';
import App from '../App.vue';

/**
 * Regression test for a real bug: /data and /audit-logs used to be top-level routes outside the
 * admin shell, so navigating to them from the sidebar made the whole sidebar disappear. They must
 * stay nested under the /admin shell route so AdminSidebar persists across every admin page.
 *
 * Mounts App.vue (a bare top-level <RouterView/>, exactly like production) against the real
 * router rather than mounting AdminLayout directly. AdminLayout is itself the component for the
 * /admin route, so mounting it directly would put a second, manually-created AdminLayout instance
 * around the router's own — the outer one's sidebar never disappears regardless of whether the
 * nested routing is correct, so the assertions would pass even if this bug came back.
 */
describe('Admin shell persistence across navigation (real router)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);

    const authStore = useAuthStore();
    authStore.user = { id: 'u1', email: 'admin@example.com', role: 'admin' };
    authStore.accessToken = 'token';
  });

  it('keeps exactly one sidebar mounted when navigating from /admin to /data', async () => {
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();
    expect(wrapper.findAll('[data-test="admin-sidebar"]').length).toBe(1);

    await router.push('/data');
    await flushPromises();
    expect(wrapper.findAll('[data-test="admin-sidebar"]').length).toBe(1);
    expect(wrapper.find('[data-test="nav-data"]').attributes('aria-current')).toBe('page');
  });

  it('keeps exactly one sidebar mounted when navigating from /admin to /audit-logs', async () => {
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    await router.push('/audit-logs');
    await flushPromises();
    expect(wrapper.findAll('[data-test="admin-sidebar"]').length).toBe(1);
    expect(wrapper.find('[data-test="nav-sistem-log"]').attributes('aria-current')).toBe('page');
  });
});
