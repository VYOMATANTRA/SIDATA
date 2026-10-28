import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ChapterSection from '../components/cerita/ChapterSection.vue';
import type { ChapterDto } from '../stores/pages.store';

const chapter: ChapterDto = {
  id: 'chap-1',
  slug: 'jumlah-penduduk',
  number: '01',
  title: 'Jumlah Penduduk',
  sortOrder: 0,
  sections: [{ id: 'sec-1', slug: 'total', title: 'Total', sortOrder: 0 }],
};

describe('ChapterSection.vue', () => {
  it('renders nothing extra for a section with no error', () => {
    const wrapper = mount(ChapterSection, {
      props: {
        chapter,
        proseBySectionId: {},
        indicatorsBySectionId: {},
        tablesBySectionId: {},
        sectionErrorsBySectionId: {},
      },
    });

    expect(wrapper.find('[data-test="section-data-error"]').exists()).toBe(false);
  });

  it('shows an inline error for the specific section that failed to load, not a blank section', () => {
    const wrapper = mount(ChapterSection, {
      props: {
        chapter,
        proseBySectionId: {},
        indicatorsBySectionId: {},
        tablesBySectionId: {},
        sectionErrorsBySectionId: { 'sec-1': 'Gagal memuat indikator (status 500)' },
      },
    });

    const error = wrapper.find('[data-test="section-data-error"]');
    expect(error.exists()).toBe(true);
    expect(error.attributes('role')).toBe('alert');
  });

  it('does not show an error for a section that is not in sectionErrorsBySectionId', () => {
    const twoSectionChapter: ChapterDto = {
      ...chapter,
      sections: [
        { id: 'sec-1', slug: 'a', title: 'A', sortOrder: 0 },
        { id: 'sec-2', slug: 'b', title: 'B', sortOrder: 1 },
      ],
    };

    const wrapper = mount(ChapterSection, {
      props: {
        chapter: twoSectionChapter,
        proseBySectionId: {},
        indicatorsBySectionId: {},
        tablesBySectionId: {},
        sectionErrorsBySectionId: { 'sec-1': 'boom' },
      },
    });

    const blocks = wrapper.findAll('[data-test="chapter-section-block"]');
    expect(blocks[0]?.find('[data-test="section-data-error"]').exists()).toBe(true);
    expect(blocks[1]?.find('[data-test="section-data-error"]').exists()).toBe(false);
  });

  it('renders every prose block for a section, not just the last one', () => {
    const wrapper = mount(ChapterSection, {
      props: {
        chapter,
        proseBySectionId: {
          'sec-1': [
            {
              id: 'block-1',
              sectionId: 'sec-1',
              type: 'prose',
              slug: 'intro',
              title: null,
              body: 'Paragraf pertama.',
              metadata: null,
              sortOrder: 0,
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
            {
              id: 'block-2',
              sectionId: 'sec-1',
              type: 'prose',
              slug: 'lanjutan',
              title: null,
              body: 'Paragraf kedua.',
              metadata: null,
              sortOrder: 1,
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
        indicatorsBySectionId: {},
        tablesBySectionId: {},
        sectionErrorsBySectionId: {},
      },
    });

    const paragraphs = wrapper.findAll('[data-test="section-prose"]');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.text()).toBe('Paragraf pertama.');
    expect(paragraphs[1]?.text()).toBe('Paragraf kedua.');
  });
});
