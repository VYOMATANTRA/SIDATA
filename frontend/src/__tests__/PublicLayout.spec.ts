import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import App from '../App.vue';
import { stubViewport } from './helpers/viewport';
import TentangPageLayout from '../components/tentang/TentangPageLayout.vue';

const Page = (name: string) =>
  defineComponent({
    name,
    setup: () => () => h('section', { 'data-test': `page-${name}` }, [h('h1', name)]),
  });

const CompatPage = defineComponent({
  name: 'CompatPage',
  setup: () => () =>
    h(TentangPageLayout, null, {
      default: () => h('section', { 'data-test': 'page-compat' }, [h('h1', 'Compat')]),
    }),
});

function setScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value });
}

function mockFetch(settings: Record<string, unknown> = {}) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/settings/public')) {
      return { ok: true, status: 200, json: async () => ({ settings }) } as Response;
    }
    if (url.startsWith('/api/pages')) {
      return { ok: true, status: 200, json: async () => ({ pages: [] }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
  globalThis.fetch = fetchMock;
  return fetchMock;
}

async function mountApp(path: string) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        component: Page('home'),
        meta: { layout: 'public', headerOverlay: true },
      },
      { path: '/peta', component: Page('peta'), meta: { layout: 'public' } },
      { path: '/publikasi', component: CompatPage, meta: { layout: 'public' } },
      { path: '/login', component: Page('login') },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(App, { global: { plugins: [pinia, router] }, attachTo: document.body });
  await flushPromises();
  return { wrapper, router, pinia };
}

describe('PublicLayout (mounted by App for routes with meta.layout = public)', () => {
  beforeEach(() => {
    setScrollY(0);
    stubViewport(true);
    mockFetch();
  });

  afterEach(() => {
    setScrollY(0);
    document.body.innerHTML = '';
    document.body.style.overflow = '';
  });

  it('renders exactly one header, one nav, one main#main-content and one footer', async () => {
    const { wrapper } = await mountApp('/peta');

    expect(wrapper.findAll('header')).toHaveLength(1);
    expect(wrapper.findAll('nav[aria-label="Navigasi Utama"]')).toHaveLength(1);
    expect(wrapper.findAll('main')).toHaveLength(1);
    expect(wrapper.find('main').attributes('id')).toBe('main-content');
    expect(wrapper.findAll('footer')).toHaveLength(1);
    expect(wrapper.find('main [data-test="page-peta"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('puts a working skip link first, pointing at the focusable main landmark', async () => {
    const { wrapper } = await mountApp('/peta');

    const skip = wrapper.find('a[href="#main-content"]');
    expect(skip.text()).toContain('Lewati ke konten utama');
    const firstFocusable = wrapper.element.querySelector('a[href], button');
    expect(firstFocusable).toBe(skip.element);
    // Focusable programmatically so the jump lands inside the content.
    expect(wrapper.find('main').attributes('tabindex')).toBe('-1');
    wrapper.unmount();
  });

  it('does not add a second main when a view still wraps itself in TentangPageLayout', async () => {
    const { wrapper } = await mountApp('/publikasi');

    expect(wrapper.findAll('main')).toHaveLength(1);
    expect(wrapper.findAll('header')).toHaveLength(1);
    expect(wrapper.findAll('footer')).toHaveLength(1);
    expect(wrapper.findAll('a[href="#main-content"]')).toHaveLength(1);
    expect(wrapper.find('main [data-test="page-compat"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('keeps the same shell instance when moving between public routes', async () => {
    const { wrapper, router } = await mountApp('/peta');
    const header = wrapper.find('header').element;

    await router.push('/publikasi');
    await flushPromises();

    expect(wrapper.find('header').element).toBe(header);
    expect(wrapper.find('[data-test="page-compat"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders routes without meta.layout outside the shell', async () => {
    const { wrapper } = await mountApp('/login');

    expect(wrapper.find('header').exists()).toBe(false);
    expect(wrapper.find('main').exists()).toBe(false);
    expect(wrapper.find('footer').exists()).toBe(false);
    expect(wrapper.find('[data-test="page-login"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('loads public settings and the page hierarchy once, from the layout', async () => {
    const fetchMock = mockFetch();
    const { wrapper } = await mountApp('/peta');

    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls.filter((u) => u.startsWith('/api/settings/public')).length).toBe(1);
    expect(urls).toContain('/api/pages?include=sections');
    wrapper.unmount();
  });

  it('shows the settings-driven branding on every route, not only Home', async () => {
    mockFetch({ appName: 'SIDATA Uji', institutionName: 'Kelurahan Uji' });

    for (const path of ['/', '/peta', '/publikasi']) {
      const { wrapper } = await mountApp(path);
      expect(wrapper.find('[data-test="navbar-title"]').text()).toBe('Kelurahan Uji');
      expect(wrapper.find('[data-test="navbar-subtitle"]').text()).toBe('SIDATA Uji');
      wrapper.unmount();
    }
  });

  describe('header state', () => {
    it('is transparent at the top of Home, navy after scrolling past the threshold', async () => {
      const { wrapper } = await mountApp('/');
      const header = wrapper.find('header');
      expect(header.attributes('data-variant')).toBe('transparent');

      setScrollY(65);
      window.dispatchEvent(new Event('scroll'));
      await nextTick();
      expect(header.attributes('data-variant')).toBe('navy');
      wrapper.unmount();
    });

    it('is navy on interior pages even at the top', async () => {
      const { wrapper } = await mountApp('/peta');
      expect(wrapper.find('header').attributes('data-variant')).toBe('navy');
      wrapper.unmount();
    });

    it('follows route changes between Home and an interior page', async () => {
      const { wrapper, router } = await mountApp('/');
      expect(wrapper.find('header').attributes('data-variant')).toBe('transparent');

      await router.push('/peta');
      await flushPromises();
      expect(wrapper.find('header').attributes('data-variant')).toBe('navy');

      await router.push('/');
      await flushPromises();
      expect(wrapper.find('header').attributes('data-variant')).toBe('transparent');
      wrapper.unmount();
    });

    it('is navy while the menu is open on Home, and uses the same bar height in every state', async () => {
      const { wrapper } = await mountApp('/');
      const bar = () => wrapper.find('nav > div > div').classes();
      const closedBar = bar();

      await wrapper.find('[data-test="hamburger-btn"]').trigger('click');
      expect(wrapper.find('header').attributes('data-variant')).toBe('navy');
      expect(bar()).toEqual(closedBar);
      wrapper.unmount();
    });

    it('removes its scroll listener when the shell unmounts', async () => {
      const remove = vi.spyOn(window, 'removeEventListener');
      const { wrapper } = await mountApp('/');
      wrapper.unmount();
      expect(remove.mock.calls.some(([type]) => type === 'scroll')).toBe(true);
      remove.mockRestore();
    });
  });

  describe('route change focus', () => {
    it('does not move focus on first load', async () => {
      const { wrapper } = await mountApp('/peta');
      expect(document.activeElement).not.toBe(wrapper.find('main').element);
      wrapper.unmount();
    });

    it('moves focus to main after a path change', async () => {
      const { wrapper, router } = await mountApp('/peta');
      wrapper.find<HTMLElement>('[data-test="hamburger-btn"]').element.focus();

      await router.push('/publikasi');
      await flushPromises();
      expect(document.activeElement).toBe(wrapper.find('main').element);
      wrapper.unmount();
    });

    it('ignores hash-only and query-only changes', async () => {
      const { wrapper, router } = await mountApp('/peta');
      const toggle = wrapper.find<HTMLElement>('[data-test="hamburger-btn"]');
      toggle.element.focus();

      await router.push('/peta#bagian');
      await flushPromises();
      await router.push('/peta?q=1');
      await flushPromises();
      expect(document.activeElement).toBe(toggle.element);
      wrapper.unmount();
    });

    it('leaves focus alone while the user is typing in a field', async () => {
      const { wrapper, router } = await mountApp('/peta');
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      await router.push('/publikasi');
      await flushPromises();
      expect(document.activeElement).toBe(input);
      input.remove();
      wrapper.unmount();
    });

    it('keeps focus the new view already placed inside main', async () => {
      const { wrapper, router } = await mountApp('/peta');
      const inner = document.createElement('button');
      wrapper.find('main').element.appendChild(inner);
      inner.focus();

      await router.push('/publikasi');
      await flushPromises();
      expect(document.activeElement).toBe(inner);
      wrapper.unmount();
    });

    it('lands on main (not the toggle) after following a menu link on mobile', async () => {
      stubViewport(false);
      const { wrapper, router } = await mountApp('/peta');
      await wrapper.find('[data-test="hamburger-btn"]').trigger('click');
      await router.push('/publikasi'); // what a menu link click does
      await flushPromises();

      expect(wrapper.find('[data-test="hamburger-btn"]').attributes('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(wrapper.find('main').element);
      wrapper.unmount();
    });
  });

  describe('mobile menu modality', () => {
    it('makes the skip link, main and footer inert while the mobile sheet is open, and restores them', async () => {
      stubViewport(false);
      const { wrapper } = await mountApp('/peta');
      expect(wrapper.find('main').attributes('inert')).toBeUndefined();

      await wrapper.find('[data-test="hamburger-btn"]').trigger('click');
      expect(wrapper.find('main').attributes('inert')).toBeDefined();
      expect(wrapper.find('footer').attributes('inert')).toBeDefined();
      expect(wrapper.find('a[href="#main-content"]').attributes('inert')).toBeDefined();
      // The header (which holds the sheet) is never inert.
      expect(wrapper.find('header').attributes('inert')).toBeUndefined();

      await wrapper.find('[data-test="menu-close-btn"]').trigger('click');
      expect(wrapper.find('main').attributes('inert')).toBeUndefined();
      expect(wrapper.find('footer').attributes('inert')).toBeUndefined();
      wrapper.unmount();
    });

    it('does not make the page inert for the non-modal desktop panel', async () => {
      stubViewport(true);
      const { wrapper } = await mountApp('/peta');
      await wrapper.find('[data-test="hamburger-btn"]').trigger('click');

      expect(wrapper.find('main').attributes('inert')).toBeUndefined();
      wrapper.unmount();
    });
  });
});
