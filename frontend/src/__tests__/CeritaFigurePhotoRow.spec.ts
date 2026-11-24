import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import CeritaFigurePhotoRow from '../components/admin/cerita/CeritaFigurePhotoRow.vue';
import { figureIds } from '../utils/ceritaFigureDraft';

const ids = figureIds('test-gambar');

function mountGalleryTile(props: Record<string, unknown> = {}) {
  return mount(CeritaFigurePhotoRow, {
    attachTo: document.body,
    props: {
      variant: 'gallery',
      index: 1,
      label: 'Foto 2',
      ids,
      errors: {},
      showActions: true,
      showGrip: true,
      gripId: 'grip-foto-2',
      gripLabel: 'Pindahkan foto 2',
      mediaId: null,
      alt: '',
      caption: '',
      credit: '',
      busy: false,
      ...props,
    } as never,
  });
}

describe('CeritaFigurePhotoRow (gallery tile)', () => {
  it('renders the order grip as a labelled button, with no Naik or Turun', () => {
    const wrapper = mountGalleryTile();
    const grip = wrapper.get('[data-test="grip"]');

    expect(grip.element.tagName).toBe('BUTTON');
    expect(grip.attributes('id')).toBe('grip-foto-2');
    expect(grip.attributes('aria-label')).toBe('Pindahkan foto 2');
    expect(grip.attributes('aria-pressed')).toBe('false');
    expect(wrapper.text()).not.toMatch(/Naik|Turun/);
    wrapper.unmount();
  });

  it('shows the grip as picked up with aria-pressed, and forwards its keys', async () => {
    const wrapper = mountGalleryTile({ gripCarried: true });
    const grip = wrapper.get('[data-test="grip"]');
    expect(grip.attributes('aria-pressed')).toBe('true');

    await grip.trigger('keydown', { key: 'ArrowUp' });
    const keys = wrapper.emitted('grip-keydown')!;
    expect((keys[0]![0] as KeyboardEvent).key).toBe('ArrowUp');
    wrapper.unmount();
  });

  it('disables the grip while a save runs, and keeps only Hapus as an action', () => {
    const wrapper = mountGalleryTile({ busy: true });
    expect(wrapper.get('[data-test="grip"]').attributes('aria-disabled')).toBe('true');
    const actions = wrapper
      .findAll('button')
      .filter((item) => item.attributes('data-test') !== 'grip')
      .map((item) => item.text().trim());
    expect(actions).toEqual(['Hapus foto 2']);
    wrapper.unmount();
  });
});
