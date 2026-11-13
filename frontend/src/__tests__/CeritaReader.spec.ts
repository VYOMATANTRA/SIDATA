import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import { h, type Component } from 'vue';
import type { Pinia } from 'pinia';
import CeritaPageView from '../views/CeritaPageView.vue';
import PublicLayout from '../layouts/PublicLayout.vue';
import { useContentBlocksStore, type ContentBlock } from '../stores/contentBlocks.store';

/**
 * The Cerita reader's states and layout contract, with synthetic fixtures only. Browser behaviour
 * (sticky, scroll position, paint) is not covered here: jsdom does not do layout.
 */

const originalScrollIntoView = Element.prototype.scrollIntoView;
const originalIntersectionObserver = globalThis.IntersectionObserver;

const TOPIC_SLUGS = [
  'topik-satu',
  'topik-dua',
  'topik-tiga',
  'topik-empat',
  'topik-lima',
  'topik-enam',
  'topik-tujuh',
  'topik-delapan',
];

interface SectionFixture {
  id: string;
  slug: string;
  title: string | null;
  sortOrder: number;
}

function makePage(slug: string, title: string, chapterCount = 1) {
  return {
    id: `page-${slug}`,
    slug,
    title,
    sortOrder: 1,
    chapters: Array.from({ length: chapterCount }, (_, i) => ({
      id: `chap-${slug}-${i + 1}`,
      slug: `${slug}-bab-${i + 1}`,
      number: String(i + 1).padStart(2, '0'),
      title: `Bab ${i + 1}`,
      sortOrder: i + 1,
      sections: [
        {
          id: `sec-${slug}-${i + 1}`,
          slug: `seksi-${i + 1}`,
          title: null,
          sortOrder: 1,
        } satisfies SectionFixture,
      ],
    })),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

type Page = ReturnType<typeof makePage>;

interface Api {
  /** page by slug; a number is an HTTP status to answer with; a promise delays the answer. */
  pages: Record<string, Page | number | Promise<Response>>;
  blocks?: unknown[] | 'fail';
  indicators?: Record<string, unknown[] | 'fail'>;
  tables?: Record<string, { summary: unknown; detail: unknown }[] | 'fail'>;
}

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function installApi(api: Api) {
  const mock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://localhost');
    const path = url.pathname;

    if (path.startsWith('/api/pages/')) {
      const slug = decodeURIComponent(path.slice('/api/pages/'.length));
      const entry = api.pages[slug];
      if (entry instanceof Promise) return entry;
      if (typeof entry === 'number') return json({ error: 'x' }, entry);
      if (entry) return json({ page: entry });
      return json({ error: 'x' }, 404);
    }
    if (path === '/api/pages') return json({ pages: Object.values(api.pages).filter(isPage) });
    if (path === '/api/content-blocks') {
      return api.blocks === 'fail' ? json({}, 500) : json({ blocks: api.blocks ?? [] });
    }
    if (path === '/api/indicators') {
      const entry = api.indicators?.[url.searchParams.get('sectionId') ?? ''];
      return entry === 'fail' ? json({}, 500) : json({ indicators: entry ?? [] });
    }
    if (path === '/api/indicator-tables') {
      const entry = api.tables?.[url.searchParams.get('sectionId') ?? ''];
      return entry === 'fail'
        ? json({}, 500)
        : json({ tables: (entry ?? []).map((e) => e.summary) });
    }
    if (path.startsWith('/api/indicator-tables/')) {
      const id = decodeURIComponent(path.slice('/api/indicator-tables/'.length));
      for (const list of Object.values(api.tables ?? {})) {
        if (list === 'fail') continue;
        const found = list.find((e) => (e.summary as { id: string }).id === id);
        if (found) return json({ table: found.detail });
      }
    }
    // Anything else the shell asks for (public settings, ...) is simply unavailable here.
    return json({ error: 'x' }, 404);
  });
  globalThis.fetch = mock;
  return mock;
}

function isPage(value: unknown): value is Page {
  return typeof value === 'object' && value !== null && 'chapters' in value;
}

function prose(sectionId: string, id: string, body: string, sortOrder: number) {
  return {
    id,
    sectionId,
    type: 'prose',
    slug: id,
    title: null,
    body,
    metadata: null,
    sortOrder,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const MEDIA_A = '11111111-1111-4111-8111-111111111111';
const MEDIA_B = '22222222-2222-4222-8222-222222222222';
const MEDIA_C = '33333333-3333-4333-8333-333333333333';

function figureBlock(sectionId: string | null, metadata: unknown, id = `fig-${sectionId}`) {
  return {
    id,
    sectionId,
    type: 'figure',
    slug: id,
    title: null,
    body: '',
    metadata,
    sortOrder: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function storedPhoto(mediaId: string, n: number, extra: Record<string, unknown> = {}) {
  return { mediaId, alt: `Alt foto ${n}`, ...extra };
}

function indicator(sectionId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `ind-${sectionId}`,
    sectionId,
    slug: 'angka-contoh',
    label: 'Angka Contoh',
    unit: 'orang',
    valueCurrent: '12480.0000',
    valuePrevious: '12000.0000',
    periodCurrent: '2025',
    periodPrevious: '2024',
    isComputedComparison: true,
    isStale: false,
    source: 'Sumber Sintetis',
    hedgeNote: null,
    sortOrder: 1,
    comparison: { trend: 'naik', text: 'Angka naik dari 12.000 menjadi 12.480 orang.' },
    ...overrides,
  };
}

function matrixTable(sectionId: string, rows = true) {
  const id = `tbl-${sectionId}`;
  return {
    summary: { id },
    detail: {
      id,
      sectionId,
      slug: 'tabel-contoh',
      title: 'Tabel Contoh',
      kind: 'occupation',
      period: 'Juni 2024',
      source: 'Sumber Tabel Sintetis',
      sortOrder: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      rows: rows
        ? [
            {
              id: 'row-a',
              tableId: id,
              rowKey: 'a',
              label: 'Pekerjaan A',
              male: null,
              female: null,
              total: 50,
              sortOrder: 1,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
            {
              id: 'row-b',
              tableId: id,
              rowKey: 'b',
              label: 'Pekerjaan B',
              male: null,
              female: null,
              total: null,
              sortOrder: 2,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ]
        : [],
      totals: { rowCount: rows ? 2 : 0, total: rows ? 50 : null },
    },
  };
}

async function setup(path: string) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/cerita/:slug', name: 'cerita-page', component: CeritaPageView }],
  });
  await router.push(path);
  await router.isReady();
  return { pinia, router };
}

function mountView(pinia: Pinia, router: Router, attach = false) {
  return mount(CeritaPageView as Component, {
    global: { plugins: [pinia, router] },
    ...(attach ? { attachTo: document.body } : {}),
  });
}

function mountInShell(pinia: Pinia, router: Router) {
  return mount(PublicLayout, {
    global: { plugins: [pinia, router] },
    slots: { default: () => h(CeritaPageView) },
  });
}

function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('Cerita reader', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
    globalThis.IntersectionObserver = originalIntersectionObserver;
    document.body.innerHTML = '';
  });

  describe('shell', () => {
    it.each(TOPIC_SLUGS)(
      'renders a finished page inside the public shell for /cerita/%s, even with no content yet',
      async (slug) => {
        installApi({ pages: { [slug]: makePage(slug, `Topik ${slug}`, 2) } });
        const { pinia, router } = await setup(`/cerita/${slug}`);

        const wrapper = mountInShell(pinia, router);
        await flushPromises();

        expect(wrapper.findAll('h1')).toHaveLength(1);
        expect(wrapper.find('h1').text()).toBe(`Topik ${slug}`);
        expect(wrapper.findAll('main')).toHaveLength(1);
        expect(wrapper.find('main#main-content [data-test="cerita-hero"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="cerita-hero-meta"]').text()).toBe('2 bab');
        expect(wrapper.find('footer').exists()).toBe(true);
        // Seeded database: chapters exist, sections hold nothing yet.
        expect(wrapper.findAll('[data-test="chapter-empty"]')).toHaveLength(2);
        expect(wrapper.find('[data-test="cerita-page-empty"]').exists()).toBe(true);
        wrapper.unmount();
      },
    );

    it('uses the navy hero band for the title and adds no introduction copy of its own', async () => {
      installApi({ pages: { 'topik-satu': makePage('topik-satu', 'Topik Satu') } });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await flushPromises();

      const hero = wrapper.find('[data-test="cerita-hero"]');
      expect(hero.classes()).toContain('bg-surface-inverse');
      expect(hero.findAll('p').map((p) => p.text())).toEqual(['Cerita', '1 bab']);
    });
  });

  describe('states', () => {
    it('shows a worded loading state with no heading while the page is on its way', async () => {
      installApi({ pages: { 'topik-satu': deferred().promise } });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);

      const loading = wrapper.find('[data-test="cerita-loading"]');
      expect(loading.exists()).toBe(true);
      expect(loading.attributes('role')).toBe('status');
      expect(loading.text()).toContain('Memuat halaman');
      expect(wrapper.find('h1').exists()).toBe(false);
    });

    it('shows page not found with its own heading and a way home', async () => {
      installApi({ pages: {} });
      const { pinia, router } = await setup('/cerita/tidak-ada');
      const wrapper = mountInShell(pinia, router);
      await flushPromises();

      const state = wrapper.find('[data-test="cerita-not-found"]');
      expect(state.exists()).toBe(true);
      expect(wrapper.findAll('main#main-content h1')).toHaveLength(1);
      expect(wrapper.find('h1').text()).toBe('Halaman tidak ditemukan');
      expect(state.find('a[href="/"]').text()).toBe('Kembali ke Beranda');
      expect(wrapper.find('[data-test="cerita-error"]').exists()).toBe(false);
    });

    it('shows a failure with plain wording and a retry that recovers', async () => {
      const api: Api = { pages: { 'topik-satu': 500 } };
      installApi(api);
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountInShell(pinia, router);
      await flushPromises();

      const state = wrapper.find('[data-test="cerita-error"]');
      expect(state.exists()).toBe(true);
      expect(wrapper.findAll('main#main-content h1')).toHaveLength(1);
      expect(wrapper.find('h1').text()).toBe('Gagal memuat halaman');
      expect(state.find('[role="alert"]').text()).not.toMatch(/500|boom|status/i);

      api.pages['topik-satu'] = makePage('topik-satu', 'Topik Satu');
      await wrapper.find('[data-test="cerita-retry"]').trigger('click');
      await flushPromises();

      expect(wrapper.find('[data-test="cerita-error"]').exists()).toBe(false);
      expect(wrapper.find('h1').text()).toBe('Topik Satu');
    });

    it('treats a successful answer without a page as a failure, never a blank page', async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input);
        if (url.startsWith('/api/pages/')) return json({ page: null });
        return json({ blocks: [] });
      });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await flushPromises();

      expect(wrapper.find('[data-test="cerita-error"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="cerita-retry"]').exists()).toBe(true);
    });

    it('tells readers when the whole page has no content yet', async () => {
      installApi({ pages: { 'topik-satu': makePage('topik-satu', 'Topik Satu', 3) } });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await flushPromises();

      expect(wrapper.find('[data-test="cerita-page-empty"]').text()).toBe(
        'Belum ada konten yang dapat ditampilkan pada halaman ini.',
      );
      expect(wrapper.findAll('[data-test="chapter-empty"]')).toHaveLength(3);
      expect(wrapper.find('[data-test="indicator-stat"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="bar-diagram-card"]').exists()).toBe(false);
    });

    it('renders a page with no chapters without a chapter list or a blank body', async () => {
      installApi({ pages: { 'topik-satu': makePage('topik-satu', 'Topik Satu', 0) } });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await flushPromises();

      expect(wrapper.find('h1').text()).toBe('Topik Satu');
      expect(wrapper.find('[data-test="chapter-toc-rail"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="chapter-toc-sheet"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="cerita-hero-meta"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="cerita-page-empty"]').exists()).toBe(true);
    });
  });

  describe('populated page', () => {
    it('shows ordered prose, a scalar with its backend comparison, and a matrix table with its gaps', async () => {
      const page = makePage('topik-satu', 'Topik Satu', 2);
      const sec1 = page.chapters[0]!.sections[0]!.id;
      installApi({
        pages: { 'topik-satu': page },
        blocks: [
          prose(sec1, 'b-kedua', 'Paragraf kedua.', 2),
          prose(sec1, 'b-pertama', 'Paragraf pertama.', 1),
        ],
        indicators: { [sec1]: [indicator(sec1)] },
        tables: { [sec1]: [matrixTable(sec1)] },
      });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await flushPromises();

      expect(wrapper.findAll('[data-test="section-prose"]').map((p) => p.text())).toEqual([
        'Paragraf pertama.',
        'Paragraf kedua.',
      ]);

      const stat = wrapper.find('[data-test="indicator-stat"]');
      expect(stat.text()).toContain('12.480');
      expect(stat.find('[data-test="indicator-narrative"]').text()).toBe(
        'Angka naik dari 12.000 menjadi 12.480 orang.',
      );
      expect(stat.find('[data-test="indicator-source"]').text()).toBe('Sumber: Sumber Sintetis');

      // The matrix table: the row with a missing cell is left out of the chart, shown as "—".
      expect(wrapper.find('[data-test="matrix-table-period"]').text()).toContain('Juni 2024');
      expect(wrapper.findAll('[data-test="bar-item"]')).toHaveLength(1);
      expect(wrapper.find('[data-test="matrix-table-data"]').text()).toContain('—');

      // Chapter 2 holds nothing and says so; chapter 1 does not.
      const chapters = wrapper.findAll('[data-test="chapter-section"]');
      expect(chapters[0]!.find('[data-test="chapter-empty"]').exists()).toBe(false);
      expect(chapters[1]!.find('[data-test="chapter-empty"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="cerita-page-empty"]').exists()).toBe(false);
    });

    it('uses one heading outline: h1 title, h2 chapters, no skipped levels', async () => {
      const page = makePage('topik-satu', 'Topik Satu', 2);
      installApi({ pages: { 'topik-satu': page } });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await flushPromises();

      const levels = wrapper.findAll('h1, h2, h3').map((h) => h.element.tagName);
      expect(levels).toEqual(['H1', 'H2', 'H2']);
    });
  });

  describe('stored figures', () => {
    const sectionId = (page: Page) => page.chapters[0]!.sections[0]!.id;

    it('shows stored paragraphs and a single photo with its alt text, caption and credit', async () => {
      const page = makePage('topik-satu', 'Topik Satu');
      const sec = sectionId(page);
      installApi({
        pages: { 'topik-satu': page },
        blocks: [
          prose(sec, 'b-1', 'Paragraf pertama.', 1),
          prose(sec, 'b-2', 'Paragraf kedua.', 2),
          figureBlock(sec, {
            kind: 'photo',
            photos: [storedPhoto(MEDIA_A, 1, { caption: 'Gedung Contoh', credit: 'Tim Contoh' })],
          }),
        ],
      });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await flushPromises();

      expect(wrapper.findAll('[data-test="section-prose"]').map((p) => p.text())).toEqual([
        'Paragraf pertama.',
        'Paragraf kedua.',
      ]);
      const card = wrapper.find('[data-test="figure-card"]');
      expect(card.exists()).toBe(true);
      const img = card.find('img');
      expect(img.attributes('src')).toBe(`/api/media/${MEDIA_A}`);
      expect(img.attributes('alt')).toBe('Alt foto 1');
      expect(card.find('figcaption').text()).toContain('Gedung Contoh');
      expect(card.find('figcaption').text()).toContain('Tim Contoh');
      // The paragraphs come first, then the figure.
      const html = wrapper.html();
      expect(html.indexOf('Paragraf kedua.')).toBeLessThan(html.indexOf('data-test="figure-card"'));
      expect(wrapper.find('[data-test="cerita-page-empty"]').exists()).toBe(false);
    });

    it('lays two photos out as an offset pair and three or more as a swipeable carousel', async () => {
      const page = makePage('topik-satu', 'Topik Satu', 2);
      const [sec1, sec2] = page.chapters.map((c) => c.sections[0]!.id) as [string, string];
      installApi({
        pages: { 'topik-satu': page },
        blocks: [
          figureBlock(sec1, {
            kind: 'photos',
            photos: [storedPhoto(MEDIA_A, 1), storedPhoto(MEDIA_B, 2)],
          }),
          figureBlock(sec2, {
            kind: 'photos',
            photos: [storedPhoto(MEDIA_A, 1), storedPhoto(MEDIA_B, 2), storedPhoto(MEDIA_C, 3)],
          }),
        ],
      });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await flushPromises();

      const chapters = wrapper.findAll('[data-test="chapter-section"]');
      expect(chapters[0]!.find('[data-test="figure-pair"]').exists()).toBe(true);
      expect(chapters[0]!.find('[data-test="figure-carousel"]').exists()).toBe(false);
      expect(chapters[1]!.find('[data-test="figure-carousel"]').exists()).toBe(true);
      expect(chapters[1]!.findAll('[data-test="figure-card"]')).toHaveLength(3);
    });

    it('shows a diagram with its picture, and one with only bars', async () => {
      const page = makePage('topik-satu', 'Topik Satu', 2);
      const [sec1, sec2] = page.chapters.map((c) => c.sections[0]!.id) as [string, string];
      installApi({
        pages: { 'topik-satu': page },
        blocks: [
          figureBlock(sec1, {
            kind: 'diagram',
            title: 'Diagram Gambar',
            source: 'Sumber Contoh',
            image: { mediaId: MEDIA_A, alt: 'Grafik contoh' },
          }),
          figureBlock(sec2, {
            kind: 'diagram',
            title: 'Diagram Batang',
            bars: { unit: 'orang', items: [{ label: 'Kelompok A', value: 40 }] },
          }),
        ],
      });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await flushPromises();

      const diagrams = wrapper.findAll('[data-test="figure-diagram"]');
      expect(diagrams).toHaveLength(2);
      expect(diagrams[0]!.find('img').attributes('src')).toBe(`/api/media/${MEDIA_A}`);
      expect(diagrams[0]!.find('img').attributes('alt')).toBe('Grafik contoh');
      expect(diagrams[0]!.text()).toContain('Sumber: Sumber Contoh');
      expect(diagrams[1]!.find('img').exists()).toBe(false);
      expect(diagrams[1]!.text()).toContain('Kelompok A');
    });

    it('renders a section that holds only a figure, and no empty notice anywhere', async () => {
      const page = makePage('topik-satu', 'Topik Satu');
      installApi({
        pages: { 'topik-satu': page },
        blocks: [
          figureBlock(sectionId(page), { kind: 'photo', photos: [storedPhoto(MEDIA_A, 1)] }),
        ],
      });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await flushPromises();

      expect(wrapper.find('[data-test="figure-card"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="section-empty"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="chapter-empty"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="cerita-page-empty"]').exists()).toBe(false);
    });

    it('ignores a figure without a section or for a section that is not on the page', async () => {
      const page = makePage('topik-satu', 'Topik Satu');
      const metadata = { kind: 'photo', photos: [storedPhoto(MEDIA_A, 1)] };
      installApi({
        pages: { 'topik-satu': page },
        blocks: [figureBlock(null, metadata, 'fig-orphan'), figureBlock('sec-lain', metadata)],
      });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await flushPromises();

      expect(wrapper.find('[data-test="figure-card"]').exists()).toBe(false);
      expect(wrapper.find('img').exists()).toBe(false);
      expect(wrapper.find('[data-test="cerita-page-empty"]').exists()).toBe(true);
    });

    it('treats stored data it cannot read as no figure, without breaking the page', async () => {
      const page = makePage('topik-satu', 'Topik Satu');
      const sec = sectionId(page);
      installApi({
        pages: { 'topik-satu': page },
        blocks: [
          prose(sec, 'b-1', 'Teks tetap tampil.', 1),
          figureBlock(sec, { kind: 'hologram', photos: 'x' }),
        ],
      });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await flushPromises();

      expect(wrapper.find('[data-test="section-prose"]').text()).toBe('Teks tetap tampil.');
      expect(wrapper.find('[data-test="figure-card"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="figure-diagram"]').exists()).toBe(false);
    });

    it('leaves out a photo that fails to load and lays the rest out again', async () => {
      const page = makePage('topik-satu', 'Topik Satu');
      installApi({
        pages: { 'topik-satu': page },
        blocks: [
          figureBlock(sectionId(page), {
            kind: 'photos',
            photos: [storedPhoto(MEDIA_A, 1), storedPhoto(MEDIA_B, 2)],
          }),
        ],
      });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await flushPromises();

      await wrapper.findAll('img')[1]!.trigger('error');
      expect(wrapper.find('[data-test="figure-pair"]').exists()).toBe(false);
      const cards = wrapper.findAll('[data-test="figure-card"]');
      expect(cards).toHaveLength(1);
      expect(cards[0]!.find('img').attributes('src')).toBe(`/api/media/${MEDIA_A}`);
    });

    it('removes a figure whose photos all fail: no frame, no caption, and the section reads as empty', async () => {
      const page = makePage('topik-satu', 'Topik Satu');
      installApi({
        pages: { 'topik-satu': page },
        blocks: [
          figureBlock(sectionId(page), {
            kind: 'photos',
            photos: [
              storedPhoto(MEDIA_A, 1, { caption: 'Keterangan Yatim' }),
              storedPhoto(MEDIA_B, 2, { credit: 'Kredit Yatim' }),
            ],
          }),
        ],
      });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await flushPromises();
      expect(wrapper.find('[data-test="cerita-page-empty"]').exists()).toBe(false);

      await wrapper.findAll('img')[0]!.trigger('error');
      await wrapper.find('img').trigger('error');
      await flushPromises();

      expect(wrapper.find('img').exists()).toBe(false);
      expect(wrapper.find('figure').exists()).toBe(false);
      expect(wrapper.text()).not.toContain('Keterangan Yatim');
      expect(wrapper.text()).not.toContain('Kredit Yatim');
      expect(wrapper.find('[data-test="chapter-empty"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="cerita-page-empty"]').exists()).toBe(true);
    });

    it('keeps the paragraphs and shows no empty notice when the figure of a section with text fails', async () => {
      const page = makePage('topik-satu', 'Topik Satu');
      const sec = sectionId(page);
      installApi({
        pages: { 'topik-satu': page },
        blocks: [
          prose(sec, 'b-1', 'Teks bertahan.', 1),
          figureBlock(sec, { kind: 'photo', photos: [storedPhoto(MEDIA_A, 1)] }),
        ],
      });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await flushPromises();

      await wrapper.find('img').trigger('error');
      await flushPromises();

      expect(wrapper.find('figure').exists()).toBe(false);
      expect(wrapper.find('[data-test="section-prose"]').text()).toBe('Teks bertahan.');
      expect(wrapper.find('[data-test="section-empty"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="chapter-empty"]').exists()).toBe(false);
    });

    it('falls back to the bars when a diagram picture fails to load', async () => {
      const page = makePage('topik-satu', 'Topik Satu');
      installApi({
        pages: { 'topik-satu': page },
        blocks: [
          figureBlock(sectionId(page), {
            kind: 'diagram',
            title: 'Diagram Campuran',
            image: { mediaId: MEDIA_A, alt: 'Grafik' },
            bars: { items: [{ label: 'Kelompok A', value: 7 }] },
          }),
        ],
      });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await flushPromises();

      await wrapper.find('img').trigger('error');
      expect(wrapper.find('img').exists()).toBe(false);
      expect(wrapper.find('[data-test="figure-diagram"]').text()).toContain('Kelompok A');
    });

    it('does not bring a removed figure back, or re-request its photos, when unrelated content changes', async () => {
      const page = makePage('topik-satu', 'Topik Satu');
      installApi({
        pages: { 'topik-satu': page },
        blocks: [
          figureBlock(sectionId(page), {
            kind: 'photo',
            photos: [storedPhoto(MEDIA_A, 1, { caption: 'Keterangan Yatim' })],
          }),
        ],
      });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await flushPromises();
      await wrapper.find('img').trigger('error');
      await flushPromises();
      expect(wrapper.find('img').exists()).toBe(false);
      expect(wrapper.find('[data-test="chapter-empty"]').exists()).toBe(true);

      // Any content-block store change rebuilds the mapped figure objects, with equal content.
      const store = useContentBlocksStore(pinia);
      store.blocks = {
        ...store.blocks,
        'blok-lain': prose('sec-lain', 'blok-lain', 'Teks di tempat lain.', 1),
      };
      await flushPromises();

      expect(wrapper.find('img').exists()).toBe(false);
      expect(wrapper.text()).not.toContain('Keterangan Yatim');
      expect(wrapper.find('[data-test="chapter-empty"]').exists()).toBe(true);

      // A figure that really changed (an editor replaced the photo) is tried again.
      store.blocks = {
        ...store.blocks,
        [`fig-${sectionId(page)}`]: figureBlock(sectionId(page), {
          kind: 'photo',
          photos: [storedPhoto(MEDIA_B, 2)],
        }) as ContentBlock,
      };
      await flushPromises();
      expect(wrapper.find('img').attributes('src')).toBe(`/api/media/${MEDIA_B}`);
    });

    it('covers figures in the "text unavailable" notice when the content request failed', async () => {
      const page = makePage('topik-satu', 'Topik Satu');
      installApi({ pages: { 'topik-satu': page }, blocks: 'fail' });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await flushPromises();

      expect(wrapper.find('[data-test="cerita-prose-error"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="figure-card"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="section-empty"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="chapter-empty"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="cerita-page-empty"]').exists()).toBe(false);
    });

    it('still shows indicators and matrix tables beside the figure of the same section', async () => {
      const page = makePage('topik-satu', 'Topik Satu');
      const sec = sectionId(page);
      installApi({
        pages: { 'topik-satu': page },
        blocks: [
          prose(sec, 'b-1', 'Paragraf.', 1),
          figureBlock(sec, { kind: 'photo', photos: [storedPhoto(MEDIA_A, 1)] }),
        ],
        indicators: { [sec]: [indicator(sec)] },
        tables: { [sec]: [matrixTable(sec)] },
      });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await flushPromises();

      expect(wrapper.find('[data-test="section-prose"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="figure-card"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="indicator-stat"]').text()).toContain('12.480');
      expect(wrapper.find('[data-test="matrix-table-data"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="section-empty"]').exists()).toBe(false);
    });
  });

  describe('partial failures', () => {
    it('reports a failed section on its own, keeps the rest, and retries just that section', async () => {
      const page = makePage('topik-satu', 'Topik Satu', 2);
      const [sec1, sec2] = page.chapters.map((c) => c.sections[0]!.id) as [string, string];
      const api: Api = {
        pages: { 'topik-satu': page },
        blocks: [prose(sec2, 'b-1', 'Teks bab dua.', 1)],
        indicators: { [sec1]: 'fail' },
      };
      const fetchMock = installApi(api);
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await flushPromises();

      const chapters = wrapper.findAll('[data-test="chapter-section"]');
      expect(chapters[0]!.find('[data-test="section-data-error"]').exists()).toBe(true);
      expect(chapters[0]!.find('[data-test="chapter-empty"]').exists()).toBe(false);
      expect(chapters[1]!.find('[data-test="section-data-error"]').exists()).toBe(false);
      expect(chapters[1]!.find('[data-test="section-prose"]').text()).toBe('Teks bab dua.');

      // Fix the server, then retry only the failed section.
      api.indicators = { [sec1]: [indicator(sec1)] };
      const callsBefore = fetchMock.mock.calls.length;
      await wrapper.find('[data-test="section-retry"]').trigger('click');
      await flushPromises();

      expect(wrapper.find('[data-test="section-data-error"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="indicator-stat"]').exists()).toBe(true);
      const urls = fetchMock.mock.calls.slice(callsBefore).map((c) => String(c[0]));
      expect(urls.some((u) => u.includes(`sectionId=${sec1}`))).toBe(true);
      expect(urls.some((u) => u.includes(`sectionId=${sec2}`))).toBe(false);
    });

    it('says once that the text could not be loaded, claims no section is empty, and recovers', async () => {
      const page = makePage('topik-satu', 'Topik Satu', 2);
      const sec1 = page.chapters[0]!.sections[0]!.id;
      const api: Api = { pages: { 'topik-satu': page }, blocks: 'fail' };
      installApi(api);
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await flushPromises();

      expect(wrapper.find('[data-test="cerita-prose-error"]').text()).toContain(
        'Teks pada halaman ini belum dapat dimuat.',
      );
      expect(wrapper.find('[data-test="chapter-empty"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="section-empty"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="cerita-page-empty"]').exists()).toBe(false);

      api.blocks = [prose(sec1, 'b-1', 'Teks yang kembali.', 1)];
      await wrapper.find('[data-test="cerita-prose-retry"]').trigger('click');
      await flushPromises();

      expect(wrapper.find('[data-test="cerita-prose-error"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="section-prose"]').text()).toBe('Teks yang kembali.');
    });

    it('shows a table that has no rows as unavailable, never as a zero-valued chart', async () => {
      const page = makePage('topik-satu', 'Topik Satu');
      const sec1 = page.chapters[0]!.sections[0]!.id;
      installApi({
        pages: { 'topik-satu': page },
        tables: { [sec1]: [matrixTable(sec1, false)] },
      });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await flushPromises();

      expect(wrapper.find('[data-test="matrix-table-empty"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="bar-diagram-card"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="chapter-empty"]').exists()).toBe(false);
    });
  });

  describe('switching topics', () => {
    it('never shows the previous topic while the next one loads', async () => {
      const slow = deferred();
      installApi({
        pages: { 'topik-satu': makePage('topik-satu', 'Topik Satu'), 'topik-dua': slow.promise },
      });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await flushPromises();
      expect(wrapper.find('h1').text()).toBe('Topik Satu');

      await router.push('/cerita/topik-dua');
      await flushPromises();

      expect(wrapper.find('[data-test="cerita-loading"]').exists()).toBe(true);
      expect(wrapper.text()).not.toContain('Topik Satu');
      expect(wrapper.find('h1').exists()).toBe(false);

      slow.resolve(json({ page: makePage('topik-dua', 'Topik Dua') }));
      await flushPromises();
      expect(wrapper.find('h1').text()).toBe('Topik Dua');
    });

    it('does not carry the previous topic failure or not-found over to the next one', async () => {
      const slow = deferred();
      installApi({ pages: { 'topik-satu': 500, 'topik-dua': slow.promise } });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await flushPromises();
      expect(wrapper.find('[data-test="cerita-error"]').exists()).toBe(true);

      await router.push('/cerita/topik-dua');
      await flushPromises();
      expect(wrapper.find('[data-test="cerita-error"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="cerita-not-found"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="cerita-loading"]').exists()).toBe(true);

      slow.resolve(json({ page: makePage('topik-dua', 'Topik Dua') }));
      await flushPromises();
      expect(wrapper.find('h1').text()).toBe('Topik Dua');
      expect(wrapper.find('[data-test="cerita-error"]').exists()).toBe(false);
    });

    it('lets a late answer for an abandoned topic settle without touching the current one', async () => {
      const a = deferred();
      const b = deferred();
      installApi({ pages: { 'topik-satu': a.promise, 'topik-dua': b.promise } });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await router.push('/cerita/topik-dua');
      await flushPromises();

      // Topic one answers with a failure after the reader already moved to topic two.
      a.resolve(json({}, 500));
      await flushPromises();
      expect(wrapper.find('[data-test="cerita-loading"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="cerita-error"]').exists()).toBe(false);

      b.resolve(json({ page: makePage('topik-dua', 'Topik Dua') }));
      await flushPromises();
      expect(wrapper.find('h1').text()).toBe('Topik Dua');
      expect(wrapper.find('[data-test="cerita-error"]').exists()).toBe(false);
    });

    it('survives going A, B, A without the first A request overriding the second', async () => {
      const firstA = deferred();
      const pageA = makePage('topik-satu', 'Topik Satu');
      const fetchMock = installApi({
        pages: { 'topik-satu': firstA.promise, 'topik-dua': makePage('topik-dua', 'Topik Dua') },
      });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await router.push('/cerita/topik-dua');
      await flushPromises();
      expect(wrapper.find('h1').text()).toBe('Topik Dua');

      await router.push('/cerita/topik-satu');
      await flushPromises();
      firstA.resolve(json({ page: pageA }));
      await flushPromises();

      expect(wrapper.find('h1').text()).toBe('Topik Satu');
      expect(wrapper.find('[data-test="cerita-loading"]').exists()).toBe(false);
      const pageCalls = fetchMock.mock.calls.filter((c) => String(c[0]).startsWith('/api/pages/'));
      expect(pageCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('highlights the new topic’s first chapter, not the old topic’s', async () => {
      installApi({
        pages: {
          'topik-satu': makePage('topik-satu', 'Topik Satu', 2),
          'topik-dua': makePage('topik-dua', 'Topik Dua', 2),
        },
      });
      const { pinia, router } = await setup('/cerita/topik-satu');
      const wrapper = mountView(pinia, router);
      await flushPromises();
      await wrapper
        .findAll('[data-test="chapter-toc-rail"] [data-test="chapter-toc-link"]')[1]!
        .trigger('click');

      await router.push('/cerita/topik-dua');
      await flushPromises();

      const active = wrapper.find('[data-test="chapter-toc-rail"] [aria-current="true"]');
      expect(active.attributes('href')).toBe('#topik-dua-bab-1');
    });
  });

  describe('chapter navigation and deep links', () => {
    async function mountWithHash(hash: string, attach = true): Promise<VueWrapper> {
      installApi({ pages: { 'topik-satu': makePage('topik-satu', 'Topik Satu', 3) } });
      const { pinia, router } = await setup(`/cerita/topik-satu${hash}`);
      const wrapper = mountView(pinia, router, attach);
      await flushPromises();
      return wrapper as unknown as VueWrapper;
    }

    it('scrolls to the hash chapter once the chapters exist and marks it as the current chapter', async () => {
      const scrollIntoView = vi.fn<() => void>();
      Element.prototype.scrollIntoView = scrollIntoView;

      const wrapper = await mountWithHash('#topik-satu-bab-3');

      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById('topik-satu-bab-3'));
      const active = wrapper.find('[data-test="chapter-toc-rail"] [aria-current="true"]');
      expect(active.attributes('href')).toBe('#topik-satu-bab-3');
      expect(wrapper.find('[data-test="chapter-toc-current"]').text()).toContain('Bab 3');
      wrapper.unmount();
    });

    it('does not scroll when the hash matches nothing, and highlights the first chapter', async () => {
      const scrollIntoView = vi.fn<() => void>();
      Element.prototype.scrollIntoView = scrollIntoView;

      const wrapper = await mountWithHash('#tidak-ada');

      expect(scrollIntoView).not.toHaveBeenCalled();
      const active = wrapper.find('[data-test="chapter-toc-rail"] [aria-current="true"]');
      expect(active.attributes('href')).toBe('#topik-satu-bab-1');
      wrapper.unmount();
    });

    it('builds the scroll-spy band from the real header height and the mobile selector', async () => {
      const observed: { options?: IntersectionObserverInit; targets: Element[] }[] = [];
      globalThis.IntersectionObserver = class {
        targets: Element[] = [];
        constructor(
          _callback: IntersectionObserverCallback,
          readonly options?: IntersectionObserverInit,
        ) {
          observed.push(this);
        }
        observe(el: Element) {
          this.targets.push(el);
        }
        disconnect() {}
        unobserve() {}
        takeRecords() {
          return [];
        }
      } as unknown as typeof IntersectionObserver;
      document.documentElement.style.setProperty('--public-header-height', '5rem');
      Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
      const rect = vi
        .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockImplementation(function (this: HTMLElement) {
          const height = this.matches('[data-test="chapter-toc-sheet"]') ? 48 : 0;
          return {
            height,
            top: 0,
            bottom: height,
            left: 0,
            right: 0,
            width: 0,
            x: 0,
            y: 0,
          } as DOMRect;
        });

      const wrapper = await mountWithHash('');

      const spy = observed[observed.length - 1]!;
      // header 5rem = 80px (jsdom root font size falls back to 16px) + selector 48px + 16px gap
      expect(spy.options?.rootMargin).toBe('-144px 0px -480px 0px');
      expect(spy.targets.map((el: Element) => el.id)).toEqual([
        'topik-satu-bab-1',
        'topik-satu-bab-2',
        'topik-satu-bab-3',
      ]);
      rect.mockRestore();
      document.documentElement.style.removeProperty('--public-header-height');
      wrapper.unmount();
    });

    it('keeps the spy band open on a short landscape viewport', async () => {
      const observed: { options?: IntersectionObserverInit }[] = [];
      globalThis.IntersectionObserver = class {
        constructor(
          _callback: IntersectionObserverCallback,
          readonly options?: IntersectionObserverInit,
        ) {
          observed.push(this);
        }
        observe() {}
        disconnect() {}
        unobserve() {}
        takeRecords() {
          return [];
        }
      } as unknown as typeof IntersectionObserver;
      document.documentElement.style.setProperty('--public-header-height', '4.5rem');
      Object.defineProperty(window, 'innerHeight', { value: 300, configurable: true });

      const wrapper = await mountWithHash('');

      const margin = observed[observed.length - 1]!.options!.rootMargin!;
      const [top, , bottom] = margin.split(' ').map((v: string) => Math.abs(parseInt(v, 10)));
      expect(300 - top! - bottom!).toBeGreaterThanOrEqual(48);
      document.documentElement.style.removeProperty('--public-header-height');
      Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
      wrapper.unmount();
    });

    it('updates the current chapter from the spy', async () => {
      let callback!: IntersectionObserverCallback;
      globalThis.IntersectionObserver = class {
        constructor(cb: IntersectionObserverCallback) {
          callback = cb;
        }
        observe() {}
        disconnect() {}
        unobserve() {}
        takeRecords() {
          return [];
        }
      } as unknown as typeof IntersectionObserver;

      const wrapper = await mountWithHash('');
      const second = document.getElementById('topik-satu-bab-2')!;
      callback(
        [
          {
            isIntersecting: true,
            target: second,
            boundingClientRect: { top: 10 } as DOMRectReadOnly,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
      await flushPromises();

      const active = wrapper.find('[data-test="chapter-toc-rail"] [aria-current="true"]');
      expect(active.attributes('href')).toBe('#topik-satu-bab-2');
      wrapper.unmount();
    });
  });
});
