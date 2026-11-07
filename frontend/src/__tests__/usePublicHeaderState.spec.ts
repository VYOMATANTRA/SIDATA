import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref, watch } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import {
  HEADER_SCROLL_THRESHOLD_PX,
  usePublicHeaderState,
} from '../composables/usePublicHeaderState';

function setScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value });
}

function scrollTo(value: number) {
  setScrollY(value);
  window.dispatchEvent(new Event('scroll'));
}

async function mountHarness(options: { overlay?: boolean; startAt?: string } = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  });
  await router.push(options.startAt ?? '/');
  await router.isReady();

  const overlay = ref(options.overlay ?? true);
  const menuOpen = ref(false);
  const crossings: boolean[] = [];

  const Harness = defineComponent({
    setup() {
      const state = usePublicHeaderState({ overlay, menuOpen });
      watch(state.isScrolled, (value) => crossings.push(value));
      return () => h('div', { 'data-background': state.background.value });
    },
  });

  const wrapper = mount(Harness, { global: { plugins: [router] } });
  const background = () => wrapper.attributes('data-background');
  return { wrapper, router, overlay, menuOpen, crossings, background };
}

describe('usePublicHeaderState', () => {
  afterEach(() => {
    setScrollY(0);
    vi.restoreAllMocks();
  });

  it('uses a single named 64px threshold', () => {
    expect(HEADER_SCROLL_THRESHOLD_PX).toBe(64);
  });

  it('is transparent at the top of an overlay route with the menu closed', async () => {
    setScrollY(0);
    const { background } = await mountHarness();
    expect(background()).toBe('transparent');
  });

  it('turns navy only once scrolled past the threshold, and back when returning above it', async () => {
    setScrollY(0);
    const { background, wrapper } = await mountHarness();

    scrollTo(HEADER_SCROLL_THRESHOLD_PX);
    await nextTick();
    expect(background()).toBe('transparent');

    scrollTo(HEADER_SCROLL_THRESHOLD_PX + 1);
    await nextTick();
    expect(background()).toBe('navy');

    scrollTo(10);
    await nextTick();
    expect(background()).toBe('transparent');
    wrapper.unmount();
  });

  it('writes reactive state only when the threshold is crossed, not on every scroll event', async () => {
    setScrollY(0);
    const { crossings, wrapper } = await mountHarness();

    for (const y of [5, 20, 40, 63]) scrollTo(y);
    for (const y of [65, 120, 500, 900]) scrollTo(y);
    for (const y of [800, 300]) scrollTo(y);
    await nextTick();

    expect(crossings).toEqual([true]);
    wrapper.unmount();
  });

  it('restores the navy state when the page loads already scrolled (refresh at a scrolled position)', async () => {
    setScrollY(480);
    const { background } = await mountHarness();
    expect(background()).toBe('navy');
  });

  it('re-reads the position on pageshow (back/forward restoring a scrolled page)', async () => {
    setScrollY(0);
    const { background } = await mountHarness();

    setScrollY(300);
    window.dispatchEvent(new Event('pageshow'));
    await nextTick();
    expect(background()).toBe('navy');
  });

  it('re-reads the position on resize', async () => {
    setScrollY(0);
    const { background } = await mountHarness();

    setScrollY(300);
    window.dispatchEvent(new Event('resize'));
    await nextTick();
    expect(background()).toBe('navy');
  });

  it('re-reads the position after a route change', async () => {
    setScrollY(0);
    const { background, router } = await mountHarness();

    setScrollY(200);
    await router.push('/peta');
    await flushPromises();
    expect(background()).toBe('navy');
  });

  it('is navy while the menu is open, even at the top', async () => {
    setScrollY(0);
    const { background, menuOpen } = await mountHarness();

    menuOpen.value = true;
    await nextTick();
    expect(background()).toBe('navy');

    menuOpen.value = false;
    await nextTick();
    expect(background()).toBe('transparent');
  });

  it('is always navy on interior (non-overlay) routes', async () => {
    setScrollY(0);
    const { background, overlay } = await mountHarness({ overlay: false });
    expect(background()).toBe('navy');

    overlay.value = true;
    await nextTick();
    expect(background()).toBe('transparent');
  });

  it('registers passive scroll/resize listeners and removes every listener on unmount', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { wrapper } = await mountHarness();

    const scrollAdd = add.mock.calls.find(([type]) => type === 'scroll');
    expect(scrollAdd?.[2]).toEqual({ passive: true });

    wrapper.unmount();
    for (const type of ['scroll', 'resize', 'pageshow']) {
      const added = add.mock.calls.filter(([t]) => t === type);
      const removed = remove.mock.calls.filter(([t]) => t === type);
      expect(added.length).toBeGreaterThan(0);
      expect(removed.map(([, fn]) => fn)).toEqual(expect.arrayContaining(added.map(([, fn]) => fn)));
    }
  });

  it('stops reacting to scrolling after unmount', async () => {
    setScrollY(0);
    const { crossings, wrapper } = await mountHarness();
    wrapper.unmount();

    scrollTo(500);
    await nextTick();
    expect(crossings).toEqual([]);
  });
});
