import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import AdminSidebar from '../components/admin/AdminSidebar.vue';
import { useAuthStore } from '../stores/auth';

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin', component: { template: '<div>Dashboard</div>' } },
      { path: '/data', component: { template: '<div>Data</div>' } },
      { path: '/users', component: { template: '<div>Users</div>' } },
      { path: '/audit-logs', component: { template: '<div>Audit</div>' } },
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
});
