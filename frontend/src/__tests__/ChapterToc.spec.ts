import { describe, it, expect, vi } from 'vitest';
import { nextTick } from 'vue';
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

describe('ChapterToc.vue (layout contract)', () => {
  it('offsets the rail and the mobile selector from the public header height, not a fixed number', () => {
    const rail = mount(ChapterToc, {
      props: { chapters, activeChapterId: 'chap-1', variant: 'rail' },
    });
    const sheet = mount(ChapterToc, {
      props: { chapters, activeChapterId: 'chap-1', variant: 'sheet' },
    });

    expect(rail.find('[data-test="chapter-toc-rail"]').classes().join(' ')).toContain(
      '--public-header-height',
    );
    expect(sheet.find('[data-test="chapter-toc-sheet"]').classes().join(' ')).toContain(
      '--public-header-height',
    );
  });

  it('keeps the mobile selector in the page flow (sticky) so it can never sit over the footer', () => {
    const wrapper = mount(ChapterToc, {
      props: { chapters, activeChapterId: 'chap-1', variant: 'sheet' },
    });

    const classes = wrapper.find('[data-test="chapter-toc-sheet"]').classes();
    expect(classes).toContain('sticky');
    expect(classes).not.toContain('fixed');
    expect(classes).not.toContain('bottom-0');
    expect(classes).toContain('lg:hidden');
  });

  it('shows the desktop rail only from lg and a labelled landmark for each variant', () => {
    const rail = mount(ChapterToc, {
      props: { chapters, activeChapterId: 'chap-1', variant: 'rail' },
    });
    expect(rail.find('nav').classes()).toContain('lg:block');
    expect(rail.find('nav').attributes('aria-label')).toBe('Daftar Bab');
    expect(rail.find('[data-test="chapter-toc-rail"] ol').exists()).toBe(true);

    const sheet = mount(ChapterToc, {
      props: { chapters, activeChapterId: 'chap-1', variant: 'sheet' },
    });
    expect(sheet.find('nav[aria-label="Pilih bab"]').exists()).toBe(true);
  });
});

describe('ChapterToc.vue (sheet dismissal)', () => {
  async function openSheet() {
    const wrapper = mount(ChapterToc, {
      props: { chapters, activeChapterId: 'chap-1', variant: 'sheet' },
      attachTo: document.body,
    });
    await wrapper.find('[data-test="chapter-toc-trigger"]').trigger('click');
    return wrapper;
  }

  it('closes on Escape and returns focus to the trigger', async () => {
    const wrapper = await openSheet();
    const trigger = wrapper.find('[data-test="chapter-toc-trigger"]');
    (wrapper.findAll('[data-test="chapter-toc-link"]')[0]!.element as HTMLElement).focus();

    await wrapper.find('[data-test="chapter-toc-sheet"]').trigger('keydown', { key: 'Escape' });
    await nextTick();

    expect(isHidden(wrapper, '[data-test="chapter-toc-sheet-panel"]')).toBe(true);
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger.element);
    wrapper.unmount();
  });

  it('closes when a press lands outside the selector (for example on the navigation menu)', async () => {
    const wrapper = await openSheet();
    const outside = document.createElement('button');
    document.body.appendChild(outside);

    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await nextTick();

    expect(isHidden(wrapper, '[data-test="chapter-toc-sheet-panel"]')).toBe(true);
    outside.remove();
    wrapper.unmount();
  });

  it('stays open for a press inside the selector', async () => {
    const wrapper = await openSheet();

    wrapper
      .find('[data-test="chapter-toc-sheet-panel"]')
      .element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await nextTick();

    expect(isHidden(wrapper, '[data-test="chapter-toc-sheet-panel"]')).toBe(false);
    wrapper.unmount();
  });

  it('closes when keyboard focus leaves the selector, but not while it moves inside it', async () => {
    const wrapper = await openSheet();
    const root = wrapper.find('[data-test="chapter-toc-sheet"]');
    const links = wrapper.findAll('[data-test="chapter-toc-link"]');

    await root.trigger('focusout', { relatedTarget: links[1]!.element });
    expect(isHidden(wrapper, '[data-test="chapter-toc-sheet-panel"]')).toBe(false);

    const outside = document.createElement('button');
    document.body.appendChild(outside);
    await root.trigger('focusout', { relatedTarget: outside });
    expect(isHidden(wrapper, '[data-test="chapter-toc-sheet-panel"]')).toBe(true);
    outside.remove();
    wrapper.unmount();
  });

  it('removes its document listener when it is unmounted while open', async () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const wrapper = await openSheet();
    wrapper.unmount();

    expect(removeSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    removeSpy.mockRestore();
  });
});
