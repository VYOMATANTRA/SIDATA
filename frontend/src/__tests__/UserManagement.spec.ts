import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import UserManagement from '../views/UserManagement.vue';

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/users', component: UserManagement },
      { path: '/settings/audit-retention', component: { template: '<div>Audit Retention</div>' } },
    ],
  });
}

describe('UserManagement Header Layout', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('renders header action buttons inside a container with flex-wrap to prevent horizontal overflow on mobile screens', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        users: [],
        roles: [{ id: 'role-1', name: 'admin' }],
      }),
    } as Response);

    const router = createTestRouter();
    await router.push('/users');
    await router.isReady();

    const wrapper = mount(UserManagement, {
      global: { plugins: [router] },
    });
    await flushPromises();

    // Locate the "Retensi Audit" link
    const auditRetentionLink = wrapper.find('a[href="/settings/audit-retention"]');
    expect(auditRetentionLink.exists()).toBe(true);
    expect(auditRetentionLink.text()).toContain('Retensi Audit');

    // The container wrapping "Retensi Audit" and "Tambah Pengguna" buttons
    const buttonContainer = auditRetentionLink.element.parentElement;
    expect(buttonContainer).not.toBeNull();
    expect(buttonContainer?.classList.contains('flex')).toBe(true);
    expect(buttonContainer?.classList.contains('flex-wrap')).toBe(true);
  });
});
