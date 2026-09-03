import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import AppNavbar from '../components/common/AppNavbar.vue';

function createMockRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/mockup/button', component: { template: '<div>Buttons</div>' } },
      { path: '/mockup/link', component: { template: '<div>Links</div>' } },
      { path: '/mockup/navbar', component: { template: '<div>Navbar</div>' } },
    ],
  });
}

describe('AppNavbar.vue', () => {
  it('renders default solid navy navbar with title, subtitle, and Balikpapan logo', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppNavbar, {
      global: {
        plugins: [router],
      },
    });

    expect(wrapper.find('header').classes()).toContain('bg-brand-navy');
    expect(wrapper.find('header').classes()).toContain('text-white');
    expect(wrapper.find('[data-test="navbar-title"]').text()).toBe('Kelurahan Manggar');
    expect(wrapper.find('[data-test="navbar-subtitle"]').text()).toBe('Kelurahan Cinta Statistik');
    expect(wrapper.find('img').attributes('alt')).toBe('Logo Kota Balikpapan');
    expect(wrapper.find('nav').attributes('aria-label')).toBe('Navigasi Utama');
  });

  it('renders white variant with solid bg-white and light text colors matching Figma', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppNavbar, {
      props: {
        variant: 'white',
      },
      global: {
        plugins: [router],
      },
    });

    expect(wrapper.find('header').classes()).toContain('bg-white');
    expect(wrapper.find('[data-test="navbar-title"]').classes()).toContain('text-slate-300');
    expect(wrapper.find('[data-test="navbar-subtitle"]').classes()).toContain('text-slate-400');
  });

  it('renders transparent variant with correct text colors', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppNavbar, {
      props: {
        variant: 'transparent',
      },
      global: {
        plugins: [router],
      },
    });

    expect(wrapper.find('header').classes()).toContain('bg-transparent');
    expect(wrapper.find('[data-test="navbar-title"]').classes()).toContain('text-slate-300');
    expect(wrapper.find('[data-test="navbar-subtitle"]').classes()).toContain('text-slate-400');
  });

  it('supports custom title and subtitle props', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppNavbar, {
      props: {
        title: 'Custom Kelurahan',
        subtitle: 'Data & Statistik',
      },
      global: {
        plugins: [router],
      },
    });

    expect(wrapper.find('[data-test="navbar-title"]').text()).toBe('Custom Kelurahan');
    expect(wrapper.find('[data-test="navbar-subtitle"]').text()).toBe('Data & Statistik');
  });

  it('toggles mobile navigation drawer on hamburger button click and emits toggleMenu', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppNavbar, {
      global: {
        plugins: [router],
      },
    });

    const hamburger = wrapper.find('[data-test="hamburger-btn"]');
    expect(hamburger.attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('[data-test="nav-menu-drawer"]').exists()).toBe(false);

    // Open menu
    await hamburger.trigger('click');
    expect(hamburger.attributes('aria-expanded')).toBe('true');
    expect(wrapper.find('[data-test="nav-menu-drawer"]').exists()).toBe(true);
    expect(wrapper.emitted('toggleMenu')).toBeTruthy();
    expect(wrapper.emitted('toggleMenu')![0]).toEqual([true]);

    // Close menu
    await hamburger.trigger('click');
    expect(hamburger.attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('[data-test="nav-menu-drawer"]').exists()).toBe(false);
    expect(wrapper.emitted('toggleMenu')![1]).toEqual([false]);
  });

  it('closes mobile menu when Escape key is pressed', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppNavbar, {
      global: {
        plugins: [router],
      },
      attachTo: document.body,
    });

    // Open menu
    await wrapper.find('[data-test="hamburger-btn"]').trigger('click');
    expect(wrapper.find('[data-test="nav-menu-drawer"]').exists()).toBe(true);

    // Press Escape
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="nav-menu-drawer"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
