import { describe, it, expect, afterEach } from 'vitest';
import { mount as baseMount, type VueWrapper } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import AppNavbar from '../components/common/AppNavbar.vue';
import { isDestinationActive, matchesPath } from '@/config/publicNav';
import { installScrollLockTracker, cleanupBodyScrollLocks } from './helpers/bodyScrollLock';

installScrollLockTracker();

const mounted: VueWrapper[] = [];

function mount(...args: Parameters<typeof baseMount>) {
  const wrapper = baseMount(...args);
  mounted.push(wrapper);
  return wrapper;
}

function cleanupMounted() {
  for (const w of mounted.splice(0)) {
    try {
      w.unmount();
    } catch {
      // Already unmounted by the test itself.
    }
  }
  cleanupBodyScrollLocks();
}

afterEach(cleanupMounted);

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

  it('keeps white foreground on the transparent background (background and foreground are separate)', async () => {
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

    const header = wrapper.find('header');
    expect(header.classes()).toContain('bg-transparent');
    expect(header.classes()).toContain('text-white');
    expect(header.classes().join(' ')).not.toContain('backdrop-blur');
    expect(wrapper.find('[data-test="navbar-title"]').classes()).toContain('text-white');
    expect(wrapper.find('[data-test="navbar-scrim"]').exists()).toBe(true);
  });

  it('lets the foreground be set independently of the background', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppNavbar, {
      props: { variant: 'transparent', foreground: 'dark' },
      global: { plugins: [router] },
    });

    expect(wrapper.find('header').classes()).toContain('bg-transparent');
    expect(wrapper.find('[data-test="navbar-title"]').classes()).toContain('text-brand-navy');
  });

  it('shows no scrim on a solid navy bar', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppNavbar, { global: { plugins: [router] } });
    expect(wrapper.find('[data-test="navbar-scrim"]').exists()).toBe(false);
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

  it('closes mobile menu when Escape key is pressed and restores focus to hamburger toggle button', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppNavbar, {
      global: {
        plugins: [router],
      },
      slots: {
        menu: '<a href="/first">Pertama</a>',
      },
      attachTo: document.body,
    });

    const hamburger = wrapper.find<HTMLButtonElement>('[data-test="hamburger-btn"]');
    // Open menu
    await hamburger.trigger('click');
    expect(hamburger.attributes('aria-expanded')).toBe('true');
    expect(wrapper.find('[data-test="nav-menu-drawer"]').isVisible()).toBe(true);

    // Focus something inside drawer
    const firstLink = wrapper.find<HTMLAnchorElement>('[data-test="nav-menu-drawer"] a');
    firstLink.element.focus();
    expect(document.activeElement).toBe(firstLink.element);

    // Press Escape
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="nav-menu-drawer"]').isVisible()).toBe(false);
    expect(hamburger.attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(hamburger.element);

    wrapper.unmount();
  });

  it('renders menu slot content and exposes close callback', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppNavbar, {
      global: {
        plugins: [router],
      },
      slots: {
        menu: `<template #menu="{ close, open }">
          <div data-test="custom-menu">
            <span data-test="open-state">{{ open }}</span>
            <button data-test="close-action" @click="close">Close</button>
          </div>
        </template>`,
      },
      attachTo: document.body,
    });

    await wrapper.find('[data-test="hamburger-btn"]').trigger('click');
    expect(wrapper.find('[data-test="custom-menu"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="open-state"]').text()).toBe('true');

    await wrapper.find('[data-test="close-action"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="nav-menu-drawer"]').isVisible()).toBe(false);

    wrapper.unmount();
  });

  it('allows natural tab navigation through drawer links and back to toggle button without keyboard trap (WCAG 2.1.2)', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppNavbar, {
      global: {
        plugins: [router],
      },
      slots: {
        menu: '<a href="/1">1</a><a href="/2">2</a>',
      },
      attachTo: document.body,
    });

    const hamburger = wrapper.find<HTMLButtonElement>('[data-test="hamburger-btn"]');
    await hamburger.trigger('click');

    const focusables = wrapper.findAll<HTMLAnchorElement>('[data-test="nav-menu-drawer"] a');
    expect(focusables.length).toBe(2);

    // Focus can naturally move to all links and return to the hamburger toggle button
    for (const link of focusables) {
      link.element.focus();
      expect(document.activeElement).toBe(link.element);
    }

    // Crucially: focus can return to the toggle button (no keyboard trap)
    hamburger.element.focus();
    expect(document.activeElement).toBe(hamburger.element);

    wrapper.unmount();
  });

  it('does not close mobile menu on Escape if the event originated from an open modal dialog', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppNavbar, {
      global: {
        plugins: [router],
      },
      slots: {
        menu: '<a href="/item">Link</a>',
      },
      attachTo: document.body,
    });

    const hamburger = wrapper.find<HTMLButtonElement>('[data-test="hamburger-btn"]');
    await hamburger.trigger('click');
    expect(wrapper.find('[data-test="nav-menu-drawer"]').isVisible()).toBe(true);

    // Simulate an open modal dialog (e.g. OtpVerificationModal) with focused element inside
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'otp-verification-title');
    const modalInput = document.createElement('input');
    modal.appendChild(modalInput);
    document.body.appendChild(modal);
    modalInput.focus();

    // Escape fired while focus is inside the modal dialog must not close the navbar menu
    modalInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="nav-menu-drawer"]').isVisible()).toBe(true);

    // Once the dialog is gone, Escape from inside the navbar menu must close the drawer
    modal.remove();
    const drawerLink = wrapper.find<HTMLAnchorElement>('[data-test="nav-menu-drawer"] a');
    drawerLink.element.focus();
    drawerLink.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="nav-menu-drawer"]').isVisible()).toBe(false);

    wrapper.unmount();
  });

  it('keeps the sticky header above page overlays (z-50) and below modals and the skip link', async () => {
    const router = createMockRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppNavbar, { props: { sticky: true }, global: { plugins: [router] } });
    const classes = wrapper.find('header').classes();
    expect(classes).toContain('sticky');
    expect(classes).toContain('z-[55]');
    expect(classes).not.toContain('z-40');
    wrapper.unmount();
  });

  describe('publicNav active matching utilities', () => {
    it('exact matches home route for isDestinationActive and matchesPath', () => {
      expect(isDestinationActive('/', '/')).toBe(true);
      expect(isDestinationActive('/', '/publikasi')).toBe(false);
      expect(matchesPath('/', '/')).toBe(true);
      expect(matchesPath('/', '/publikasi')).toBe(false);
    });

    it('matches path exactly or for subpaths with isDestinationActive and matchesPath', () => {
      expect(isDestinationActive('/tentang/kelurahan-manggar', '/tentang/kelurahan-manggar')).toBe(
        true,
      );
      expect(
        isDestinationActive('/tentang/kelurahan-manggar', '/tentang/kelurahan-manggar/visi'),
      ).toBe(true);
      expect(isDestinationActive('/tentang/kelurahan-manggar', '/tentang/desa-cantik')).toBe(false);
      expect(isDestinationActive('/tentang/kelurahan-manggar', '/peta')).toBe(false);
      expect(matchesPath('/tentang/kelurahan-manggar', '/tentang/kelurahan-manggar')).toBe(true);
      expect(matchesPath('/tentang/kelurahan-manggar', '/tentang/desa-cantik')).toBe(false);
    });
  });
});
