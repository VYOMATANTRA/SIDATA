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

describe('ChapterSection.vue (reader states)', () => {
  const baseProps = {
    proseBySectionId: {},
    indicatorsBySectionId: {},
    tablesBySectionId: {},
    sectionErrorsBySectionId: {},
  };

  it('says so once when a chapter has no content, instead of rendering a blank body', () => {
    const wrapper = mount(ChapterSection, { props: { chapter, ...baseProps } });

    expect(wrapper.find('[data-test="chapter-empty"]').text()).toBe(
      'Konten bab ini belum tersedia.',
    );
    expect(wrapper.find('[data-test="section-empty"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="chapter-section-block"]').exists()).toBe(false);
  });

  it('treats a chapter with no sections as empty', () => {
    const wrapper = mount(ChapterSection, {
      props: { chapter: { ...chapter, sections: [] }, ...baseProps },
    });

    expect(wrapper.find('[data-test="chapter-empty"]').exists()).toBe(true);
  });

  it('marks only the empty section when its sibling has content', () => {
    const twoSections: ChapterDto = {
      ...chapter,
      sections: [
        { id: 'sec-1', slug: 'a', title: 'A', sortOrder: 0 },
        { id: 'sec-2', slug: 'b', title: 'B', sortOrder: 1 },
      ],
    };
    const wrapper = mount(ChapterSection, {
      props: {
        chapter: twoSections,
        ...baseProps,
        proseBySectionId: {
          'sec-1': [
            {
              id: 'block-1',
              sectionId: 'sec-1',
              type: 'prose',
              slug: 'intro',
              title: null,
              body: 'Isi bagian A.',
              metadata: null,
              sortOrder: 0,
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      },
    });

    expect(wrapper.find('[data-test="chapter-empty"]').exists()).toBe(false);
    const blocks = wrapper.findAll('[data-test="chapter-section-block"]');
    expect(blocks[0]?.find('[data-test="section-empty"]').exists()).toBe(false);
    expect(blocks[1]?.find('[data-test="section-empty"]').text()).toBe(
      'Konten bagian ini belum tersedia.',
    );
  });

  it('does not call a section empty when its data failed to load', () => {
    const wrapper = mount(ChapterSection, {
      props: { chapter, ...baseProps, sectionErrorsBySectionId: { 'sec-1': 'gagal' } },
    });

    expect(wrapper.find('[data-test="chapter-empty"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="section-empty"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="section-data-error"]').exists()).toBe(true);
  });

  it('does not claim a section is empty while the prose could not be loaded', () => {
    const wrapper = mount(ChapterSection, {
      props: { chapter, ...baseProps, proseUnavailable: true },
    });

    expect(wrapper.find('[data-test="chapter-empty"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="section-empty"]').exists()).toBe(false);
  });

  it('keeps the section content visible next to its error and offers a retry for that section', async () => {
    const wrapper = mount(ChapterSection, {
      props: {
        chapter,
        ...baseProps,
        proseBySectionId: {
          'sec-1': [
            {
              id: 'block-1',
              sectionId: 'sec-1',
              type: 'prose',
              slug: 'intro',
              title: null,
              body: 'Teks yang berhasil dimuat.',
              metadata: null,
              sortOrder: 0,
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
        sectionErrorsBySectionId: { 'sec-1': 'gagal' },
      },
    });

    expect(wrapper.find('[data-test="section-prose"]').text()).toBe('Teks yang berhasil dimuat.');
    expect(wrapper.find('[data-test="section-data-error"]').text()).not.toContain('gagal');

    await wrapper.find('[data-test="section-retry"]').trigger('click');
    expect(wrapper.emitted('retry-section')).toEqual([['sec-1']]);
  });

  it('clears the chapter anchor below the header and the mobile selector, and only the header from lg', () => {
    const wrapper = mount(ChapterSection, { props: { chapter, ...baseProps } });
    const classes = wrapper.find('[data-test="chapter-section"]').classes().join(' ');

    expect(classes).toContain('scroll-mt-[calc(var(--public-header-height)+4.5rem)]');
    expect(classes).toContain('lg:scroll-mt-[calc(var(--public-header-height)+1.5rem)]');
  });
});
