import { describe, it, expect } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import TableIndicatorForm from '../components/data/TableIndicatorForm.vue';
import type { IndicatorTableDetail, IndicatorTableKind } from '../stores/indicatorTables.store';

const CREATED = '2026-01-01T00:00:00.000Z';

function makeTable(
  kind: IndicatorTableKind = 'age_pyramid',
  overrides: Partial<IndicatorTableDetail> = {},
): IndicatorTableDetail {
  const sexSplit = kind === 'age_pyramid' || kind === 'religion_by_sex';
  return {
    id: 'tbl-1',
    sectionId: 'sec-1',
    slug: 'piramida-usia',
    title: 'Piramida Usia',
    kind,
    period: 'Juni 2024',
    source: 'Prodeskel',
    sortOrder: 0,
    createdAt: CREATED,
    updatedAt: CREATED,
    rows: [
      {
        id: 'row-1',
        tableId: 'tbl-1',
        rowKey: '0-4',
        label: '0-4 tahun',
        male: sexSplit ? 100 : null,
        female: sexSplit ? 90 : null,
        total: sexSplit ? null : 190,
        sortOrder: 0,
        createdAt: CREATED,
        updatedAt: CREATED,
      },
      {
        id: 'row-2',
        tableId: 'tbl-1',
        rowKey: '5-9',
        label: '5-9 tahun',
        male: sexSplit ? 110 : null,
        female: sexSplit ? 95 : null,
        total: sexSplit ? null : 205,
        sortOrder: 1,
        createdAt: CREATED,
        updatedAt: CREATED,
      },
    ],
    totals: { rowCount: 2, male: 210, female: 185, total: 395 },
    ...overrides,
  };
}

function expectEveryControlLabelled(wrapper: VueWrapper): void {
  const controls = wrapper.findAll('input, textarea, select');
  expect(controls.length).toBeGreaterThan(0);

  for (const control of controls) {
    const id = control.attributes('id');
    expect(id, `control without id: ${control.html()}`).toBeTruthy();
    expect(wrapper.find(`label[for="${id}"]`).exists(), `missing <label for="${id}">`).toBe(true);
  }
}

describe('TableIndicatorForm.vue', () => {
  it('renders a real table with scoped headers and a sticky row header', () => {
    const wrapper = mount(TableIndicatorForm, { props: { table: makeTable() } });

    const table = wrapper.find('table');
    expect(table.exists()).toBe(true);
    expect(wrapper.find('caption').exists()).toBe(true);
    expect(wrapper.findAll('th[scope="col"]').length).toBeGreaterThanOrEqual(4);
    expect(wrapper.findAll('th[scope="row"]').length).toBeGreaterThan(0);

    wrapper.unmount();
  });

  it('labels every control in the sex-split shape', () => {
    const wrapper = mount(TableIndicatorForm, { props: { table: makeTable('age_pyramid') } });

    expectEveryControlLabelled(wrapper);
    expect(wrapper.find('#table-row-row-1-male').exists()).toBe(true);
    expect(wrapper.find('#table-row-row-1-female').exists()).toBe(true);
    expect(wrapper.find('#table-row-row-1-total').exists()).toBe(false);

    wrapper.unmount();
  });

  it('derives the row total from male + female instead of editing it', () => {
    const wrapper = mount(TableIndicatorForm, { props: { table: makeTable('age_pyramid') } });

    const totals = wrapper.findAll('[data-test="derived-total"]');
    expect(totals[0]?.text()).toBe('190');
    expect(totals[1]?.text()).toBe('205');

    wrapper.unmount();
  });

  it('labels every control in the single-value shape and edits total only', () => {
    const wrapper = mount(TableIndicatorForm, { props: { table: makeTable('ethnicity') } });

    expectEveryControlLabelled(wrapper);
    expect(wrapper.find('#table-row-row-1-total').exists()).toBe(true);
    expect(wrapper.find('#table-row-row-1-male').exists()).toBe(false);

    wrapper.unmount();
  });

  it('submits only the rows and cells that actually changed', async () => {
    const wrapper = mount(TableIndicatorForm, { props: { table: makeTable('age_pyramid') } });

    await wrapper.find('#table-row-row-1-male').setValue('120');
    await wrapper.find('#table-title').setValue('Piramida Penduduk');
    await wrapper.find('form').trigger('submit');

    const payload = wrapper.emitted('submit')?.[0]?.[0] as {
      table: Record<string, unknown>;
      rows: Array<{ rowId: string; patch: Record<string, unknown> }>;
    };

    expect(payload.table).toEqual({ title: 'Piramida Penduduk' });
    expect(payload.rows).toEqual([{ rowId: 'row-1', patch: { male: 120 } }]);

    wrapper.unmount();
  });

  it('saves a row with an empty cell as null instead of blocking the edit', async () => {
    const wrapper = mount(TableIndicatorForm, { props: { table: makeTable('age_pyramid') } });

    await wrapper.find('#table-row-row-1-female').setValue('');
    await wrapper.find('#table-title').setValue('Piramida Penduduk');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    const payload = wrapper.emitted('submit')?.[0]?.[0] as {
      table: Record<string, unknown>;
      rows: Array<{ rowId: string; patch: Record<string, unknown> }>;
    };
    expect(payload.table).toEqual({ title: 'Piramida Penduduk' });
    expect(payload.rows).toEqual([{ rowId: 'row-1', patch: { female: null } }]);

    wrapper.unmount();
  });

  it('clears a single-value cell to null', async () => {
    const wrapper = mount(TableIndicatorForm, { props: { table: makeTable('ethnicity') } });

    await wrapper.find('#table-row-row-1-total').setValue('');
    await wrapper.find('form').trigger('submit');

    const payload = wrapper.emitted('submit')?.[0]?.[0] as {
      rows: Array<{ rowId: string; patch: Record<string, unknown> }>;
    };
    expect(payload.rows).toEqual([{ rowId: 'row-1', patch: { total: null } }]);

    wrapper.unmount();
  });

  it('shows no derived total until both sex cells are filled', async () => {
    const wrapper = mount(TableIndicatorForm, { props: { table: makeTable('age_pyramid') } });

    await wrapper.find('#table-row-row-1-female').setValue('');

    const totals = wrapper.findAll('[data-test="derived-total"]');
    expect(totals[0]?.text()).toBe('—');
    expect(totals[1]?.text()).toBe('205');

    wrapper.unmount();
  });

  it('rejects a non-integer cell before sending anything', async () => {
    const wrapper = mount(TableIndicatorForm, { props: { table: makeTable('ethnicity') } });

    await wrapper.find('#table-row-row-1-total').setValue('abc');
    await wrapper.find('form').trigger('submit');

    const summary = wrapper.find('[role="alert"]');
    expect(summary.exists()).toBe(true);
    expect(summary.text()).toContain('harus berupa bilangan bulat');
    expect(wrapper.find('#table-row-row-1-total').attributes('aria-invalid')).toBe('true');
    expect(wrapper.emitted('submit')).toBeUndefined();

    wrapper.unmount();
  });

  it('keeps the save button disabled until something changes', async () => {
    const wrapper = mount(TableIndicatorForm, { props: { table: makeTable('occupation') } });

    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('Belum ada perubahan');

    await wrapper.find('#table-row-row-2-total').setValue('210');
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined();

    wrapper.unmount();
  });

  it('surfaces a server error through the alert region', () => {
    const wrapper = mount(TableIndicatorForm, {
      props: {
        table: makeTable('ethnicity'),
        serverError: "rowKey '0-4' sudah dipakai baris lain di tabel ini.",
      },
    });

    expect(wrapper.find('[data-test="form-error"]').text()).toContain('rowKey');
    wrapper.unmount();
  });

  it('keeps unsaved drafts when the parent re-renders with the same table', async () => {
    const wrapper = mount(TableIndicatorForm, { props: { table: makeTable() } });

    await wrapper.find('#table-row-row-1-male').setValue('250');
    await wrapper.find('#table-row-row-2-female').setValue('99');

    // A refetch hands the form a new object for the same table. Resetting here would wipe the
    // editor's work — including rows that were never sent.
    await wrapper.setProps({ table: makeTable() });

    expect((wrapper.find('#table-row-row-1-male').element as HTMLInputElement).value).toBe('250');
    expect((wrapper.find('#table-row-row-2-female').element as HTMLInputElement).value).toBe('99');

    wrapper.unmount();
  });

  it('resets the drafts when a different table is loaded', async () => {
    const wrapper = mount(TableIndicatorForm, { props: { table: makeTable() } });

    await wrapper.find('#table-row-row-1-male').setValue('250');
    await wrapper.setProps({ table: makeTable('age_pyramid', { id: 'tbl-2' }) });

    expect((wrapper.find('#table-row-row-1-male').element as HTMLInputElement).value).toBe('100');

    wrapper.unmount();
  });
});
