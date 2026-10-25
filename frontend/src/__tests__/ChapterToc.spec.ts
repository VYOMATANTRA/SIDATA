import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ChapterToc from '../components/cerita/ChapterToc.vue';

// NOTE: deliberately checking the inline `style` attribute directly rather than
// DOMWrapper#isVisible() here. isVisible() goes through getComputedStyle, which in this jsdom
// setup reports a stale value immediately after a v-show toggle (confirmed by inspecting the
// element's actual style attribute in isolation: it's correctly "display: none", but
// isVisible() still returns true for it). Reading the style attribute avoids that flake.
function isHidden(wrapper: ReturnType<typeof mount>, selector: string): boolean {
  return (wrapper.find(selector).attributes('style') ?? '').includes('display: none');
}

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
  it('shows the current chapter on the sticky trigger and the panel is hidden by default', () => {
    const wrapper = mount(ChapterToc, {
      props: { chapters, activeChapterId: 'chap-1', variant: 'sheet' },
    });

    expect(wrapper.find('[data-test="chapter-toc-trigger"]').text()).toContain('Jumlah Penduduk');
    // v-show (not v-if): the panel stays in the DOM while closed so aria-controls keeps
    // resolving to a real element; it's just hidden, not removed.
    expect(wrapper.find('[data-test="chapter-toc-sheet-panel"]').exists()).toBe(true);
    expect(isHidden(wrapper, '[data-test="chapter-toc-sheet-panel"]')).toBe(true);
    expect(wrapper.find('[data-test="chapter-toc-trigger"]').attributes('aria-expanded')).toBe('false');
  });

  it("the trigger's aria-controls points at the panel's actual id", () => {
    const wrapper = mount(ChapterToc, {
      props: { chapters, activeChapterId: 'chap-1', variant: 'sheet' },
    });

    const controlsId = wrapper.find('[data-test="chapter-toc-trigger"]').attributes('aria-controls');
    expect(controlsId).toBeTruthy();
    expect(wrapper.find(`#${controlsId}`).attributes('data-test')).toBe('chapter-toc-sheet-panel');
  });

  it('opens the chapter list on trigger click, closes it again on selection', async () => {
    const wrapper = mount(ChapterToc, {
      props: { chapters, activeChapterId: 'chap-1', variant: 'sheet' },
    });

    await wrapper.find('[data-test="chapter-toc-trigger"]').trigger('click');
    expect(isHidden(wrapper, '[data-test="chapter-toc-sheet-panel"]')).toBe(false);
    expect(wrapper.find('[data-test="chapter-toc-trigger"]').attributes('aria-expanded')).toBe('true');

    await wrapper.findAll('[data-test="chapter-toc-link"]')[1]?.trigger('click');

    expect(wrapper.emitted('navigate')).toEqual([['chap-2']]);
    expect(isHidden(wrapper, '[data-test="chapter-toc-sheet-panel"]')).toBe(true);
  });
});
