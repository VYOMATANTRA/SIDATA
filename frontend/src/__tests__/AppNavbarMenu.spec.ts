import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import AppNavbar from '../components/common/AppNavbar.vue';
import { stubViewport, stubResizableViewport } from './helpers/viewport';
import { acquireBodyScrollLock, resetBodyScrollLockForTests } from '../utils/bodyScrollLock';

function createMockRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div>Page</div>' } },
    ],
  });
}

// Every wrapper mounted through `mountNavbar`, so `afterEach` can unmount the ones a failed test
// never reached; otherwise a stray listener/scroll lock leaks into the following tests.
const mounted: VueWrapper[] = [];

function cleanupMounted() {
  for (const w of mounted.splice(0)) {
    try {
      w.unmount();
    } catch {
      // Already unmounted by the test itself.
    }
  }
  resetBodyScrollLockForTests();
}

afterEach(cleanupMounted);

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
  mounted.push(wrapper);
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

  it('is a bounded right-anchored sheet, so the backdrop stays visible and clickable beside it', async () => {
    const { wrapper } = await mountNavbar();
    await toggle(wrapper).trigger('click');

    const sheetClasses = panel(wrapper).classes();
    expect(sheetClasses).not.toContain('w-full');
    expect(sheetClasses.some((c) => c.startsWith('w-[min(88vw'))).toBe(true);
    expect(sheetClasses).toContain('right-0');
    expect(sheetClasses).toContain('inset-y-0');

    const backdrop = wrapper.find('[data-test="nav-backdrop"]');
    expect(backdrop.isVisible()).toBe(true);
    expect(backdrop.classes()).toContain('fixed');
    expect(backdrop.classes()).toContain('inset-0');
    wrapper.unmount();
  });

  it('exposes the sheet as a named modal dialog and makes the logo and toggle inert while open', async () => {
    const { wrapper } = await mountNavbar();
    expect(panel(wrapper).attributes('role')).toBeUndefined();
    expect(wrapper.find('[data-test="navbar-bar"]').attributes('inert')).toBeUndefined();

    await toggle(wrapper).trigger('click');
    expect(panel(wrapper).attributes('role')).toBe('dialog');
    expect(panel(wrapper).attributes('aria-modal')).toBe('true');
    expect(panel(wrapper).attributes('aria-label')).toBe('Menu navigasi');
    expect(wrapper.find('[data-test="navbar-bar"]').attributes('inert')).toBeDefined();
    // The close button's name differs from the toggle's, which reads "Tutup menu navigasi".
    expect(wrapper.find('[data-test="menu-close-btn"]').attributes('aria-label')).toBe(
      'Tutup menu',
    );
    expect(toggle(wrapper).attributes('aria-label')).toBe('Tutup menu navigasi');

    await wrapper.find('[data-test="menu-close-btn"]').trigger('click');
    expect(wrapper.find('[data-test="navbar-bar"]').attributes('inert')).toBeUndefined();
    wrapper.unmount();
  });

  it('closes on Escape while its own dialog panel is the only dialog in the document', async () => {
    const { wrapper } = await mountNavbar();
    await toggle(wrapper).trigger('click');
    expect(document.querySelectorAll('[role="dialog"][aria-modal="true"]')).toHaveLength(1);
    wrapper.find<HTMLAnchorElement>('[data-test="first"]').element.focus();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    expect(toggle(wrapper).attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('ignores Escape while a DIFFERENT modal dialog is open anywhere in the document', async () => {
    const { wrapper } = await mountNavbar();
    await toggle(wrapper).trigger('click');

    const other = document.createElement('div');
    other.setAttribute('role', 'dialog');
    other.setAttribute('aria-modal', 'true');
    document.body.appendChild(other);

    // Focus is still in the menu, but another modal owns Escape.
    wrapper.find<HTMLAnchorElement>('[data-test="first"]').element.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    expect(toggle(wrapper).attributes('aria-expanded')).toBe('true');

    // Escape from inside that dialog is ignored too.
    const input = document.createElement('input');
    other.appendChild(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(toggle(wrapper).attributes('aria-expanded')).toBe('true');

    other.remove();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    expect(toggle(wrapper).attributes('aria-expanded')).toBe('false');
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

  it('hands focus to the toggle when a non-link navigation closes the sheet with focus inside it', async () => {
    const { wrapper, router } = await mountNavbar();
    await toggle(wrapper).trigger('click');
    wrapper.find<HTMLAnchorElement>('[data-test="first"]').element.focus();

    await router.push('/peta'); // e.g. browser back/forward
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(toggle(wrapper).attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle(wrapper).element);
    wrapper.unmount();
  });

  it('does not steal focus on navigation when it was already elsewhere', async () => {
    const { wrapper, router } = await mountNavbar();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    await toggle(wrapper).trigger('click');
    outside.focus();

    await router.push('/peta');
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(document.activeElement).toBe(outside);
    outside.remove();
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

    expect(windowRemove.mock.calls.filter(([type]) => type === 'keydown').length).toBeGreaterThan(
      0,
    );
    expect(documentRemove).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    windowRemove.mockRestore();
    documentRemove.mockRestore();
  });
});

describe('AppNavbar menu: resizing across the md breakpoint while open', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  it('phone to desktop: releases the scroll lock, drops inert and dialog semantics, listens for outside clicks', async () => {
    const viewport = stubResizableViewport(false);
    const { wrapper } = await mountNavbar();
    await toggle(wrapper).trigger('click');
    expect(document.body.style.overflow).toBe('hidden');
    expect(wrapper.find('[data-test="navbar-bar"]').attributes('inert')).toBeDefined();
    expect(panel(wrapper).attributes('role')).toBe('dialog');

    // Outside presses are ignored while modal (the backdrop handles them).
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(toggle(wrapper).attributes('aria-expanded')).toBe('true');

    viewport.setMatches(true);
    await wrapper.vm.$nextTick();
    expect(toggle(wrapper).attributes('aria-expanded')).toBe('true');
    expect(document.body.style.overflow).toBe('');
    expect(wrapper.find('[data-test="navbar-bar"]').attributes('inert')).toBeUndefined();
    expect(panel(wrapper).attributes('role')).toBeUndefined();

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(toggle(wrapper).attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('desktop to phone: locks scroll, makes the bar inert and stops the outside-click listener', async () => {
    const viewport = stubResizableViewport(true);
    const { wrapper } = await mountNavbar();
    await toggle(wrapper).trigger('click');
    expect(document.body.style.overflow).toBe('');

    viewport.setMatches(false);
    await wrapper.vm.$nextTick();
    expect(document.body.style.overflow).toBe('hidden');
    expect(wrapper.find('[data-test="navbar-bar"]').attributes('inert')).toBeDefined();
    expect(panel(wrapper).attributes('role')).toBe('dialog');

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(toggle(wrapper).attributes('aria-expanded')).toBe('true');

    wrapper.unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
