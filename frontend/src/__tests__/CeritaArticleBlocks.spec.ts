import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import ArticleBlocks from '../components/cerita/ArticleBlocks.vue';
import ChapterSection from '../components/cerita/ChapterSection.vue';
import CeritaHero from '../components/cerita/CeritaHero.vue';
import ChapterToc from '../components/cerita/ChapterToc.vue';
import { READER_ASIDE, READER_MAIN } from '../components/cerita/readerLayout';
import type { ArticleBlock } from '../types/ceritaArticle';

// Synthetic content only.
const blocks: ArticleBlock[] = [
  {
    kind: 'figure',
    id: 'f1',
    src: '/img/contoh.webp',
    alt: 'Contoh foto',
    caption: 'Keterangan foto',
    credit: 'Tim Contoh',
  },
  { kind: 'quote', id: 'q1', text: 'Kutipan sintetis.', attribution: 'Tokoh Contoh' },
  {
    kind: 'stats',
    id: 's1',
    title: 'Angka Contoh',
    items: [{ id: 'a', value: '7.500', unit: 'unit', label: 'Label A' }],
  },
];

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { template: '<div />' } }],
});

describe('Cerita article blocks', () => {
  it('renders figure, quote and stats in the order given', () => {
    const w = mount(ArticleBlocks, { props: { blocks } });
    const kinds = w.findAll('[data-test^="article-"]').map((e) => e.attributes('data-test'));
    expect(
      kinds.filter((k) => ['article-figure', 'article-quote', 'article-stats'].includes(k!)),
    ).toEqual(['article-figure', 'article-quote', 'article-stats']);
    expect(w.find('[data-test="article-figure-caption"]').text()).toContain('Keterangan foto');
    expect(w.find('[data-test="article-stat-item"]').text()).toContain('7.500');
  });

  it('renders no figure for an unsafe address or a photo that fails to load', async () => {
    const unsafe = mount(ArticleBlocks, {
      props: {
        blocks: [{ kind: 'figure', id: 'x', src: 'javascript:alert(1)', alt: 'x', caption: 'c' }],
      },
    });
    expect(unsafe.find('[data-test="article-figure"]').exists()).toBe(false);
    const w = mount(ArticleBlocks, { props: { blocks: [blocks[0]!] } });
    await w.find('img').trigger('error');
    expect(w.find('[data-test="article-figure"]').exists()).toBe(false);
  });

  it('a section holding only extra blocks is not reported empty', () => {
    const w = mount(ChapterSection, {
      props: {
        chapter: {
          id: 'c1',
          slug: 'bab-1',
          number: '01',
          title: 'Bab',
          sortOrder: 1,
          sections: [{ id: 's1', slug: 's', title: null, sortOrder: 1 }],
        },
        proseBySectionId: {},
        indicatorsBySectionId: {},
        tablesBySectionId: {},
        sectionErrorsBySectionId: {},
        extraBlocksBySectionId: { s1: blocks },
      } as never,
    });
    expect(w.find('[data-test="chapter-empty"]').exists()).toBe(false);
    expect(w.find('[data-test="article-quote"]').exists()).toBe(true);
  });
});

describe('Cerita article template', () => {
  it('renders prose paragraphs and a bar chart from the article model', async () => {
    const { default: Template } = await import('../components/cerita/CeritaArticleTemplate.vue');
    const article = {
      title: 'Topik Contoh',
      chapters: [
        {
          id: 'c1',
          slug: 'bab-1',
          number: '01',
          title: 'Bab Satu',
          blocks: [
            { kind: 'prose' as const, id: 'p', paragraphs: ['Satu.', 'Dua.'] },
            {
              kind: 'bars' as const,
              id: 'b',
              title: 'Grafik Contoh',
              items: [{ id: 'x', label: 'A', value: 5 }],
            },
          ],
        },
        { id: 'c2', slug: 'bab-2', number: '02', title: 'Bab Dua', blocks: [] },
      ],
    };
    const w = mount(Template, { props: { article }, global: { plugins: [router] } });
    expect(w.findAll('[data-test="section-prose"]')).toHaveLength(2);
    expect(w.find('[data-test="article-bars"]').exists()).toBe(true);
    expect(w.find('[data-test="chapter-toc-rail"]').exists()).toBe(true);
    expect(w.findAll('[data-test="article-chapter"]')).toHaveLength(2);
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
