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
      { path: '/peta', component: { template: '<div>peta</div>' } },
    ],
  });

  return { pinia, router };
}

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
