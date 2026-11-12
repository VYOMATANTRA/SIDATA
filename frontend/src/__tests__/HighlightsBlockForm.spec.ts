import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import HighlightsBlockForm from '../components/data/blocks/HighlightsBlockForm.vue';
import type { ContentBlock } from '../stores/contentBlocks.store';

function block(items: Array<{ title: string; desc: string }> | undefined): ContentBlock {
  return {
    id: 'b-h',
    sectionId: null,
    type: 'highlight',
    slug: 'landing-highlights',
    title: 'Potensi Uji',
    body: 'Narasi uji.',
    metadata: items === undefined ? null : { items },
    sortOrder: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

const THREE = [
  { title: 'Satu', desc: 'Deskripsi satu' },
  { title: 'Dua', desc: 'Deskripsi dua' },
  { title: 'Tiga', desc: 'Deskripsi tiga' },
];

function mountForm(items?: Array<{ title: string; desc: string }>, attachTo?: HTMLElement) {
  return mount(HighlightsBlockForm, { props: { block: block(items) }, attachTo });
}

function titles(wrapper: ReturnType<typeof mountForm>): string[] {
  return wrapper
    .findAll('input[id^="block-item-title-"]')
    .map((input) => (input.element as HTMLInputElement).value);
}

function payloadOf(wrapper: ReturnType<typeof mountForm>) {
  return wrapper.emitted('submit')?.[0]?.[0] as {
    title: string | null;
    body: string;
    metadata: { items: Array<{ title: string; desc: string }> };
  };
}

describe('HighlightsBlockForm', () => {
  it('loads stored items as rows and saves them in the stored { title, desc } shape', async () => {
    const wrapper = mountForm(THREE);
    expect(titles(wrapper)).toEqual(['Satu', 'Dua', 'Tiga']);

    await wrapper.find('form').trigger('submit.prevent');
    expect(payloadOf(wrapper).metadata).toEqual({ items: THREE });
  });

  it('adds a row, fills it in and saves it last', async () => {
    const wrapper = mountForm(THREE);
    const add = wrapper.findAll('button').find((b) => b.text() === 'Tambah poin');
    await add?.trigger('click');

    await wrapper.find('input#block-item-title-3').setValue('  Empat ');
    await wrapper.find('textarea#block-item-desc-3').setValue('Deskripsi empat');
    await wrapper.find('form').trigger('submit.prevent');

    expect(payloadOf(wrapper).metadata.items).toEqual([
      ...THREE,
      { title: 'Empat', desc: 'Deskripsi empat' },
    ]);
  });

  it('removes a row', async () => {
    const wrapper = mountForm(THREE);
    await wrapper.find('#block-item-remove-1').trigger('click');
    await wrapper.find('form').trigger('submit.prevent');
    expect(payloadOf(wrapper).metadata.items.map((i) => i.title)).toEqual(['Satu', 'Tiga']);
  });

  it('moves rows up and down with buttons and keeps each draft with its row', async () => {
    const wrapper = mountForm(THREE);
    await wrapper.find('input#block-item-title-2').setValue('Tiga diedit');
    await wrapper.find('#block-item-up-2').trigger('click');
    expect(titles(wrapper)).toEqual(['Satu', 'Tiga diedit', 'Dua']);

    await wrapper.find('#block-item-down-0').trigger('click');
    expect(titles(wrapper)).toEqual(['Tiga diedit', 'Satu', 'Dua']);

    await wrapper.find('form').trigger('submit.prevent');
    expect(payloadOf(wrapper).metadata.items).toEqual([
      { title: 'Tiga diedit', desc: 'Deskripsi tiga' },
      { title: 'Satu', desc: 'Deskripsi satu' },
      { title: 'Dua', desc: 'Deskripsi dua' },
    ]);
  });

  it('disables the edge move buttons', () => {
    const wrapper = mountForm(THREE);
    expect(wrapper.find('#block-item-up-0').attributes('disabled')).toBeDefined();
    expect(wrapper.find('#block-item-down-2').attributes('disabled')).toBeDefined();
    expect(wrapper.find('#block-item-up-1').attributes('disabled')).toBeUndefined();
  });

  it('gives the row buttons accessible names that start with their visible text', () => {
    const wrapper = mountForm(THREE);
    expect(wrapper.find('#block-item-up-1').text()).toBe('Naik poin 2');
    expect(wrapper.find('#block-item-down-1').text()).toBe('Turun poin 2');
    expect(wrapper.find('#block-item-remove-1').text()).toBe('Hapus poin 2');
  });

  it('stops at 10 items and says so in plain words', async () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ title: `T${i}`, desc: `D${i}` }));
    const wrapper = mountForm(ten);
    const add = wrapper.findAll('button').find((b) => b.text() === 'Tambah poin');
    expect(add?.attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-test="highlights-full"]').text()).toContain('10 poin');
    expect(wrapper.text()).toContain('Maksimal 10 poin');
    expect(wrapper.text()).toContain('maksimal 100 karakter');
    expect(wrapper.text()).toContain('maksimal 500 karakter');
    expect(wrapper.findAll('li')).toHaveLength(10);
  });

  it('caps field length at the backend limits', () => {
    const wrapper = mountForm(THREE);
    expect(wrapper.find('input#block-item-title-0').attributes('maxlength')).toBe('100');
    expect(wrapper.find('textarea#block-item-desc-0').attributes('maxlength')).toBe('500');
  });

  it('shows row-level errors in text, ties them to the field and blocks the save', async () => {
    const wrapper = mountForm(THREE);
    await wrapper.find('input#block-item-title-1').setValue('   ');
    await wrapper.find('textarea#block-item-desc-2').setValue('');
    await wrapper.find('form').trigger('submit.prevent');

    expect(wrapper.emitted('submit')).toBeFalsy();
    const titleField = wrapper.find('input#block-item-title-1');
    expect(titleField.attributes('aria-invalid')).toBe('true');
    expect(titleField.attributes('aria-describedby')).toContain('block-item-title-1-error');
    expect(wrapper.find('#block-item-title-1-error').text()).toBe('Poin 2: judul wajib diisi.');
    expect(wrapper.find('#block-item-desc-2-error').text()).toBe('Poin 3: deskripsi wajib diisi.');
    // The summary links both, in row order.
    const summary = wrapper.find('[role="alert"]').text();
    expect(summary).toContain('Poin 2: judul wajib diisi.');
    expect(summary).toContain('Poin 3: deskripsi wajib diisi.');
    // Untouched rows keep their text.
    expect(titles(wrapper)).toEqual(['Satu', '   ', 'Tiga']);
  });

  it('keeps every row when the save fails (server error shown, nothing cleared)', async () => {
    const wrapper = mountForm(THREE);
    await wrapper.find('input#block-item-title-0').setValue('Diubah');
    await wrapper.find('form').trigger('submit.prevent');
    expect(wrapper.emitted('submit')).toBeTruthy();

    await wrapper.setProps({ serverError: 'Gagal menyimpan perubahan blok konten.' });
    expect(wrapper.text()).toContain('Gagal menyimpan perubahan blok konten.');
    expect(titles(wrapper)).toEqual(['Diubah', 'Dua', 'Tiga']);
  });

  it('saves an empty list as an empty array and keeps it empty on reload', async () => {
    const wrapper = mountForm([]);
    expect(wrapper.find('[data-test="highlights-empty"]').exists()).toBe(true);
    expect(wrapper.findAll('li')).toHaveLength(0);

    await wrapper.find('form').trigger('submit.prevent');
    expect(payloadOf(wrapper).metadata).toEqual({ items: [] });

    // "Reload": a block whose stored list is [] opens with no rows.
    const reloaded = mountForm([]);
    expect(titles(reloaded)).toEqual([]);
  });

  it('opens with no rows when the block has no stored list', () => {
    expect(titles(mountForm(undefined))).toEqual([]);
  });

  it('announces row changes in a live region', async () => {
    const wrapper = mountForm(THREE);
    await wrapper.find('#block-item-remove-0').trigger('click');
    expect(wrapper.find('[role="status"]').text()).toContain('Baris poin 1 dihapus');
    await wrapper.find('#block-item-down-0').trigger('click');
    expect(wrapper.find('[role="status"]').text()).toContain('dipindah ke urutan 2 dari 2');
  });

  it('hands keyboard focus back after a move, add and remove', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const wrapper = mountForm(THREE, host);

    await wrapper.find('#block-item-down-0').trigger('click');
    await wrapper.vm.$nextTick();
    expect(document.activeElement?.id).toBe('block-item-down-1');

    await wrapper.find('#block-item-up-2').trigger('click');
    await wrapper.vm.$nextTick();
    expect(document.activeElement?.id).toBe('block-item-up-1');

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Tambah poin')
      ?.trigger('click');
    await wrapper.vm.$nextTick();
    expect(document.activeElement?.id).toBe('block-item-title-3');

    await wrapper.find('#block-item-remove-3').trigger('click');
    await wrapper.vm.$nextTick();
    expect(document.activeElement?.id).toBe('block-item-add');

    wrapper.unmount();
    host.remove();
  });
});
