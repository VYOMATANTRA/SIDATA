import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import router from '../router/index';
import { useAuthStore } from '../stores/auth';
import AdminLayout from '../layouts/AdminLayout.vue';

/**
 * Regression test for a real bug: /data and /audit-logs used to be top-level routes outside the
 * admin shell, so navigating to them from the sidebar made the whole sidebar disappear. They must
 * stay nested under the /admin shell route so AdminSidebar persists across every admin page.
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

  it('keeps the sidebar mounted when navigating from /admin to /data', async () => {
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });
    await flushPromises();
    expect(wrapper.find('[data-test="admin-sidebar"]').exists()).toBe(true);

    await router.push('/data');
    await flushPromises();
    expect(wrapper.find('[data-test="admin-sidebar"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="nav-data"]').attributes('aria-current')).toBe('page');
  });

  it('keeps the sidebar mounted when navigating from /admin to /audit-logs', async () => {
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });
    await flushPromises();

    await router.push('/audit-logs');
    await flushPromises();
    expect(wrapper.find('[data-test="admin-sidebar"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="nav-sistem-log"]').attributes('aria-current')).toBe('page');
  });
});
