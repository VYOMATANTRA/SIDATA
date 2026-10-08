import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import AppNavbar from '../components/common/AppNavbar.vue';

function createMockRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div>Page</div>' } },
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

  it('renders white variant with solid bg-white and high contrast text colors', async () => {
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
    expect(wrapper.find('[data-test="navbar-title"]').classes()).toContain('text-slate-900');
    expect(wrapper.find('[data-test="navbar-subtitle"]').classes()).toContain('text-slate-500');
  });

  it('renders transparent variant with correct high contrast text colors', async () => {
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
    expect(wrapper.find('[data-test="navbar-title"]').classes()).toContain('text-slate-900');
    expect(wrapper.find('[data-test="navbar-subtitle"]').classes()).toContain('text-slate-500');
  });

  it('uses dark hamburger icon bars on white variant for non-text contrast', async () => {
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

    const bar = wrapper.find('[data-test="hamburger-btn"] span');
    expect(bar.classes()).toContain('bg-slate-800');
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
      attachTo: document.body,
    });

    const hamburger = wrapper.find('[data-test="hamburger-btn"]');
    expect(hamburger.attributes('aria-expanded')).toBe('false');
    expect(hamburger.attributes('aria-label')).toBe('Buka menu navigasi');
    expect(wrapper.find('[data-test="nav-menu-drawer"]').isVisible()).toBe(false);

    // Verify drawer is placed inside <nav> landmark
    expect(wrapper.find('nav').find('[data-test="nav-menu-drawer"]').exists()).toBe(true);

    // Open menu
    await hamburger.trigger('click');
    expect(hamburger.attributes('aria-expanded')).toBe('true');
    expect(hamburger.attributes('aria-label')).toBe('Tutup menu navigasi');
    expect(wrapper.find('[data-test="nav-menu-drawer"]').isVisible()).toBe(true);
    expect(wrapper.emitted('toggleMenu')).toBeTruthy();
    expect(wrapper.emitted('toggleMenu')![0]).toEqual([true]);

    // Close menu
    await hamburger.trigger('click');
    expect(hamburger.attributes('aria-expanded')).toBe('false');
    expect(hamburger.attributes('aria-label')).toBe('Buka menu navigasi');
    expect(wrapper.find('[data-test="nav-menu-drawer"]').isVisible()).toBe(false);
    expect(wrapper.emitted('toggleMenu')![1]).toEqual([false]);
    wrapper.unmount();
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
    expect(wrapper.find('[data-test="nav-menu-drawer"]').isVisible()).toBe(true);

    // Press Escape
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="nav-menu-drawer"]').isVisible()).toBe(false);
    wrapper.unmount();
  });
});
