import { describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import TableRowAddForm from '../components/data/TableRowAddForm.vue';
import TableIndicatorForm from '../components/data/TableIndicatorForm.vue';
import type {
  IndicatorTableDetail,
  IndicatorTableKind,
  IndicatorTableRow,
} from '../stores/indicatorTables.store';

const CREATED = '2026-01-01T00:00:00.000Z';

function row(id: string, overrides: Partial<IndicatorTableRow> = {}): IndicatorTableRow {
  return {
    id,
    tableId: 'tbl-1',
    rowKey: id,
    label: `Baris ${id}`,
    male: 100,
    female: 90,
    total: 190,
    sortOrder: 0,
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

function detail(kind: IndicatorTableKind, rows: IndicatorTableRow[]): IndicatorTableDetail {
  return {
    id: 'tbl-1',
    sectionId: 'sec-1',
    slug: 'piramida-usia',
    title: 'Piramida Usia',
    kind,
    period: 'Juni 2024',
    source: null,
    sortOrder: 0,
    createdAt: CREATED,
    updatedAt: CREATED,
    rows,
    totals: { rowCount: rows.length, male: null, female: null, total: null },
  };
}

function mountRowForm(kind: IndicatorTableKind, props: Record<string, unknown> = {}) {
  // AlertBanner reads the auth store, so a Pinia instance must be active.
  setActivePinia(createPinia());
  return mount(TableRowAddForm, { props: { kind, ...props } });
}

async function fill(wrapper: VueWrapper, values: Record<string, string>): Promise<void> {
  for (const [id, value] of Object.entries(values)) {
    await wrapper.get(`#table-row-add-${id}`).setValue(value);
  }
}

describe('TableRowAddForm', () => {
  it('asks for male and female cells for a sex-split kind and emits them as numbers', async () => {
    const wrapper = mountRowForm('age_pyramid');
    expect(wrapper.find('#table-row-add-total').exists()).toBe(false);

    await fill(wrapper, { label: '75 tahun ke atas', male: '5', female: '' });
    await wrapper.get('form').trigger('submit');

    // A sex-split row carries male and female only: no total key at all.
    expect(wrapper.emitted('submit')).toEqual([
      [{ label: '75 tahun ke atas', male: 5, female: null }],
    ]);
    const [[payload]] = wrapper.emitted('submit') as [[Record<string, unknown>]];
    expect(payload).not.toHaveProperty('total');
    wrapper.unmount();
  });

  it('asks for a single total for a single-value kind', async () => {
    const wrapper = mountRowForm('occupation');
    expect(wrapper.find('#table-row-add-male').exists()).toBe(false);

    await fill(wrapper, { label: 'Petani', total: '240' });
    await wrapper.get('form').trigger('submit');

    // A single-value row carries total only: no male or female key.
    expect(wrapper.emitted('submit')).toEqual([[{ label: 'Petani', total: 240 }]]);
    const [[payload]] = wrapper.emitted('submit') as [[Record<string, unknown>]];
    expect(payload).not.toHaveProperty('male');
    expect(payload).not.toHaveProperty('female');
    wrapper.unmount();
  });

  it('moves focus to the label when focusLabel() is called', async () => {
    const wrapper = mount(TableRowAddForm, {
      props: { kind: 'occupation' },
      attachTo: document.body,
    });
    (wrapper.vm as unknown as { focusLabel: () => void }).focusLabel();
    expect(document.activeElement?.id).toBe('table-row-add-label');
    wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('names a missing label and an invalid cell in text, and sends nothing', async () => {
    const wrapper = mountRowForm('age_pyramid');
    await fill(wrapper, { label: '', male: '1,5' });
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.text()).toContain('Label baris wajib diisi.');
    expect(wrapper.text()).toContain('Laki-laki harus berupa bilangan bulat 0 atau lebih.');
    expect(wrapper.get('#table-row-add-label').attributes('aria-invalid')).toBe('true');
    wrapper.unmount();
  });

  it('keeps the draft on a failed save and clears it on reset()', async () => {
    const wrapper = mountRowForm('occupation');
    await fill(wrapper, { label: 'Petani', total: '240' });
    await wrapper.get('form').trigger('submit');

    await wrapper.setProps({ serverError: 'Gagal menambah baris.', serverErrorKind: 'server' });
    expect(wrapper.get('[data-test="row-add-server-error"]').text()).toContain(
      'Gagal menambah baris.',
    );
    expect((wrapper.get('#table-row-add-label').element as HTMLInputElement).value).toBe('Petani');

    (wrapper.vm as unknown as { reset: () => void }).reset();
    await wrapper.vm.$nextTick();
    expect((wrapper.get('#table-row-add-label').element as HTMLInputElement).value).toBe('');
    wrapper.unmount();
  });

  it('is its own form, so the table form is not nested inside it', () => {
    const wrapper = mountRowForm('ethnicity');
    expect(wrapper.element.tagName).toBe('FORM');
    expect(wrapper.element.querySelector('form')).toBeNull();
    wrapper.unmount();
  });
});

describe('TableIndicatorForm when a row is added', () => {
  it('gives the new row a draft and keeps an unsaved edit on an existing row', async () => {
    const wrapper = mount(TableIndicatorForm, {
      props: { table: detail('age_pyramid', [row('r1')]) },
    });
    await wrapper.get('#table-row-r1-label').setValue('Balita (edit belum disimpan)');

    await wrapper.setProps({
      table: detail('age_pyramid', [row('r1'), row('r2', { label: 'Remaja', male: 3, female: 4, total: 7 })]),
    });

    expect((wrapper.get('#table-row-r1-label').element as HTMLInputElement).value).toBe(
      'Balita (edit belum disimpan)',
    );
    expect((wrapper.get('#table-row-r2-label').element as HTMLInputElement).value).toBe('Remaja');
    expect((wrapper.get('#table-row-r2-male').element as HTMLInputElement).value).toBe('3');
    wrapper.unmount();
  });
});
