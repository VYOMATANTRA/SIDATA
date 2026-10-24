import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ChapterToc from '../components/cerita/ChapterToc.vue';

const chapters = [
  { id: 'chap-1', slug: 'jumlah-penduduk', number: '01', title: 'Jumlah Penduduk' },
  { id: 'chap-2', slug: 'jumlah-keluarga', number: '02', title: 'Jumlah Keluarga' },
];

describe('ChapterToc.vue (rail variant)', () => {
  it('marks the active chapter with aria-current', () => {
    const wrapper = mount(ChapterToc, {
      props: { chapters, activeChapterId: 'chap-2', variant: 'rail' },
    });

    const links = wrapper.findAll('[data-test="chapter-toc-link"]');
    expect(links[0]?.attributes('aria-current')).toBeUndefined();
    expect(links[1]?.attributes('aria-current')).toBe('true');
  });

  it('emits navigate with the chapter id when a link is clicked', async () => {
    const wrapper = mount(ChapterToc, {
      props: { chapters, activeChapterId: 'chap-1', variant: 'rail' },
    });

    await wrapper.findAll('[data-test="chapter-toc-link"]')[1]?.trigger('click');

    expect(wrapper.emitted('navigate')).toEqual([['chap-2']]);
  });
});

describe('ChapterToc.vue (sheet variant)', () => {
  it('shows the current chapter on the sticky trigger and the panel is closed by default', () => {
    const wrapper = mount(ChapterToc, {
      props: { chapters, activeChapterId: 'chap-1', variant: 'sheet' },
    });

    expect(wrapper.find('[data-test="chapter-toc-trigger"]').text()).toContain('Jumlah Penduduk');
    expect(wrapper.find('[data-test="chapter-toc-sheet-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="chapter-toc-trigger"]').attributes('aria-expanded')).toBe('false');
  });

  it('opens the chapter list on trigger click, closes it again on selection', async () => {
    const wrapper = mount(ChapterToc, {
      props: { chapters, activeChapterId: 'chap-1', variant: 'sheet' },
    });

    await wrapper.find('[data-test="chapter-toc-trigger"]').trigger('click');
    expect(wrapper.find('[data-test="chapter-toc-sheet-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="chapter-toc-trigger"]').attributes('aria-expanded')).toBe('true');

    await wrapper.findAll('[data-test="chapter-toc-link"]')[1]?.trigger('click');

    expect(wrapper.emitted('navigate')).toEqual([['chap-2']]);
    expect(wrapper.find('[data-test="chapter-toc-sheet-panel"]').exists()).toBe(false);
  });
});
