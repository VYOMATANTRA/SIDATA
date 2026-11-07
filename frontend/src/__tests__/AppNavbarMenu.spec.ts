import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import AppNavbar from '../components/common/AppNavbar.vue';
import { acquireBodyScrollLock } from '../utils/bodyScrollLock';

function createMockRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div>Page</div>' } },
    ],
  });
}

/** `matches: true` simulates the `md` desktop breakpoint, `false` a phone. */
function stubViewport(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

async function mountNavbar(path = '/') {
  const router = createMockRouter();
  await router.push(path);
  await router.isReady();
  const wrapper = mount(AppNavbar, {
    global: { plugins: [router] },
    attachTo: document.body,
    slots: {
      menu: `<template #menu="{ close }"><a href="/first" data-test="first">Pertama</a><a href="/last" data-test="last">Terakhir</a></template>`,
    },
  });
  return { wrapper, router };
}

const toggle = (w: VueWrapper) => w.find<HTMLButtonElement>('[data-test="hamburger-btn"]');
const panel = (w: VueWrapper) => w.find('[data-test="nav-menu-drawer"]');

describe('AppNavbar menu: mobile modal sheet', () => {
  beforeEach(() => {
    stubViewport(false);
    document.body.style.overflow = '';
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('moves focus to the close button on open', async () => {
    const { wrapper } = await mountNavbar();
    await toggle(wrapper).trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(document.activeElement).toBe(
      wrapper.find('[data-test="menu-close-btn"]').element as HTMLElement,
    );
    wrapper.unmount();
  });

  it('traps Tab and Shift+Tab inside the sheet', async () => {
    const { wrapper } = await mountNavbar();
    await toggle(wrapper).trigger('click');

    const first = wrapper.find<HTMLButtonElement>('[data-test="menu-close-btn"]').element;
    const last = wrapper.find<HTMLAnchorElement>('[data-test="last"]').element;

    last.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    window.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    first.focus();
    const shiftTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true });
    window.dispatchEvent(shiftTab);
    expect(shiftTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    wrapper.unmount();
  });

  it('closes with the close button and returns focus to the toggle', async () => {
    const { wrapper } = await mountNavbar();
    await toggle(wrapper).trigger('click');
    await wrapper.find('[data-test="menu-close-btn"]').trigger('click');

    expect(toggle(wrapper).attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle(wrapper).element);
    wrapper.unmount();
  });

  it('closes on backdrop click and returns focus to the toggle', async () => {
    const { wrapper } = await mountNavbar();
    await toggle(wrapper).trigger('click');
    await wrapper.find('[data-test="nav-backdrop"]').trigger('click');

    expect(toggle(wrapper).attributes('aria-expanded')).toBe('false');
    expect(panel(wrapper).isVisible()).toBe(false);
    expect(document.activeElement).toBe(toggle(wrapper).element);
    wrapper.unmount();
  });

  it('closes on Escape and returns focus to the toggle', async () => {
    const { wrapper } = await mountNavbar();
    await toggle(wrapper).trigger('click');
    wrapper.find<HTMLAnchorElement>('[data-test="first"]').element.focus();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();

    expect(toggle(wrapper).attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle(wrapper).element);
    wrapper.unmount();
  });

  it('locks body scroll while open and restores the original overflow on close', async () => {
    document.body.style.overflow = 'auto';
    const { wrapper } = await mountNavbar();

    await toggle(wrapper).trigger('click');
    expect(document.body.style.overflow).toBe('hidden');

    await wrapper.find('[data-test="menu-close-btn"]').trigger('click');
    expect(document.body.style.overflow).toBe('auto');
    wrapper.unmount();
  });

  it('never releases a scroll lock that another overlay still holds', async () => {
    const { wrapper } = await mountNavbar();
    const releaseOther = acquireBodyScrollLock();

    await toggle(wrapper).trigger('click');
    await wrapper.find('[data-test="menu-close-btn"]').trigger('click');
    expect(document.body.style.overflow).toBe('hidden');

    releaseOther();
    expect(document.body.style.overflow).toBe('');
    wrapper.unmount();
  });

  it('restores body scroll when unmounted while open', async () => {
    const { wrapper } = await mountNavbar();
    await toggle(wrapper).trigger('click');
    expect(document.body.style.overflow).toBe('hidden');

    wrapper.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('closes when the route changes', async () => {
    const { wrapper, router } = await mountNavbar();
    await toggle(wrapper).trigger('click');
    expect(toggle(wrapper).attributes('aria-expanded')).toBe('true');

    await router.push('/peta');
    await wrapper.vm.$nextTick();

    expect(toggle(wrapper).attributes('aria-expanded')).toBe('false');
    expect(document.body.style.overflow).toBe('');
    wrapper.unmount();
  });

  it('emits toggleMenu for every open and close', async () => {
    const { wrapper } = await mountNavbar();
    await toggle(wrapper).trigger('click');
    await toggle(wrapper).trigger('click');

    expect(wrapper.emitted('toggleMenu')).toEqual([[true], [false]]);
    wrapper.unmount();
  });
});

describe('AppNavbar menu: desktop disclosure', () => {
  beforeEach(() => {
    stubViewport(true);
    document.body.style.overflow = '';
  });

  it('does not lock scroll, trap focus or steal focus on open', async () => {
    const { wrapper } = await mountNavbar();
    toggle(wrapper).element.focus();
    await toggle(wrapper).trigger('click');
    await wrapper.vm.$nextTick();

    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(toggle(wrapper).element);

    // Tab is left to the browser: the trap does not preventDefault.
    wrapper.find<HTMLAnchorElement>('[data-test="last"]').element.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    window.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    wrapper.unmount();
  });

  it('closes on Escape and returns focus to the toggle', async () => {
    const { wrapper } = await mountNavbar();
    await toggle(wrapper).trigger('click');
    wrapper.find<HTMLAnchorElement>('[data-test="first"]').element.focus();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();

    expect(toggle(wrapper).attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle(wrapper).element);
    wrapper.unmount();
  });

  it('closes on an outside pointer press but not on a press inside the header', async () => {
    const { wrapper } = await mountNavbar();
    await toggle(wrapper).trigger('click');

    wrapper
      .find('[data-test="first"]')
      .element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(toggle(wrapper).attributes('aria-expanded')).toBe('true');

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(toggle(wrapper).attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('removes its window and document listeners on unmount', async () => {
    const windowRemove = vi.spyOn(window, 'removeEventListener');
    const documentRemove = vi.spyOn(document, 'removeEventListener');
    const { wrapper } = await mountNavbar();
    await toggle(wrapper).trigger('click');

    wrapper.unmount();

    expect(windowRemove.mock.calls.filter(([type]) => type === 'keydown').length).toBeGreaterThan(0);
    expect(documentRemove).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    windowRemove.mockRestore();
    documentRemove.mockRestore();
  });
});
