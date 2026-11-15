import { beforeEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import CreateDataForm from '../components/data/CreateDataForm.vue';
import SectionPicker from '../components/data/SectionPicker.vue';
import { usePagesStore, type HierarchyPage } from '../stores/pages.store';

const UPDATED = '2026-01-01T00:00:00.000Z';

function hierarchy(): HierarchyPage[] {
  return [
    {
      id: 'page-1',
      slug: 'kependudukan',
      title: 'Kependudukan',
      headline: null,
      bylineAuthor: null,
      bylineAffiliation: null,
      sortOrder: 0,
      updatedAt: UPDATED,
      chapters: [
        {
          id: 'chap-1',
          slug: 'jumlah-penduduk',
          number: '1',
          title: 'Jumlah Penduduk',
          sortOrder: 0,
          updatedAt: UPDATED,
          sections: [
            { id: 'sec-1', slug: 'ringkasan', title: null, sortOrder: 0, updatedAt: UPDATED },
          ],
        },
      ],
    },
  ];
}

function mountForm(props: Record<string, unknown> = {}) {
  setActivePinia(createPinia());
  usePagesStore().hierarchyPages = hierarchy();
  return mount(CreateDataForm, { props, attachTo: document.body });
}

/** Chooses Kependudukan › Jumlah Penduduk › (tanpa judul) through the three selects. */
async function pickSection(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('#create-data-lokasi-page').setValue('page-1');
  await wrapper.get('#create-data-lokasi-chapter').setValue('chap-1');
  await wrapper.get('#create-data-lokasi-section').setValue('sec-1');
}

async function fillScalar(wrapper: VueWrapper): Promise<void> {
  await pickSection(wrapper);
  await wrapper.get('#create-data-label').setValue('Jumlah KK');
  await wrapper.get('#create-data-unit').setValue('KK');
  await wrapper.get('#create-data-value-current').setValue('4200');
  await wrapper.get('#create-data-period-current').setValue('2026');
}

describe('CreateDataForm', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('submits a scalar indicator with only the fields the operator filled', async () => {
    const wrapper = mountForm();
    await fillScalar(wrapper);
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('submit')).toEqual([
      [
        {
          type: 'skalar',
          sectionId: 'sec-1',
          input: {
            label: 'Jumlah KK',
            unit: 'KK',
            valueCurrent: '4200',
            periodCurrent: '2026',
            valuePrevious: null,
            periodPrevious: null,
            source: null,
          },
        },
      ],
    ]);
    wrapper.unmount();
  });

  it('sends the previous-year pair only when the comparison is switched on', async () => {
    const wrapper = mountForm();
    await fillScalar(wrapper);
    await wrapper.get('#create-data-comparison-enabled').setValue(true);
    await wrapper.get('#create-data-value-previous').setValue('4100');
    await wrapper.get('#create-data-period-previous').setValue('2025');
    await wrapper.get('form').trigger('submit');

    const payload = wrapper.emitted('submit')?.[0]?.[0] as {
      input: { valuePrevious: string; periodPrevious: string };
    };
    expect(payload.input.valuePrevious).toBe('4100');
    expect(payload.input.periodPrevious).toBe('2025');
    wrapper.unmount();
  });

  it('blocks the save and names each missing required field in text', async () => {
    const wrapper = mountForm();
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('submit')).toBeUndefined();
    const text = wrapper.text();
    expect(text).toContain('Bagian wajib diisi.');
    expect(text).toContain('Label indikator wajib diisi.');
    expect(text).toContain('Nilai sekarang wajib diisi.');
    expect(wrapper.get('#create-data-label').attributes('aria-invalid')).toBe('true');
    expect(wrapper.get('#create-data-label').attributes('aria-describedby')).toContain(
      'create-data-label-error',
    );
    wrapper.unmount();
  });

  it('focuses the input each error-summary link names, for every scalar field', async () => {
    const wrapper = mountForm();
    await wrapper.get('#create-data-comparison-enabled').setValue(true);
    await wrapper.get('form').trigger('submit');

    const links = wrapper.findAll('[role="alert"] a');
    const targets = links.map((link) => link.attributes('href')?.replace(/^#/, ''));
    // Section, label, both values and both periods are all missing here.
    expect(targets).toEqual(
      expect.arrayContaining([
        'create-data-lokasi-page',
        'create-data-label',
        'create-data-value-current',
        'create-data-period-current',
        'create-data-value-previous',
        'create-data-period-previous',
      ]),
    );
    for (const link of links) {
      const targetId = link.attributes('href')?.replace(/^#/, '') ?? '';
      expect(document.getElementById(targetId)).not.toBeNull();
      await link.trigger('click');
      expect(document.activeElement?.id).toBe(targetId);
    }
    wrapper.unmount();
  });

  it('focuses the matching input for every matrix error-summary link', async () => {
    const wrapper = mountForm();
    await wrapper.get('#create-data-type-matriks').setValue(true);
    await wrapper.get('form').trigger('submit');

    for (const link of wrapper.findAll('[role="alert"] a')) {
      const targetId = link.attributes('href')?.replace(/^#/, '') ?? '';
      expect(document.getElementById(targetId)).not.toBeNull();
      await link.trigger('click');
      expect(document.activeElement?.id).toBe(targetId);
    }
    wrapper.unmount();
  });

  it('rejects a decimal written with a comma before sending', async () => {
    const wrapper = mountForm();
    await fillScalar(wrapper);
    await wrapper.get('#create-data-value-current').setValue('12,5');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.text()).toContain('harus berupa angka desimal dengan titik');
    wrapper.unmount();
  });

  it('submits an empty matrix table with its kind, title and period and no rows', async () => {
    const wrapper = mountForm();
    await pickSection(wrapper);
    await wrapper.get('#create-data-type-matriks').setValue(true);
    await wrapper.get('#create-data-kind').setValue('occupation');
    await wrapper.get('#create-data-title').setValue('Mata Pencaharian Penduduk');
    await wrapper.get('#create-data-period').setValue('Juni 2024');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('submit')).toEqual([
      [
        {
          type: 'matriks',
          sectionId: 'sec-1',
          input: {
            title: 'Mata Pencaharian Penduduk',
            kind: 'occupation',
            period: 'Juni 2024',
            source: null,
          },
        },
      ],
    ]);
    wrapper.unmount();
  });

  it('requires a table kind before a matrix can be saved', async () => {
    const wrapper = mountForm();
    await pickSection(wrapper);
    await wrapper.get('#create-data-type-matriks').setValue(true);
    await wrapper.get('#create-data-title').setValue('Mata Pencaharian Penduduk');
    await wrapper.get('#create-data-period').setValue('Juni 2024');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.text()).toContain('Pilih jenis tabel terlebih dahulu.');
    wrapper.unmount();
  });

  it('keeps every field as typed when the parent reports a failed save', async () => {
    const wrapper = mountForm();
    await fillScalar(wrapper);
    await wrapper.get('form').trigger('submit');

    await wrapper.setProps({ serverError: 'Gagal menyimpan data baru.', serverErrorKind: 'server' });

    expect(wrapper.get('[data-test="create-server-error"]').text()).toContain(
      'Gagal menyimpan data baru.',
    );
    expect((wrapper.get('#create-data-label').element as HTMLInputElement).value).toBe(
      'Jumlah KK',
    );
    expect((wrapper.get('#create-data-value-current').element as HTMLInputElement).value).toBe(
      '4200',
    );
    expect(wrapper.findComponent(SectionPicker).props('modelValue')).toBe('sec-1');
    wrapper.unmount();
  });

  it('clears the chapter and section when the page changes', async () => {
    const wrapper = mountForm();
    await wrapper.get('#create-data-lokasi-page').setValue('page-1');
    await wrapper.get('#create-data-lokasi-chapter').setValue('chap-1');
    await wrapper.get('#create-data-lokasi-section').setValue('sec-1');
    expect(wrapper.findComponent(SectionPicker).props('modelValue')).toBe('sec-1');

    await wrapper.get('#create-data-lokasi-page').setValue('page-1');

    expect(wrapper.findComponent(SectionPicker).props('modelValue')).toBe('');
    expect((wrapper.get('#create-data-lokasi-chapter').element as HTMLSelectElement).value).toBe(
      '',
    );
    wrapper.unmount();
  });

  it('disables every control while a save is in flight', async () => {
    const wrapper = mountForm({ busy: true });
    expect(wrapper.get('#create-data-label').attributes('disabled')).toBeDefined();
    expect(wrapper.get('#create-data-type-skalar').attributes('disabled')).toBeDefined();
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });
});
