import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import AdminLayout from '../layouts/AdminLayout.vue';
import { useAuthStore } from '../stores/auth';

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/admin',
        component: { template: '<div>Dashboard</div>' },
        meta: { title: 'Beranda', breadcrumb: [] },
      },
      {
        path: '/admin/cerita',
        component: { template: '<div data-test="cerita-body">Cerita Body</div>' },
        meta: { title: 'Cerita', breadcrumb: ['Cerita'] },
      },
    ],
  });
}

describe('AdminLayout.vue', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActivePinia(createPinia());
    const authStore = useAuthStore();
    authStore.user = { id: 'u1', email: 'admin@example.com', role: 'admin' };
    authStore.accessToken = 'token';
  });

  it('renders required semantic landmarks exactly once: header, nav, main', async () => {
    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });

    expect(wrapper.findAll('header').length).toBe(1);
    expect(wrapper.findAll('main').length).toBe(1);
    // AdminSidebar's <nav aria-label="Navigasi Admin"> + the breadcrumb <nav aria-label="Breadcrumb">
    const navs = wrapper.findAll('nav');
    expect(navs.length).toBe(2);
    expect(navs.some((n) => n.attributes('aria-label') === 'Navigasi Admin')).toBe(true);
    expect(navs.some((n) => n.attributes('aria-label') === 'Breadcrumb')).toBe(true);
  });

  it('renders a skip link pointing at the main content landmark', async () => {
    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });

    const skipLink = wrapper.find('a[href="#admin-main-content"]');
    expect(skipLink.exists()).toBe(true);
    expect(wrapper.find('main').attributes('id')).toBe('admin-main-content');
  });

  it('renders the breadcrumb trail from route meta, prefixed with Beranda', async () => {
    const router = createTestRouter();
    await router.push('/admin/cerita');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });

    const breadcrumb = wrapper.find('[data-test="admin-breadcrumb"]');
    expect(breadcrumb.exists()).toBe(true);
    expect(breadcrumb.text()).toContain('Beranda');
    expect(breadcrumb.text()).toContain('Cerita');
  });

  it('renders the routed child view inside the main content panel', async () => {
    const router = createTestRouter();
    await router.push('/admin/cerita');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });

    expect(wrapper.find('main [data-test="cerita-body"]').exists()).toBe(true);
  });

  it('sets the header title from route meta on navigation', async () => {
    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });
    expect(wrapper.find('[data-test="admin-header"] h1').text()).toBe('Beranda');

    await router.push('/admin/cerita');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="admin-header"] h1').text()).toBe('Cerita');
  });
});

describe('AdminLayout.vue — mobile sidebar drawer', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActivePinia(createPinia());
    const authStore = useAuthStore();
    authStore.user = { id: 'u1', email: 'admin@example.com', role: 'admin' };
    authStore.accessToken = 'token';
  });

  it('is closed by default: no backdrop, sidebar translated off-screen', async () => {
    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });

    expect(wrapper.find('[data-test="admin-sidebar-backdrop"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="admin-sidebar"]').classes()).toContain('-translate-x-full');
  });

  it('opens the sidebar and shows a backdrop when the header menu button is clicked', async () => {
    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });

    await wrapper.find('[data-test="admin-mobile-menu-toggle"]').trigger('click');

    expect(wrapper.find('[data-test="admin-sidebar-backdrop"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="admin-sidebar"]').classes()).toContain('translate-x-0');
  });

  it('closes the sidebar when the backdrop is clicked', async () => {
    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });
    await wrapper.find('[data-test="admin-mobile-menu-toggle"]').trigger('click');
    expect(wrapper.find('[data-test="admin-sidebar-backdrop"]').exists()).toBe(true);

    await wrapper.find('[data-test="admin-sidebar-backdrop"]').trigger('click');
    expect(wrapper.find('[data-test="admin-sidebar-backdrop"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="admin-sidebar"]').classes()).toContain('-translate-x-full');
  });

  it('closes the sidebar automatically after navigating to another admin page', async () => {
    const router = createTestRouter();
    await router.push('/admin');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });
    await wrapper.find('[data-test="admin-mobile-menu-toggle"]').trigger('click');
    expect(wrapper.find('[data-test="admin-sidebar-backdrop"]').exists()).toBe(true);

    await router.push('/admin/cerita');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="admin-sidebar-backdrop"]').exists()).toBe(false);
  });
});
