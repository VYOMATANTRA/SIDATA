import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { h, nextTick, type VNodeChild } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import PublicLayout from '../layouts/PublicLayout.vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HOME_META = { layout: 'public', headerOverlay: true } as const;

function setupHomeView() {
  const pinia = createPinia();
  setActivePinia(pinia);

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: HomeView, meta: HOME_META },
      { path: '/login', component: { template: '<div>login</div>' } },
      { path: '/users', component: { template: '<div>users</div>' } },
      { path: '/dashboard', component: { template: '<div>dashboard</div>' } },
      { path: '/data', component: { template: '<div>data</div>' } },
      { path: '/settings/audit-retention', component: { template: '<div>retention</div>' } },
    ],
  });

  return { pinia, router };
}

/** HomeView as App.vue mounts it: inside the shared PublicLayout. */
function mountHome(pinia: Pinia, router: Router, homeSlots?: Record<string, () => VNodeChild>) {
  return mount(PublicLayout, {
    global: { plugins: [pinia, router] },
    slots: {
      default: () => h(HomeView, null, homeSlots),
    },
  });
}

function setScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value });
}

describe('HomeView Phase 2 Assembly & Accessibility (TDD: Edge Cases First, Happy Path Last)', () => {
  afterEach(() => {
    setScrollY(0);
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    setScrollY(0);
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
  });

  // Edge Case 1: Semantic Landmarks & Skip Link per docs/ACCESSIBILITY.md
  it('renders semantic landmarks: skip link, AppNavbar header, main, and AppFooter with section-level Hero', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    const wrapper = mountHome(pinia, router);

    // 1. Skip to content link
    const skipLink = wrapper.find('a[href="#main-content"]');
    expect(skipLink.exists()).toBe(true);
    expect(skipLink.text()).toContain('Lewati ke konten utama');

    // 2. AppNavbar header landmark
    const header = wrapper.find('header');
    expect(header.exists()).toBe(true);
    expect(header.find('nav[aria-label="Navigasi Utama"]').exists()).toBe(true);

    // 3. Exactly one main landmark
    const mainElements = wrapper.findAll('main');
    expect(mainElements.length).toBe(1);
    expect(mainElements[0]?.attributes('id')).toBe('main-content');

    // 4. SectionHero inside main must be a <section>, not an ambiguous nested <header>
    const heroSection = wrapper.find('main section#hero');
    expect(heroSection.exists()).toBe(true);

    // 5. AppFooter footer landmark
    const footer = wrapper.find('footer');
    expect(footer.exists()).toBe(true);
    expect(footer.classes()).toContain('app-footer-root');
  });

  it('overlays the hero: transparent header at the top, navy once scrolled past the threshold', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    const wrapper = mountHome(pinia, router);
    const header = wrapper.find('header');
    expect(header.attributes('data-variant')).toBe('transparent');
    // The identity stays white over the hero while the background is transparent.
    expect(header.classes()).toContain('text-white');

    setScrollY(200);
    window.dispatchEvent(new Event('scroll'));
    await nextTick();
    expect(header.attributes('data-variant')).toBe('navy');

    setScrollY(0);
    window.dispatchEvent(new Event('scroll'));
    await nextTick();
    expect(header.attributes('data-variant')).toBe('transparent');
    wrapper.unmount();
  });

  it('starts navy when the page is restored at a scrolled position', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    setScrollY(600);
    const wrapper = mountHome(pinia, router);
    expect(wrapper.find('header').attributes('data-variant')).toBe('navy');
    wrapper.unmount();
  });

  it('turns the header navy while the menu is open at the top, and back when it closes', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    const wrapper = mountHome(pinia, router);
    const header = wrapper.find('header');
    await wrapper.find('[data-test="hamburger-btn"]').trigger('click');
    expect(header.attributes('data-variant')).toBe('navy');

    await wrapper.find('[data-test="menu-close-btn"]').trigger('click');
    expect(header.attributes('data-variant')).toBe('transparent');
    wrapper.unmount();
  });

  it('clears the overlaying header: the hero reserves space with the shared header-height variable', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    const wrapper = mountHome(pinia, router);
    // The hero's top padding is `header height + extra`, and the header height variable that the
    // class and the navbar both read must actually be defined with a length in main.css.
    expect(wrapper.find('section#hero').classes()).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^pt-\[calc\(var\(--public-header-height\)\+\d+rem\)\]$/),
      ]),
    );
    const mainCss = readFileSync(resolve(process.cwd(), 'src/assets/main.css'), 'utf8');
    expect(mainCss).toMatch(/--public-header-height:\s*[\d.]+rem;/);
    // The overlaying header pulls the page up by exactly that height (no gap, no double offset).
    expect(wrapper.find('header').classes()).toContain('-mb-[var(--public-header-height)]');
    wrapper.unmount();
  });

  // Edge Case 2: Heading Hierarchy - Exactly one h1, strict descending order without skips
  it('enforces strict heading hierarchy with single <h1> and no skipped levels in DOM order', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    const wrapper = mountHome(pinia, router);

    // Exactly one h1 on the entire page
    const h1Elements = wrapper.findAll('h1');
    expect(h1Elements.length).toBe(1);
    expect(h1Elements[0]?.text()).toContain('Sistem Informasi Data Terpadu Kelurahan');

    // Collect all headings across the view in DOM order
    const headings = wrapper.findAll('h1, h2, h3, h4, h5, h6');
    const headingLevels = headings.map((h) => parseInt(h.element.tagName.replace('H', ''), 10));

    // Verify no level jumps greater than 1 (e.g. h1 -> h3 is forbidden)
    for (let i = 1; i < headingLevels.length; i++) {
      const prev = headingLevels[i - 1]!;
      const curr = headingLevels[i]!;
      expect(curr - prev).toBeLessThanOrEqual(1);
    }

    // Check specific section headings exist with h2
    expect(wrapper.find('h2#sambutan-title').exists()).toBe(true);
    expect(wrapper.find('h2#cerita-preview-title').exists()).toBe(true);
  });

  // Edge Case 3: Sections Assembled in Exact Spec §8 Order inside <main>
  it('assembles sections in exact Spec §8 order: Hero -> Sambutan -> Cerita preview', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    const wrapper = mountHome(pinia, router);

    const mainEl = wrapper.find('main#main-content').element;
    const heroEl = wrapper.find('section#hero').element;
    const sambutanEl = wrapper.find('section[aria-labelledby="sambutan-title"]').element;
    const ceritaEl = wrapper.find('section#cerita-preview').element;

    // Verify all 3 sections are inside main#main-content
    expect(mainEl.contains(heroEl)).toBe(true);
    expect(mainEl.contains(sambutanEl)).toBe(true);
    expect(mainEl.contains(ceritaEl)).toBe(true);

    // Verify DOM position order using compareDocumentPosition (DOCUMENT_POSITION_FOLLOWING = 4)
    expect(
      heroEl.compareDocumentPosition(sambutanEl) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      sambutanEl.compareDocumentPosition(ceritaEl) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // Edge Case 4: Default Fallback Content when Cerita Slot is Omitted
  it('renders accessible fallback placeholder when cerita-preview slot is not provided', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    const wrapper = mountHome(pinia, router);

    const ceritaSection = wrapper.find('section#cerita-preview');
    expect(ceritaSection.exists()).toBe(true);
    expect(ceritaSection.find('h2#cerita-preview-title').text()).toContain('Cerita & Data Wilayah');
  });

  // Edge Case 5: Custom Slot Injection into Cerita Preview Slot
  it('renders custom slotted content when cerita-preview slot is passed', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    const wrapper = mountHome(pinia, router, {
      'cerita-preview': () =>
        h('div', { id: 'custom-cerita-content' }, 'Kartu Cerita Terintegrasi'),
    });

    expect(wrapper.find('section#cerita-preview #custom-cerita-content').exists()).toBe(true);
    expect(wrapper.find('section#cerita-preview').text()).toContain('Kartu Cerita Terintegrasi');
  });

  // Edge Case 10: Resilient initial mount when public settings and content blocks reject
  it('renders gracefully with default content when API calls for settings and blocks fail', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    globalThis.fetch = vi.fn<typeof fetch>().mockRejectedValue(new Error('Backend offline'));

    let wrapper: ReturnType<typeof mount> | undefined;
    expect(() => {
      wrapper = mountHome(pinia, router);
    }).not.toThrow();

    expect(wrapper!.find('main#main-content').exists()).toBe(true);
    expect(wrapper!.find('h1').text().length).toBeGreaterThan(0);
    expect(wrapper!.find('section#hero').exists()).toBe(true);
    expect(wrapper!.find('section#cerita-preview').exists()).toBe(true);
  });

  // Edge Case 11: Skip link target integrity
  it('ensures skip link points to valid #main-content destination', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    const wrapper = mountHome(pinia, router);

    // Skip link points to #main-content
    const skipLink = wrapper.find('a[href="#main-content"]');
    expect(skipLink.exists()).toBe(true);
    expect(wrapper.find('#main-content').exists()).toBe(true);
  });

  // Edge Case 12: Cerita preview renders "Data belum tersedia" and does NOT contain invented numbers
  it('renders "Data belum tersedia" placeholder for all 8 categories and does not render invented dummy numbers', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    const wrapper = mountHome(pinia, router);

    const ceritaSection = wrapper.find('section#cerita-preview');
    expect(ceritaSection.exists()).toBe(true);

    // Verify invented numbers from PR review are absent
    const fullText = ceritaSection.text();
    expect(fullText).not.toContain('14.210');
    expect(fullText).not.toContain('24,5 ton');
    expect(fullText).not.toContain('2 jiwa/km²');
    expect(fullText).not.toContain('45 Posyandu');

    // Verify all 8 categories render "Data belum tersedia"
    const emptyStates = ceritaSection.findAll('[data-test="stat-empty"]');
    expect(emptyStates.length).toBe(8);
    emptyStates.forEach((el) => {
      expect(el.text()).toContain('Data belum tersedia');
    });

    // Verify canonical category titles matching Spec §2
    expect(fullText).toContain('Kependudukan');
    expect(fullText).toContain('Pendidikan');
    expect(fullText).toContain('Kesehatan');
    expect(fullText).toContain('Ekonomi & Ketertiban');
    expect(fullText).toContain('Pemerintahan & Kelembagaan');
    expect(fullText).toContain('Geografis & Tata Ruang');
    expect(fullText).toContain('Infrastruktur & Perumahan');
    expect(fullText).toContain('Persampahan & Bank Sampah Unit');
  });

  // Edge Case 13: Unbuilt routes are hidden in navigation drawer and StatOverview CTA buttons
  it('hides unbuilt routes in drawer and StatOverview CTA buttons when routes are not registered', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    const wrapper = mountHome(pinia, router);

    // Open mobile drawer
    const hamburgerBtn = wrapper.find('[data-test="hamburger-btn"]');
    await hamburgerBtn.trigger('click');

    const drawer = wrapper.find('[data-test="nav-menu-drawer"]');
    expect(drawer.exists()).toBe(true);

    // Unregistered routes are hidden
    expect(drawer.find('a[href="/publikasi"]').exists()).toBe(false);
    expect(drawer.find('a[href="/peta"]').exists()).toBe(false);
    expect(drawer.find('a[href="/ketua-rt"]').exists()).toBe(false);

    // StatOverview buttons to unregistered /cerita/* routes are hidden
    const ceritaSection = wrapper.find('section#cerita-preview');
    expect(ceritaSection.findAll('[data-test="stat-overview-button"]').length).toBe(0);
  });

  // Edge Case 14: Dynamic route links and CTA buttons render when routes are registered in router
  it('renders drawer links and StatOverview CTA buttons when matching routes are registered', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);

    const routerWithRoutes = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: HomeView },
        { path: '/login', component: { template: '<div>login</div>' } },
        { path: '/publikasi', component: { template: '<div>publikasi</div>' } },
        { path: '/peta', component: { template: '<div>peta</div>' } },
        { path: '/ketua-rt', component: { template: '<div>ketua-rt</div>' } },
        { path: '/permintaan-data', component: { template: '<div>permintaan-data</div>' } },
        { path: '/tentang/kelurahan-manggar', component: { template: '<div>tentang</div>' } },
        { path: '/cerita/:slug', component: { template: '<div>cerita</div>' } },
      ],
    });

    await routerWithRoutes.push('/');
    await routerWithRoutes.isReady();

    const wrapper = mountHome(pinia, routerWithRoutes);

    // Open mobile drawer
    const hamburgerBtn = wrapper.find('[data-test="hamburger-btn"]');
    await hamburgerBtn.trigger('click');

    const drawer = wrapper.find('[data-test="nav-menu-drawer"]');
    expect(drawer.find('a[href="/publikasi"]').exists()).toBe(true);
    expect(drawer.find('a[href="/peta"]').exists()).toBe(true);
    expect(drawer.find('a[href="/ketua-rt"]').exists()).toBe(true);
    expect(drawer.find('a[href="/permintaan-data"]').exists()).toBe(true);
    expect(drawer.find('a[href="/tentang/kelurahan-manggar"]').exists()).toBe(true);

    // StatOverview CTA buttons are rendered now that /cerita/:slug matches
    const ceritaSection = wrapper.find('section#cerita-preview');
    const buttons = ceritaSection.findAll('[data-test="stat-overview-button"]');
    expect(buttons.length).toBe(8);
    expect(buttons[0]?.attributes('href')).toBe('/cerita/kependudukan');
    expect(buttons[1]?.attributes('href')).toBe('/cerita/pendidikan');
  });

  // Edge Case 15: Displays real indicators from indicatorsStore when API returns data
  it('renders real indicator statistics when /api/indicators returns data', async () => {
    const { pinia, router } = setupHomeView();

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/indicators')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            indicators: [
              {
                id: 'ind-1',
                slug: 'kependudukan-total',
                label: 'Jumlah Penduduk Resmi',
                unit: 'jiwa',
                valueCurrent: '53120',
                pageSlug: 'kependudukan',
                sortOrder: 1,
              },
            ],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    await router.push('/');
    await router.isReady();

    const wrapper = mountHome(pinia, router);

    await vi.waitUntil(() => wrapper.text().includes('53.120'));

    const ceritaSection = wrapper.find('section#cerita-preview');
    expect(ceritaSection.text()).toContain('53.120');
    expect(ceritaSection.text()).toContain('Jumlah Penduduk Resmi');
  });

  // Edge Case 16: WeatherWidget integration on Hero
  it('renders weather widget inside SectionHero on the landing page', async () => {
    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    const wrapper = mountHome(pinia, router);

    const heroWeather = wrapper.find('section#hero [data-test="hero-weather"]');
    expect(heroWeather.exists()).toBe(true);
    expect(heroWeather.find('[data-test="weather-widget-root"]').exists()).toBe(true);
  });

  // Edge Case 17: Heading hierarchy with WeatherWidget h2 in DOM order
  it('preserves strict heading hierarchy across Hero h1, Weather h2, Sambutan h2, and Cerita h2', async () => {
    const { pinia, router } = setupHomeView();

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/weather')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            location: { desa: 'Manggar', lat: -1.2251, lon: 116.9438 },
            forecast: [
              {
                datetime: '2026-10-30 12:00:00',
                temperatureCelsius: 24,
                humidityPercent: 78,
                description: 'Berawan',
                windSpeedKmh: 15,
                windDirection: 'NW',
              },
            ],
            fetchedAt: '2026-10-30T12:00:00.000Z',
            stale: false,
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    await router.push('/');
    await router.isReady();

    const wrapper = mountHome(pinia, router);

    await vi.waitUntil(() => wrapper.find('h2#weather-widget-title').exists());

    const heroTitle = wrapper.find('h1#hero-title').element;
    const weatherTitle = wrapper.find('h2#weather-widget-title').element;
    const sambutanTitle = wrapper.find('h2#sambutan-title').element;
    const ceritaTitle = wrapper.find('h2#cerita-preview-title').element;

    expect(
      heroTitle.compareDocumentPosition(weatherTitle) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      weatherTitle.compareDocumentPosition(sambutanTitle) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      sambutanTitle.compareDocumentPosition(ceritaTitle) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('does not fetch page hierarchy on mount, only on menu open', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
    globalThis.fetch = fetchMock;

    const { pinia, router } = setupHomeView();
    await router.push('/');
    await router.isReady();

    const wrapper = mountHome(pinia, router);

    let urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls).not.toContain('/api/pages?include=sections');

    await wrapper.find('[data-test="hamburger-btn"]').trigger('click');
    await nextTick();

    urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls).toContain('/api/pages?include=sections');
    wrapper.unmount();
  });
});
