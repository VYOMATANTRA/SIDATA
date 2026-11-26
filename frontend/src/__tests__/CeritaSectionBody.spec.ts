import { describe, it, expect } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import CeritaSectionBody from '../components/cerita/CeritaSectionBody.vue';
import type { ArticleFigure } from '../types/ceritaArticle';

// Synthetic content only.
const photoFigure: ArticleFigure = {
  kind: 'photo',
  photo: { id: 'p1', src: '/img/contoh-1.webp', alt: 'Foto contoh' },
};

const emptyFigure: ArticleFigure = { kind: 'photos', photos: [] };

const SIDE_BY_SIDE = ['lg:grid', 'lg:grid-cols-2', 'lg:items-start', 'lg:gap-8'];

describe('CeritaSectionBody', () => {
  it('renders nothing when there is neither prose nor a figure', () => {
    const wrapper = mount(CeritaSectionBody, { props: { prose: [], figure: null } });

    expect(wrapper.find('[data-test="section-body"]').exists()).toBe(false);
  });

  it('stacks the prose alone without a grid when there is no figure', () => {
    const wrapper = mount(CeritaSectionBody, { props: { prose: ['Paragraf satu.'], figure: null } });
    const body = wrapper.find('[data-test="section-body"]');

    expect(body.classes()).not.toContain('lg:grid');
    expect(body.attributes('data-side-by-side')).toBeUndefined();
    expect(body.find('[data-test="section-text"]').text()).toBe('Paragraf satu.');
  });

  it('puts the prose before the figure in DOM order, side by side from lg', async () => {
    const wrapper = mount(CeritaSectionBody, {
      props: { prose: ['Paragraf satu.', 'Paragraf dua.'], figure: photoFigure },
    });
    // The figure reports its visibility from its own setup; the grid class follows on the next flush.
    await flushPromises();
    const body = wrapper.find('[data-test="section-body"]');

    for (const className of SIDE_BY_SIDE) expect(body.classes()).toContain(className);
    expect(body.attributes('data-side-by-side')).toBe('true');

    const children = Array.from(body.element.children);
    expect(children).toHaveLength(2);
    expect(children[0]!.getAttribute('data-test')).toBe('section-text');
    expect(children[1]!.getAttribute('data-test')).toBe('figure-card');
    // Both paragraphs sit in the one text column, so the figure is the second grid item.
    expect(children[0]!.querySelectorAll('p').length).toBeGreaterThanOrEqual(2);
  });

  it('stays a plain stack when the figure has nothing to show, and reports it hidden', async () => {
    const wrapper = mount(CeritaSectionBody, {
      props: { prose: ['Paragraf satu.'], figure: emptyFigure },
    });
    const body = wrapper.find('[data-test="section-body"]');

    expect(body.classes()).not.toContain('lg:grid');
    expect(body.find('[data-test="figure-card"]').exists()).toBe(false);
    expect(wrapper.emitted('visible-change')).toEqual([[false]]);
  });

  it('re-emits the figure visibility as visible-change', () => {
    const wrapper = mount(CeritaSectionBody, {
      props: { prose: ['Paragraf satu.'], figure: photoFigure },
    });

    expect(wrapper.emitted('visible-change')).toEqual([[true]]);
  });

  it('does not use a grid for a figure beside no text: it is a plain stack', () => {
    const wrapper = mount(CeritaSectionBody, { props: { prose: [], figure: photoFigure } });
    const body = wrapper.find('[data-test="section-body"]');

    expect(body.exists()).toBe(true);
    expect(body.classes()).not.toContain('lg:grid');
    expect(body.find('[data-test="figure-card"]').exists()).toBe(true);
  });

  it('drops the side-by-side grid when the figure is removed', async () => {
    const wrapper = mount(CeritaSectionBody, {
      props: { prose: ['Paragraf satu.'], figure: photoFigure },
    });
    await flushPromises();
    expect(wrapper.find('[data-test="section-body"]').classes()).toContain('lg:grid');

    await wrapper.setProps({ figure: null });

    expect(wrapper.find('[data-test="section-body"]').classes()).not.toContain('lg:grid');
  });
});
