import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import ArticleFigure from '../components/cerita/ArticleFigure.vue';
import CeritaArticleTemplate from '../components/cerita/CeritaArticleTemplate.vue';
import CeritaHero from '../components/cerita/CeritaHero.vue';
import ChapterToc from '../components/cerita/ChapterToc.vue';
import { READER_ASIDE, READER_MAIN } from '../components/cerita/readerLayout';
import type { ArticlePhoto, CeritaArticle } from '../types/ceritaArticle';

// Synthetic content only.
const photo = (n: number, extra: Partial<ArticlePhoto> = {}): ArticlePhoto => ({
  id: `p${n}`,
  src: `/img/contoh-${n}.webp`,
  alt: `Foto ${n}`,
  caption: `Foto ${n}`,
  credit: 'Tim Contoh',
  ...extra,
});

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { template: '<div />' } }],
});

describe('article figures', () => {
  it('shows one picture as a single card with caption and credit', () => {
    const w = mount(ArticleFigure, { props: { figure: { kind: 'photo', photo: photo(1) } } });
    expect(w.findAll('[data-test="figure-card"]')).toHaveLength(1);
    expect(w.text()).toContain('Tim Contoh');
  });

  it('shows two pictures as an offset pair, and more than two as a carousel', () => {
    const pair = mount(ArticleFigure, {
      props: { figure: { kind: 'photos', photos: [photo(1), photo(2)] } },
    });
    expect(pair.find('[data-test="figure-pair"]').exists()).toBe(true);
    expect(pair.find('[data-test="figure-carousel"]').exists()).toBe(false);
    const row = mount(ArticleFigure, {
      props: { figure: { kind: 'photos', photos: [photo(1), photo(2), photo(3)] } },
    });
    expect(row.find('[data-test="figure-carousel"]').exists()).toBe(true);
    expect(row.findAll('[data-test="figure-card"]')).toHaveLength(3);
  });

  it('carousel has buttons, says which photo it is on, and disables the ends', async () => {
    const w = mount(ArticleFigure, {
      props: { figure: { kind: 'photos', photos: [photo(1), photo(2), photo(3)] } },
    });
    expect(w.find('[data-test="figure-carousel-position"]').text()).toBe('Foto 1 dari 3');
    expect(w.find('[data-test="figure-carousel-prev"]').attributes('disabled')).toBeDefined();
    // jsdom has no layout or scrollTo; the click still moves the position.
    (w.find('[data-test="figure-carousel-track"]').element as HTMLElement).scrollTo = () => {};
    await w.find('[data-test="figure-carousel-next"]').trigger('click');
    expect(w.find('[data-test="figure-carousel-position"]').text()).toBe('Foto 2 dari 3');
  });

  it('counts the last photo when the row is scrolled to its end, even if the card step does not divide it', async () => {
    // Three cards of 300px; the row can only scroll 300px (1000px wide, 700px visible), so the
    // last card never reaches its own 600px slot. Reaching the end must still read as photo 3.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    try {
      const w = mount(ArticleFigure, {
        props: { figure: { kind: 'photos', photos: [photo(1), photo(2), photo(3)] } },
        attachTo: document.body,
      });
      const track = w.find('[data-test="figure-carousel-track"]').element as HTMLElement;
      const first = track.firstElementChild as HTMLElement;
      first.getBoundingClientRect = () => ({ width: 300 }) as DOMRect;
      Object.defineProperty(track, 'scrollWidth', { value: 1000, configurable: true });
      Object.defineProperty(track, 'clientWidth', { value: 700, configurable: true });
      track.scrollLeft = 300;
      await w.find('[data-test="figure-carousel-track"]').trigger('scroll');
      expect(w.find('[data-test="figure-carousel-position"]').text()).toBe('Foto 3 dari 3');
      expect(w.find('[data-test="figure-carousel-next"]').attributes('disabled')).toBeDefined();
      w.unmount();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('leaves out pictures with an unsafe address and degrades the group', () => {
    const w = mount(ArticleFigure, {
      props: {
        figure: {
          kind: 'photos',
          photos: [
            photo(1),
            photo(2, { src: 'javascript:alert(1)' }),
            photo(3, { src: '//evil.test/x' }),
          ],
        },
      },
    });
    expect(w.find('[data-test="figure-carousel"]').exists()).toBe(false);
    expect(w.find('[data-test="figure-pair"]').exists()).toBe(false);
    expect(w.findAll('[data-test="figure-card"]')).toHaveLength(1);
  });

  it('drops a picture that fails to load, with its caption', async () => {
    const w = mount(ArticleFigure, { props: { figure: { kind: 'photo', photo: photo(1) } } });
    await w.find('img').trigger('error');
    expect(w.find('[data-test="figure-card"]').exists()).toBe(false);
  });

  it('lays out a pair again as a single card when one of the two pictures fails', async () => {
    const w = mount(ArticleFigure, {
      props: { figure: { kind: 'photos', photos: [photo(1), photo(2)] } },
    });
    expect(w.find('[data-test="figure-pair"]').exists()).toBe(true);
    await w.findAll('img')[1]!.trigger('error');
    expect(w.find('[data-test="figure-pair"]').exists()).toBe(false);
    const cards = w.findAll('[data-test="figure-card"]');
    expect(cards).toHaveLength(1);
    expect(cards[0]!.find('img').attributes('src')).toBe('/img/contoh-1.webp');
  });

  it('degrades a carousel to a pair and keeps its position valid when pictures fail', async () => {
    const w = mount(ArticleFigure, {
      props: { figure: { kind: 'photos', photos: [photo(1), photo(2), photo(3)] } },
    });
    await w.findAll('img')[2]!.trigger('error');
    expect(w.find('[data-test="figure-carousel"]').exists()).toBe(false);
    expect(w.find('[data-test="figure-pair"]').exists()).toBe(true);
    expect(w.findAll('[data-test="figure-card"]')).toHaveLength(2);
  });

  it('renders nothing, no frame and no orphan caption, when every picture fails', async () => {
    const w = mount(ArticleFigure, {
      props: { figure: { kind: 'photos', photos: [photo(1), photo(2), photo(3)] } },
    });
    expect(w.emitted('visible-change')).toEqual([[true]]);
    for (let i = 0; i < 3; i++) {
      const img = w.find('img');
      if (!img.exists()) break;
      await img.trigger('error');
    }
    expect(w.findAll('img')).toHaveLength(0);
    expect(w.text()).toBe('');
    expect(w.find('figure').exists()).toBe(false);
    expect(w.emitted('visible-change')).toEqual([[true], [false]]);
  });

  it('tries the pictures again when it is given a new figure', async () => {
    const w = mount(ArticleFigure, { props: { figure: { kind: 'photo', photo: photo(1) } } });
    await w.find('img').trigger('error');
    expect(w.find('img').exists()).toBe(false);
    await w.setProps({ figure: { kind: 'photo', photo: photo(2) } });
    expect(w.find('img').attributes('src')).toBe('/img/contoh-2.webp');
    expect(w.emitted('visible-change')).toEqual([[true], [false], [true]]);
  });

  it('falls back to the bars when a diagram picture fails, and to nothing without bars', async () => {
    const withBars = mount(ArticleFigure, {
      props: {
        figure: {
          kind: 'diagram',
          title: 'Diagram Contoh',
          src: '/img/plot.webp',
          alt: 'Grafik',
          bars: { items: [{ id: 'a', label: 'A', value: 5 }] },
          source: 'Sumber Contoh',
        },
      },
    });
    expect(withBars.find('img').exists()).toBe(true);
    await withBars.find('img').trigger('error');
    expect(withBars.find('img').exists()).toBe(false);
    expect(withBars.find('[data-test="figure-diagram"]').text()).toContain('Diagram Contoh');
    expect(withBars.text()).toContain('Sumber: Sumber Contoh');
    expect(withBars.emitted('visible-change')).toEqual([[true]]);

    const pictureOnly = mount(ArticleFigure, {
      props: {
        figure: { kind: 'diagram', title: 'Hanya Gambar', src: '/img/plot.webp', alt: 'Grafik' },
      },
    });
    await pictureOnly.find('img').trigger('error');
    expect(pictureOnly.find('[data-test="figure-diagram"]').exists()).toBe(false);
    expect(pictureOnly.text()).toBe('');
    expect(pictureOnly.emitted('visible-change')).toEqual([[true], [false]]);
  });

  it('renders nothing at all for a picture-only diagram after the picture fails, in any kind', async () => {
    const w = mount(ArticleFigure, {
      props: {
        figure: {
          kind: 'diagram',
          title: 'Judul Yatim',
          src: '/img/plot.webp',
          alt: 'Grafik',
          source: 'Sumber Yatim',
        },
      },
    });
    await w.find('img').trigger('error');
    expect(w.html()).not.toContain('Judul Yatim');
    expect(w.html()).not.toContain('Sumber Yatim');
    expect(w.find('figure').exists()).toBe(false);
  });

  it('keeps its failed pictures dropped when given a new but equal figure object', async () => {
    const make = () => ({
      kind: 'photos' as const,
      photos: [photo(1), photo(2)],
    });
    const w = mount(ArticleFigure, { props: { figure: make() } });
    await w.findAll('img')[1]!.trigger('error');
    expect(w.findAll('img')).toHaveLength(1);

    await w.setProps({ figure: make() });
    expect(w.findAll('img')).toHaveLength(1);
    expect(w.find('img').attributes('src')).toBe('/img/contoh-1.webp');
    expect(w.emitted('visible-change')).toEqual([[true]]);

    // A really different figure gets its pictures tried again.
    await w.setProps({ figure: { kind: 'photos', photos: [photo(1), photo(3)] } });
    expect(w.findAll('img')).toHaveLength(2);
  });

  it('shows a diagram with its title and source, from bars when there is no picture', () => {
    const w = mount(ArticleFigure, {
      props: {
        figure: {
          kind: 'diagram',
          title: 'Diagram Contoh',
          bars: { items: [{ id: 'a', label: 'A', value: 5 }] },
          source: 'Sumber Contoh',
        },
      },
    });
    expect(w.find('[data-test="figure-diagram"]').text()).toContain('Diagram Contoh');
    expect(w.text()).toContain('Sumber: Sumber Contoh');
  });

  it('shows nothing for a diagram without a picture or bars', () => {
    const w = mount(ArticleFigure, {
      props: { figure: { kind: 'diagram', title: 'Kosong' } },
    });
    expect(w.find('[data-test="figure-diagram"]').exists()).toBe(false);
  });
});

describe('article template', () => {
  const article: CeritaArticle = {
    title: 'Topik Contoh',
    chapters: [
      {
        id: 'c1',
        slug: 'bab-satu',
        number: '01',
        title: 'Bab Satu',
        sections: [
          {
            id: 's1',
            heading: 'Bagian Satu',
            paragraphs: ['Satu.', 'Dua.'],
            figure: { kind: 'photo', photo: photo(1) },
          },
          { id: 's2', heading: 'Bagian Dua', paragraphs: ['Tiga.'] },
        ],
      },
      { id: 'c2', slug: 'bab-dua', number: '02', title: 'Bab Dua', sections: [] },
    ],
  };

  it('renders chapters, one heading per section, paragraphs and the figure', () => {
    const w = mount(CeritaArticleTemplate, { props: { article }, global: { plugins: [router] } });
    expect(w.findAll('[data-test="article-chapter"]')).toHaveLength(2);
    expect(w.findAll('[data-test="article-section"] h3').map((h) => h.text())).toEqual([
      'Bagian Satu',
      'Bagian Dua',
    ]);
    expect(w.findAll('[data-test="section-prose"]')).toHaveLength(3);
    expect(w.findAll('[data-test="figure-card"]')).toHaveLength(1);
  });

  it('links each chapter to the next one, and the last chapter has no link', () => {
    const w = mount(CeritaArticleTemplate, { props: { article }, global: { plugins: [router] } });
    const links = w.findAll('[data-test="article-next-chapter"] a');
    expect(links).toHaveLength(1);
    expect(links[0]!.attributes('href')).toBe('#bab-dua');
    expect(links[0]!.text()).toContain('Bab berikutnya: Bab Dua');
  });

  it('puts the chapter bar at the bottom on phones and the list on the right on desktop', () => {
    const w = mount(CeritaArticleTemplate, { props: { article }, global: { plugins: [router] } });
    const sheet = w.find('[data-test="chapter-toc-sheet"]');
    expect(sheet.classes()).toContain('bottom-0');
    expect(sheet.classes()).not.toContain('top-[var(--public-header-height)]');
    expect(w.find('[data-test="chapter-toc-rail"]').classes()).toContain('xl:col-start-3');
  });

  describe('scroll spy', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('highlights the chapter that starts latest inside the band under the header', async () => {
      let callback: IntersectionObserverCallback = () => {};
      vi.stubGlobal(
        'IntersectionObserver',
        class {
          constructor(cb: IntersectionObserverCallback) {
            callback = cb;
          }
          observe() {}
          disconnect() {}
        },
      );
      const host = document.createElement('div');
      document.body.appendChild(host);
      const w = mount(CeritaArticleTemplate, {
        props: { article },
        global: { plugins: [router] },
        attachTo: host,
      });
      const entry = (slug: string, top: number) =>
        ({
          isIntersecting: true,
          boundingClientRect: { top },
          target: document.getElementById(slug),
        }) as unknown as IntersectionObserverEntry;
      // Chapter one's bottom edge and chapter two's start are both in the band: two wins.
      callback([entry('bab-satu', 80), entry('bab-dua', 100)], {} as IntersectionObserver);
      await w.vm.$nextTick();
      expect(w.find('[data-test="chapter-toc-current"]').text()).toContain('Bab Dua');
      w.unmount();
      host.remove();
    });
  });

  it('has no chapter list for a single chapter', () => {
    const single = { ...article, chapters: [article.chapters[0]!] };
    const w = mount(CeritaArticleTemplate, {
      props: { article: single },
      global: { plugins: [router] },
    });
    expect(w.find('[data-test="chapter-toc-rail"]').exists()).toBe(false);
    expect(w.find('[data-test="chapter-toc-sheet"]').exists()).toBe(false);
  });
});

describe('Cerita hero and column layout', () => {
  it('has a back link, and shows an editorial headline and byline only when given', () => {
    const plain = mount(CeritaHero, {
      props: { title: 'Pendidikan', chapterCount: 2 },
      global: { plugins: [router] },
    });
    expect(plain.find('[data-test="cerita-back"]').attributes('aria-label')).toBe(
      'Kembali ke Beranda',
    );
    expect(plain.find('h1').text()).toBe('Pendidikan');
    expect(plain.find('[data-test="cerita-byline"]').exists()).toBe(false);
    const rich = mount(CeritaHero, {
      props: {
        title: 'Pendidikan',
        headline: 'Judul Contoh',
        byline: { author: 'Penulis Contoh' },
      },
      global: { plugins: [router] },
    });
    expect(rich.find('h1').text()).toBe('Judul Contoh');
    expect(rich.text()).toContain('Cerita · Pendidikan');
    expect(rich.find('[data-test="cerita-byline"]').text()).toContain('Penulis Contoh');
  });

  it('puts the article in the middle track and the chapter list in the right track', () => {
    expect(READER_MAIN).toContain('xl:col-start-2');
    expect(READER_ASIDE).toContain('xl:col-start-3');
    const rail = mount(ChapterToc, {
      props: {
        variant: 'rail',
        chapters: [{ id: 'c1', slug: 'b', number: null, title: 'Bab' }],
        activeChapterId: 'c1',
      },
    });
    expect(rail.find('nav').classes()).toContain('xl:col-start-3');
  });
});
