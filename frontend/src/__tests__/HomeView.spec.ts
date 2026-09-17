import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import { useAuthStore } from '../stores/auth';

function mountHomeView() {
  const pinia = createPinia();
  setActivePinia(pinia);

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: HomeView },
      { path: '/login', component: { template: '<div>login</div>' } },
      { path: '/users', component: { template: '<div>users</div>' } },
    ],
  });

  return { pinia, router };
}

describe('HomeView rendering & accessibility', () => {
  it('renders semantic landmarks: nav, main, h1, and sections for public visitors', async () => {
    const { pinia, router } = mountHomeView();
    await router.push('/');
    await router.isReady();

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    const wrapper = mount(HomeView, { global: { plugins: [pinia, router] } });

    // Check semantic HTML elements per docs/ACCESSIBILITY.md
    expect(wrapper.find('nav').exists()).toBe(true);
    expect(wrapper.find('main#main-content').exists()).toBe(true);

    // Exactly one h1 on the page
    const h1Elements = wrapper.findAll('h1');
    expect(h1Elements.length).toBe(1);
    expect(h1Elements[0]?.text()).toContain('Portal Data Terpadu');

    // Unauthenticated state: shows login link
    expect(wrapper.text()).toContain('Masuk (Login)');
    expect(wrapper.find('a[href="/login"]').exists()).toBe(true);

    // Footer with institution info
    expect(wrapper.find('footer').exists()).toBe(true);
  });

  it('renders role badge and user management navigation when user is an admin', async () => {
    const { pinia, router } = mountHomeView();
    await router.push('/');
    await router.isReady();

    const authStore = useAuthStore(pinia);
    authStore.setAuth(
      { id: 'admin-1', email: 'admin@manggar.go.id', role: 'admin' },
      'access-token',
    );

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    const wrapper = mount(HomeView, { global: { plugins: [pinia, router] } });

    expect(wrapper.text()).toContain('admin@manggar.go.id');
    expect(wrapper.text()).toContain('admin');
    expect(wrapper.text()).toContain('Manajemen Pengguna');
    expect(wrapper.find('button').text()).toContain('Keluar (Logout)');
  });
});

describe('HomeView logout', () => {
  it('clears auth state and redirects to /login when the server confirms logout', async () => {
    const { pinia, router } = mountHomeView();
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

    const wrapper = mount(HomeView, { global: { plugins: [pinia, router] } });
    await wrapper.find('button').trigger('click');
    await vi.waitUntil(() => !authStore.isAuthenticated);

    expect(authStore.isAuthenticated).toBe(false);
    expect(router.currentRoute.value.path).toBe('/login');
  });

  it('keeps the session and shows an error when the server logout call fails', async () => {
    const { pinia, router } = mountHomeView();
    await router.push('/');
    await router.isReady();

    const authStore = useAuthStore(pinia);
    authStore.setAuth({ id: '1', email: 'user@example.com', role: 'user' }, 'access-token');

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });

    const wrapper = mount(HomeView, { global: { plugins: [pinia, router] } });
    await wrapper.find('button').trigger('click');
    await vi.waitUntil(() => wrapper.text().includes('Gagal keluar'));

    expect(authStore.isAuthenticated).toBe(true);
    expect(router.currentRoute.value.path).toBe('/');
  });
});
