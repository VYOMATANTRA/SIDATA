import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import UserManagement from '../views/UserManagement.vue';
import AdminLayout from '../layouts/AdminLayout.vue';
import { useAuthStore } from '../stores/auth';

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

describe('UserManagement inside AdminLayout (shell regression)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('renders without errors, contributing exactly one h1 to the page via the shell', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        users: [],
        roles: [{ id: 'role-1', name: 'admin' }],
      }),
    } as Response);

    // AdminLayout is mounted directly below as the unit under test, so its own <RouterView/>
    // must sit at matched-depth 0 — the router here stays flat (no AdminLayout route record),
    // mirroring AdminLayout.spec.ts. Nesting AdminLayout as a route component too would double
    // its depth-0 RouterView and render the shell twice.
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/admin',
          component: { template: '<div>Dashboard</div>' },
          meta: { title: 'Beranda', breadcrumb: [] },
        },
        {
          path: '/users',
          component: UserManagement,
          meta: { title: 'Manajemen Pengguna', breadcrumb: ['Sistem', 'Akun pengguna'] },
        },
        { path: '/data', component: { template: '<div>Data</div>' } },
        { path: '/audit-logs', component: { template: '<div>Audit</div>' } },
        { path: '/admin/:pathMatch(.*)*', component: { template: '<div>Admin Page</div>' } },
      ],
    });

    const authStore = useAuthStore();
    authStore.user = { id: 'u1', email: 'admin@example.com', role: 'admin' };
    authStore.accessToken = 'token';

    await router.push('/users');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.findAll('h1').length).toBe(1);
    expect(wrapper.find('h1').text()).toBe('Manajemen Pengguna');
    expect(wrapper.findComponent(UserManagement).exists()).toBe(true);
    expect(wrapper.find('h2').text()).toContain('Manajemen Pengguna');
  });
});
