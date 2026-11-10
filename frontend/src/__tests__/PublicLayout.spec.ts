import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import App from '../App.vue';
import { useAuthStore } from '../stores/auth';
import { stubViewport } from './helpers/viewport';
import TentangPageLayout from '../components/tentang/TentangPageLayout.vue';
import { installScrollLockTracker, cleanupBodyScrollLocks } from './helpers/bodyScrollLock';

installScrollLockTracker();

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

const mounted: VueWrapper[] = [];

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
  mounted.push(wrapper);
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
    cleanupMounted();
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

  it('loads public settings on mount and lazily fetches the page hierarchy on menu open', async () => {
    const fetchMock = mockFetch();
    const { wrapper } = await mountApp('/peta');

    let urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls.filter((u) => u.startsWith('/api/settings/public')).length).toBe(1);
    expect(urls).not.toContain('/api/pages?include=sections');

    await wrapper.find('[data-test="hamburger-btn"]').trigger('click');
    await flushPromises();

    urls = fetchMock.mock.calls.map(([input]) => String(input));
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

    async function scrollAndReadVariants(wrapper: Awaited<ReturnType<typeof mountApp>>['wrapper']) {
      const variant = () => wrapper.find('header').attributes('data-variant');
      const seen = [variant()];
      setScrollY(1500);
      window.dispatchEvent(new Event('scroll'));
      await nextTick();
      seen.push(variant());
      setScrollY(0);
      window.dispatchEvent(new Event('scroll'));
      await nextTick();
      seen.push(variant());
      return seen;
    }

    it('turns navy on scroll after client-side navigation to Home from an interior page', async () => {
      const { wrapper, router } = await mountApp('/peta');
      await router.push('/');
      await flushPromises();
      expect(await scrollAndReadVariants(wrapper)).toEqual(['transparent', 'navy', 'transparent']);
      wrapper.unmount();
    });

    it('turns navy on scroll after leaving Home and coming back', async () => {
      const { wrapper, router } = await mountApp('/');
      await router.push('/peta');
      await flushPromises();
      await router.push('/');
      await flushPromises();
      expect(await scrollAndReadVariants(wrapper)).toEqual(['transparent', 'navy', 'transparent']);
      wrapper.unmount();
    });

    it('turns navy on scroll after arriving from a route outside the public layout', async () => {
      const { wrapper, router } = await mountApp('/login');
      await router.push('/');
      await flushPromises();
      expect(await scrollAndReadVariants(wrapper)).toEqual(['transparent', 'navy', 'transparent']);
      wrapper.unmount();
    });

    for (const desktop of [true, false]) {
      it(`turns navy on scroll after following Beranda in the open menu (${desktop ? 'desktop' : 'phone'})`, async () => {
        stubViewport(desktop);
        const { wrapper, router } = await mountApp('/peta');
        await wrapper.find('[data-test="hamburger-btn"]').trigger('click');
        const home = wrapper.findAll('a').find((a) => a.attributes('href') === '/' && a.text().includes('Beranda'));
        expect(home).toBeTruthy();
        await home!.trigger('click');
        await flushPromises();
        expect(router.currentRoute.value.path).toBe('/');
        expect(await scrollAndReadVariants(wrapper)).toEqual(['transparent', 'navy', 'transparent']);
        wrapper.unmount();
      });
    }

    it('recomputes from the real scroll position when the route changes to Home', async () => {
      const { wrapper, router } = await mountApp('/peta');
      setScrollY(1500);
      await router.push('/');
      await flushPromises();
      expect(wrapper.find('header').attributes('data-variant')).toBe('navy');
      wrapper.unmount();
    });

    it('attaches exactly one scroll listener for the shell lifetime', async () => {
      const add = vi.spyOn(window, 'addEventListener');
      const { wrapper, router } = await mountApp('/peta');
      await router.push('/');
      await flushPromises();
      await router.push('/peta');
      await flushPromises();
      expect(add.mock.calls.filter(([type]) => type === 'scroll')).toHaveLength(1);
      wrapper.unmount();
      add.mockRestore();
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

    it('moves focus to main when PublicLayout mounts fresh after in-app navigation (e.g. /login -> /)', async () => {
      const { wrapper, router } = await mountApp('/login');
      expect(wrapper.find('main').exists()).toBe(false);

      await router.push('/');
      await flushPromises();

      expect(wrapper.find('main').exists()).toBe(true);
      expect(document.activeElement).toBe(wrapper.find('main').element);
      wrapper.unmount();
    });

    it('moves focus to main after a path change', async () => {
      const { wrapper, router } = await mountApp('/peta');
      wrapper.find<HTMLElement>('[data-test="hamburger-btn"]').element.focus();

      const focusSpy = vi.spyOn(wrapper.find('main').element as HTMLElement, 'focus');
      await router.push('/publikasi');
      await flushPromises();
      expect(document.activeElement).toBe(wrapper.find('main').element);
      expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
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

    it('does not steal focus from a modal dialog that opened during navigation', async () => {
      const { wrapper, router } = await mountApp('/peta');
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      const button = document.createElement('button');
      dialog.appendChild(button);
      document.body.appendChild(dialog);
      button.focus();

      await router.push('/publikasi');
      await flushPromises();
      expect(document.activeElement).toBe(button);
      dialog.remove();
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

    it('lands on main (not the toggle) after clicking a menu link on mobile', async () => {
      stubViewport(false);
      const { wrapper } = await mountApp('/peta');
      await wrapper.find('[data-test="hamburger-btn"]').trigger('click');
      await flushPromises();

      const link = wrapper.find('a[href="/publikasi"]');
      expect(link.exists()).toBe(true);
      await link.trigger('click');
      await flushPromises();

      expect(wrapper.find('[data-test="hamburger-btn"]').attributes('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(wrapper.find('main').element);
      wrapper.unmount();
    });

    it('lands on main (not the toggle) after clicking a menu link on desktop', async () => {
      stubViewport(true);
      const { wrapper } = await mountApp('/peta');
      await wrapper.find('[data-test="hamburger-btn"]').trigger('click');
      await flushPromises();

      const link = wrapper.find('a[href="/publikasi"]');
      expect(link.exists()).toBe(true);
      await link.trigger('click');
      await flushPromises();

      expect(wrapper.find('[data-test="hamburger-btn"]').attributes('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(wrapper.find('main').element);
      wrapper.unmount();
    });

    it('returns focus to the toggle on Escape without navigation (mobile and desktop)', async () => {
      // Mobile sheet
      stubViewport(false);
      const { wrapper } = await mountApp('/peta');
      const toggle = wrapper.find('[data-test="hamburger-btn"]');
      await toggle.trigger('click');
      await flushPromises();
      expect(toggle.attributes('aria-expanded')).toBe('true');

      const mobileEsc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      window.dispatchEvent(mobileEsc);
      await flushPromises();

      expect(toggle.attributes('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(toggle.element);

      // Desktop disclosure
      stubViewport(true);
      await toggle.trigger('click');
      await flushPromises();
      expect(toggle.attributes('aria-expanded')).toBe('true');

      wrapper.find<HTMLAnchorElement>('a[href="/publikasi"]').element.focus();
      const desktopEsc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      window.dispatchEvent(desktopEsc);
      await flushPromises();

      expect(toggle.attributes('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(toggle.element);
      wrapper.unmount();
    });
  });

  describe('menu slot wiring', () => {
    it('passes the open state to the menu: a failed logout alert lives while open, is gone on close and not stale on reopen', async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('csrf-token')) {
          return { ok: true, status: 200, json: async () => ({ csrfToken: 'csrf' }) } as Response;
        }
        if (url.includes('/api/auth/logout')) {
          return { ok: false, status: 500, json: async () => ({}) } as Response;
        }
        if (url.startsWith('/api/pages')) {
          return { ok: true, status: 200, json: async () => ({ pages: [] }) } as Response;
        }
        return { ok: true, status: 200, json: async () => ({ settings: {} }) } as Response;
      });
      const { wrapper, pinia } = await mountApp('/peta');
      useAuthStore(pinia).setAuth({ id: '1', email: 'user@manggar.go.id', role: 'user' }, 'tok');
      await flushPromises();

      const toggle = () => wrapper.find('[data-test="hamburger-btn"]');
      const alert = () => wrapper.find('[data-test="menu-logout-error"]');

      await toggle().trigger('click');
      expect(toggle().attributes('aria-expanded')).toBe('true');
      await wrapper.find('[data-test="menu-logout-btn"]').trigger('click');
      await vi.waitUntil(() => alert().exists(), { timeout: 5000 });
      await flushPromises();
      // Still there while the menu stays open, and the session was kept.
      expect(alert().exists()).toBe(true);
      expect(alert().attributes('role')).toBe('alert');
      expect(useAuthStore(pinia).isAuthenticated).toBe(true);

      await toggle().trigger('click');
      expect(toggle().attributes('aria-expanded')).toBe('false');
      await flushPromises();
      expect(alert().exists()).toBe(false);

      await toggle().trigger('click');
      expect(toggle().attributes('aria-expanded')).toBe('true');
      await flushPromises();
      expect(alert().exists()).toBe(false);
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
