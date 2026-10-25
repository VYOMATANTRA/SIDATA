import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MatrixTableBlock from '../components/cerita/MatrixTableBlock.vue';
import type { IndicatorTableDetailDto } from '../stores/indicatorTables.store';

const sexSplitTable: IndicatorTableDetailDto = {
  id: 'tbl-1',
  sectionId: 'sec-1',
  slug: 'piramida-usia',
  title: 'Piramida Usia',
  kind: 'age_pyramid',
  period: 'Juni 2024',
  source: 'Prodeskel',
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  rows: [
    {
      id: 'row-1',
      tableId: 'tbl-1',
      rowKey: '0-4',
      label: '0–4 Tahun',
      male: 120,
      female: 110,
      total: 230,
      sortOrder: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  totals: { rowCount: 1, male: 120, female: 110, total: 230 },
};

const singleValueTable: IndicatorTableDetailDto = {
  ...sexSplitTable,
  id: 'tbl-2',
  slug: 'mata-pencaharian',
  title: 'Mata Pencaharian',
  kind: 'occupation',
  rows: [
    {
      id: 'row-2',
      tableId: 'tbl-2',
      rowKey: 'petani',
      label: 'Petani',
      male: null,
      female: null,
      total: 50,
      sortOrder: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  totals: { rowCount: 1, male: null, female: null, total: 50 },
};

describe('MatrixTableBlock.vue', () => {
  it('renders two chart bars per row for sex-split kinds', () => {
    const wrapper = mount(MatrixTableBlock, { props: { table: sexSplitTable } });

    const bars = wrapper.findAll('[data-test="bar-item"]');
    expect(bars).toHaveLength(2);
  });

  it('renders one chart bar per row for single-value kinds', () => {
    const wrapper = mount(MatrixTableBlock, { props: { table: singleValueTable } });

    const bars = wrapper.findAll('[data-test="bar-item"]');
    expect(bars).toHaveLength(1);
  });

  it('includes a same-data accessible table behind a disclosure, with male/female columns for sex-split kinds', () => {
    const wrapper = mount(MatrixTableBlock, { props: { table: sexSplitTable } });

    expect(wrapper.find('details[data-test="matrix-table-details"]').exists()).toBe(true);
    const table = wrapper.find('[data-test="matrix-table-data"]');
    expect(table.exists()).toBe(true);
    expect(table.find('caption').exists()).toBe(true);
    expect(table.findAll('th[scope="col"]').length).toBe(4); // Label, Laki-laki, Perempuan, Total
    expect(table.text()).toContain('120');
    expect(table.text()).toContain('110');
    expect(table.text()).toContain('230');
  });

  it('omits male/female columns for single-value kinds', () => {
    const wrapper = mount(MatrixTableBlock, { props: { table: singleValueTable } });

    const table = wrapper.find('[data-test="matrix-table-data"]');
    expect(table.findAll('th[scope="col"]').length).toBe(2); // Label, Total
    expect(table.text()).not.toContain('Laki-laki');
  });

  it('shows the source line when present', () => {
    const wrapper = mount(MatrixTableBlock, { props: { table: sexSplitTable } });
    expect(wrapper.find('[data-test="matrix-table-source"]').text()).toContain('Prodeskel');
  });

  it('shows a visible period framing sentence (Spec §6), not just the screen-reader caption', () => {
    const wrapper = mount(MatrixTableBlock, { props: { table: sexSplitTable } });

    const period = wrapper.find('[data-test="matrix-table-period"]');
    expect(period.exists()).toBe(true);
    expect(period.text()).toContain('Juni 2024');
    expect(period.classes()).not.toContain('sr-only');
  });

  it('leaves a missing cell out of the chart instead of drawing it as a 0 bar', () => {
    const partialSexSplitTable: IndicatorTableDetailDto = {
      ...sexSplitTable,
      rows: [
        {
          ...sexSplitTable.rows[0]!,
          male: null,
          female: 110,
        },
      ],
    };

    const wrapper = mount(MatrixTableBlock, { props: { table: partialSexSplitTable } });

    const bars = wrapper.findAll('[data-test="bar-item"]');
    expect(bars).toHaveLength(1);
    expect(wrapper.find('[data-test="bar-label"]').text()).toContain('Perempuan');

    // The table alternative still shows the missing cell explicitly as "—", so chart and
    // table don't contradict each other (no bar vs. no "0" either).
    const table = wrapper.find('[data-test="matrix-table-data"]');
    expect(table.text()).toContain('—');
  });

  it('leaves a row with a null total out of the chart entirely for single-value kinds', () => {
    const partialSingleValueTable: IndicatorTableDetailDto = {
      ...singleValueTable,
      rows: [
        ...singleValueTable.rows,
        {
          id: 'row-3',
          tableId: 'tbl-2',
          rowKey: 'nelayan',
          label: 'Nelayan',
          male: null,
          female: null,
          total: null,
          sortOrder: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };

    const wrapper = mount(MatrixTableBlock, { props: { table: partialSingleValueTable } });

    const bars = wrapper.findAll('[data-test="bar-item"]');
    expect(bars).toHaveLength(1);
    expect(wrapper.find('[data-test="bar-label"]').text()).toBe('Petani');
  });
});
