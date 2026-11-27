import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FigureChart from '../components/cerita/FigureChart.vue';
import ArticleFigure from '../components/cerita/ArticleFigure.vue';
import {
  chartGroups,
  chartMax,
  donutSlices,
  isChartType,
  isSexOnlyChartType,
  roundShares,
  rowShares,
} from '../utils/ceritaChart';
import { figureFromBlock } from '../services/ceritaFigure.service';
import { storedFigureToArticleFigure } from '../utils/ceritaStoredFigure';
import type { ChartFigure, ChartTable } from '../types/ceritaArticle';

// Synthetic content only.
const table: ChartTable = {
  id: 'tab-1',
  period: '2025 (contoh)',
  rows: [
    { id: 'r1', label: 'Kelompok A', male: 10, female: 6, total: 16 },
    { id: 'r2', label: 'Kelompok B', male: null, female: 4, total: null },
    { id: 'r3', label: 'Kelompok C', male: null, female: null, total: null },
  ],
};

const chart = (over: Partial<ChartFigure> = {}): ChartFigure => ({
  kind: 'chart',
  tableId: 'tab-1',
  chartType: 'bar',
  series: 'total',
  title: 'Contoh bagan',
  source: 'Data contoh',
  ...over,
});

describe('chartGroups', () => {
  it('draws the total per row and skips rows without a total', () => {
    const groups = chartGroups(chart(), table);
    expect(groups.map((g) => g.label)).toEqual(['Kelompok A']);
    expect(groups[0]?.values).toEqual([{ key: 'total', label: 'Total', value: 16 }]);
  });

  it('draws male and female per row, each only where present', () => {
    const groups = chartGroups(chart({ series: 'by_sex' }), table);
    expect(groups).toEqual([
      {
        id: 'r1',
        label: 'Kelompok A',
        values: [
          { key: 'male', label: 'Laki-laki', value: 10 },
          { key: 'female', label: 'Perempuan', value: 6 },
        ],
      },
      {
        id: 'r2',
        label: 'Kelompok B',
        values: [{ key: 'female', label: 'Perempuan', value: 4 }],
      },
    ]);
  });

  it('returns nothing for a missing table or a table with no usable value', () => {
    expect(chartGroups(chart(), undefined)).toEqual([]);
    expect(chartGroups(chart(), { id: 'x', rows: [] })).toEqual([]);
    expect(
      chartGroups(chart({ series: 'by_sex' }), {
        id: 'x',
        rows: [{ id: 'z', label: 'Kosong', male: null, female: null, total: null }],
      }),
    ).toEqual([]);
  });

  it('never draws a non-finite value', () => {
    const groups = chartGroups(chart(), {
      id: 'x',
      rows: [{ id: 'n', label: 'NaN', male: null, female: null, total: Number.NaN }],
    });
    expect(groups).toEqual([]);
  });

  it('uses the largest value as the common scale', () => {
    expect(chartMax(chartGroups(chart({ series: 'by_sex' }), table))).toBe(10);
    expect(chartMax([])).toBe(1);
  });
});

describe('FigureChart', () => {
  it('renders a figure with a caption, the source and a table alternative', () => {
    const w = mount(FigureChart, { props: { figure: chart(), table } });
    expect(w.element.tagName).toBe('FIGURE');
    expect(w.find('figcaption').text()).toBe('Contoh bagan');
    expect(w.find('[data-test="chart-source"]').text()).toContain('Data contoh');
    expect(w.find('[data-test="chart-details"] summary').text()).toBe('Lihat sebagai tabel');
    const headers = w.findAll('[data-test="chart-data"] thead th').map((th) => th.text());
    expect(headers).toEqual(['Label', 'Total']);
    // The table lists the chart's own rows: "Kelompok B" has no total, so it is not drawn or listed.
    expect(w.findAll('[data-test="chart-data"] tbody tr')).toHaveLength(1);
  });

  it('labels the visual as an image and keeps the bar meters inside it', () => {
    const w = mount(FigureChart, { props: { figure: chart(), table } });
    const visual = w.find('[data-test="chart-visual"]');
    expect(visual.attributes('role')).toBe('img');
    expect(visual.attributes('aria-label')).toContain('Contoh bagan');
    expect(w.findAll('[data-test="bar-item"]')).toHaveLength(1);
    expect(w.find('[data-test="bar-value"]').text()).toBe('16');
  });

  it('draws a horizontal bar chart with the shared BarDiagram and no header of its own', () => {
    const w = mount(FigureChart, { props: { figure: chart(), table } });
    expect(w.find('[data-test="bar-diagram-card"]').exists()).toBe(true);
    expect(w.find('[data-test="diagram-title"]').exists()).toBe(false);
    expect(w.find('[data-test="chart-columns"]').exists()).toBe(false);
  });

  it('draws vertical columns for a column chart', () => {
    const w = mount(FigureChart, { props: { figure: chart({ chartType: 'column' }), table } });
    expect(w.find('[data-test="chart-columns"]').exists()).toBe(true);
    expect(w.find('[data-test="bar-diagram-card"]').exists()).toBe(false);
    expect(w.find('[data-test="chart-column-total"]').text()).toContain('16');
  });

  it('shows male and female per row with text labels, a legend and a hatched female value', () => {
    const w = mount(FigureChart, {
      props: { figure: chart({ series: 'by_sex', chartType: 'column' }), table },
    });
    expect(w.findAll('[data-test="chart-column-male"]')).toHaveLength(1);
    expect(w.findAll('[data-test="chart-column-female"]')).toHaveLength(2);
    const legend = w.find('[data-test="chart-legend"]').text();
    expect(legend).toContain('Laki-laki');
    expect(legend).toContain('Perempuan');
    expect(w.find('[data-test="chart-column-female"] > div').classes()).toContain('chart-hatch');
  });

  it('labels each by_sex bar with its sex in text', () => {
    const w = mount(FigureChart, { props: { figure: chart({ series: 'by_sex' }), table } });
    const labels = w.findAll('[data-test="bar-label"]').map((el) => el.text());
    expect(labels).toEqual([
      'Kelompok A — Laki-laki',
      'Kelompok A — Perempuan',
      'Kelompok B — Perempuan',
    ]);
  });

  it('puts an em dash in the table for a missing cell of a by_sex row', () => {
    const w = mount(FigureChart, { props: { figure: chart({ series: 'by_sex' }), table } });
    const rows = w.findAll('[data-test="chart-data"] tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.findAll('td').map((td) => td.text())).toEqual(['10', '6']);
    expect(rows[1]?.findAll('td').map((td) => td.text())).toEqual(['—', '4']);
  });

  it('renders nothing when the table is missing', () => {
    const w = mount(FigureChart, { props: { figure: chart(), table: undefined } });
    expect(w.find('[data-test="figure-chart"]').exists()).toBe(false);
    expect(w.html()).toBe('<!--v-if-->');
  });

  it('renders nothing when the table has no value to draw', () => {
    const w = mount(FigureChart, {
      props: { figure: chart({ series: 'by_sex' }), table: { id: 'tab-1', rows: [] } },
    });
    expect(w.find('[data-test="figure-chart"]').exists()).toBe(false);
  });
});

describe('ArticleFigure chart dispatch', () => {
  it('shows the chart when its table is on the page', () => {
    const w = mount(ArticleFigure, {
      props: { figure: chart(), tables: { 'tab-1': table } },
    });
    expect(w.find('[data-test="figure-chart"]').exists()).toBe(true);
  });

  it('reports visible-change false and renders nothing when the table is missing', () => {
    const w = mount(ArticleFigure, { props: { figure: chart(), tables: {} } });
    expect(w.find('[data-test="figure-chart"]').exists()).toBe(false);
    expect(w.emitted('visible-change')).toEqual([[false]]);
  });

  it('reports visible-change true once the table is available', async () => {
    const w = mount(ArticleFigure, { props: { figure: chart(), tables: {} } });
    await w.setProps({ tables: { 'tab-1': table } });
    expect(w.find('[data-test="figure-chart"]').exists()).toBe(true);
    const emitted = w.emitted('visible-change') ?? [];
    expect(emitted[emitted.length - 1]).toEqual([true]);
  });
});

describe('stored chart parsing', () => {
  const meta = {
    kind: 'chart',
    tableId: 'tab-1',
    chartType: 'column',
    series: 'by_sex',
    title: '  Bagan  ',
    source: ' Sumber ',
  };

  it('reads a valid reader chart and trims its text', () => {
    expect(storedFigureToArticleFigure(meta)).toEqual({
      kind: 'chart',
      tableId: 'tab-1',
      chartType: 'column',
      series: 'by_sex',
      title: 'Bagan',
      source: 'Sumber',
    });
  });

  it.each(['pyramid', 'donut', 'stacked', 'percent'])('reads a stored %s chart', (chartType) => {
    expect(storedFigureToArticleFigure({ ...meta, chartType })).toMatchObject({
      kind: 'chart',
      chartType,
    });
  });

  it('leaves out an empty source', () => {
    const figure = storedFigureToArticleFigure({ ...meta, source: '   ' });
    expect(figure).not.toHaveProperty('source');
  });

  it.each([
    ['bad table id', { tableId: '../x' }],
    ['missing table id', { tableId: undefined }],
    ['unknown chart type', { chartType: 'line' }],
    ['unknown series', { series: 'share' }],
    ['missing title', { title: '  ' }],
  ])('yields no figure for a %s', (_label, patch) => {
    expect(storedFigureToArticleFigure({ ...meta, ...patch })).toBeNull();
  });

  it('parses the same chart in the admin mapping and keeps the source', () => {
    expect(
      figureFromBlock({
        ...block(),
        metadata: { ...meta, title: 'Bagan', source: 'Sumber' },
      } as never),
    ).toEqual({
      kind: 'chart',
      tableId: 'tab-1',
      chartType: 'column',
      series: 'by_sex',
      title: 'Bagan',
      source: 'Sumber',
    });
  });

  it('does not map a chart the admin cannot read to any figure', () => {
    expect(figureFromBlock({ ...block(), metadata: { ...meta, chartType: 'pie' } } as never)).toBe(
      null,
    );
  });
});

function block() {
  return {
    id: 'b1',
    sectionId: 's1',
    type: 'figure',
    slug: 'figure-s1',
    title: null,
    body: '',
    metadata: null,
    sortOrder: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('chart type list', () => {
  it('accepts exactly the six types and refuses anything else', () => {
    for (const type of ['bar', 'column', 'pyramid', 'donut', 'stacked', 'percent']) {
      expect(isChartType(type)).toBe(true);
    }
    for (const type of ['line', 'pie', '', undefined, 3]) {
      expect(isChartType(type)).toBe(false);
    }
  });

  it('marks pyramid, stacked and percent as sex-only, and not the donut', () => {
    expect(isSexOnlyChartType('pyramid')).toBe(true);
    expect(isSexOnlyChartType('stacked')).toBe(true);
    expect(isSexOnlyChartType('percent')).toBe(true);
    expect(isSexOnlyChartType('donut')).toBe(false);
    expect(isSexOnlyChartType('bar')).toBe(false);
  });
});

describe('roundShares', () => {
  it('rounds to whole numbers that always add up to exactly 100', () => {
    // 1/3, 1/3, 1/3 would give 33 + 33 + 33 = 99 without largest-remainder rounding.
    expect(roundShares([1, 1, 1])).toEqual([34, 33, 33]);
    expect(roundShares([10, 6]).reduce((a, b) => a + b, 0)).toBe(100);
    for (const values of [
      [7, 11, 13],
      [1, 2, 3, 4, 5, 6],
      [999, 1],
    ]) {
      expect(roundShares(values).reduce((a, b) => a + b, 0)).toBe(100);
    }
  });

  it('counts a negative or non-finite value as 0 and returns zeros when nothing is positive', () => {
    expect(roundShares([-4, 3, Number.NaN])).toEqual([0, 100, 0]);
    expect(roundShares([0, -1])).toEqual([0, 0]);
    expect(roundShares([])).toEqual([]);
  });
});

describe('rowShares', () => {
  it('splits one row into male and female shares that sum to 100', () => {
    const [group] = chartGroups(chart({ series: 'by_sex' }), table);
    const shares = rowShares(group!);
    expect(shares.map((s) => [s.key, s.value, s.percent])).toEqual([
      ['male', 10, 63],
      ['female', 6, 37],
    ]);
    expect(shares.reduce((sum, s) => sum + s.percent, 0)).toBe(100);
  });

  it('gives a row with one sex the whole bar', () => {
    const [, onlyFemale] = chartGroups(chart({ series: 'by_sex' }), table);
    expect(rowShares(onlyFemale!)).toEqual([
      { key: 'female', label: 'Perempuan', value: 4, percent: 100 },
    ]);
  });
});

describe('donutSlices', () => {
  const groups = chartGroups(chart({ series: 'by_sex' }), {
    id: 'd',
    rows: [
      { id: 'a', label: 'A', male: 30, female: 10, total: null },
      { id: 'b', label: 'B', male: 0, female: 5, total: null },
      { id: 'c', label: 'C', male: -2, female: 5, total: null },
      { id: 'e', label: 'E', male: 10, female: null, total: null },
    ],
  });

  it('draws one slice per row with a positive value, in table order', () => {
    const slices = donutSlices(groups, 'male');
    expect(slices.map((s) => s.label)).toEqual(['A', 'E']);
    expect(slices.map((s) => s.value)).toEqual([30, 10]);
  });

  it('leaves out zero and negative values, and the slices add up to 100%', () => {
    expect(donutSlices(groups, 'female').map((s) => s.label)).toEqual(['A', 'B', 'C']);
    for (const key of ['male', 'female'] as const) {
      const total = donutSlices(groups, key).reduce((sum, s) => sum + s.percent, 0);
      expect(total).toBe(100);
    }
  });

  it('is empty when no row has a positive value for the key', () => {
    expect(donutSlices(groups, 'total')).toEqual([]);
  });
});

describe('FigureChart new types', () => {
  it('draws a pyramid with male and female bars per row', () => {
    const w = mount(FigureChart, {
      props: { figure: chart({ chartType: 'pyramid', series: 'by_sex' }), table },
    });
    expect(w.find('[data-test="chart-pyramid"]').exists()).toBe(true);
    expect(w.findAll('[data-test="pyramid-row"]')).toHaveLength(2);
    expect(w.find('[data-test="chart-legend"]').text()).toContain('Perempuan');
    expect(w.find('[data-test="chart-visual"]').attributes('aria-label')).toContain(
      'piramida penduduk',
    );
  });

  it('draws one donut for the total, with a legend of value and percent', () => {
    const w = mount(FigureChart, {
      props: { figure: chart({ chartType: 'donut' }), table },
    });
    expect(w.findAll('[data-test="chart-donut"]')).toHaveLength(1);
    expect(w.find('[data-test="donut-legend"]').text()).toBe('Kelompok A: 16 (100%)');
    expect(w.find('[data-test="chart-legend"]').exists()).toBe(false);
  });

  it('draws two donuts for a by_sex chart, each headed by its sex', () => {
    const w = mount(FigureChart, {
      props: { figure: chart({ chartType: 'donut', series: 'by_sex' }), table },
    });
    const donuts = w.findAll('[data-test="chart-donut"]');
    expect(donuts).toHaveLength(2);
    expect(donuts.map((d) => d.find('[data-test="donut-heading"]').text())).toEqual([
      'Laki-laki',
      'Perempuan',
    ]);
    expect(donuts[0]!.find('[data-test="donut-legend"]').text()).toBe('Kelompok A: 10 (100%)');
    expect(donuts[1]!.findAll('[data-test="donut-legend"] li').map((li) => li.text())).toEqual([
      'Kelompok A: 6 (60%)',
      'Kelompok B: 4 (40%)',
    ]);
  });

  it('hatches the female donut so it differs by pattern as well as colour', () => {
    const w = mount(FigureChart, {
      props: { figure: chart({ chartType: 'donut', series: 'by_sex' }), table },
    });
    const [male, female] = w.findAll('[data-test="chart-donut"]');
    expect(male!.find('pattern').exists()).toBe(false);
    expect(female!.find('pattern').exists()).toBe(true);
  });

  it('adds share columns to the table for a donut', () => {
    const w = mount(FigureChart, {
      props: { figure: chart({ chartType: 'donut' }), table },
    });
    const headers = w.findAll('[data-test="chart-data"] thead th').map((th) => th.text());
    expect(headers).toEqual(['Label', 'Total', '% dari total']);
    expect(w.find('[data-test="chart-data"] tbody td:last-child').text()).toBe('100%');
  });

  it('draws a stacked bar per row, its length the row total', () => {
    const w = mount(FigureChart, {
      props: { figure: chart({ chartType: 'stacked', series: 'by_sex' }), table },
    });
    expect(w.find('[data-test="chart-stacked"]').exists()).toBe(true);
    expect(w.findAll('[data-test="stacked-row"]')).toHaveLength(2);
    expect(w.findAll('[data-test="stacked-summary"]')[0]!.text()).toBe(
      'Laki-laki 10 · Perempuan 6 · Total 16',
    );
    expect(w.find('[data-test="chart-data"]').exists()).toBe(true);
    const headers = w.findAll('[data-test="chart-data"] thead th').map((th) => th.text());
    expect(headers).toEqual(['Label', 'Laki-laki', 'Perempuan']);
  });

  it('draws a 100% bar per row with percent columns in the table', () => {
    const w = mount(FigureChart, {
      props: { figure: chart({ chartType: 'percent', series: 'by_sex' }), table },
    });
    expect(w.find('[data-test="chart-percent"]').exists()).toBe(true);
    expect(w.findAll('[data-test="stacked-summary"]')[0]!.text()).toBe(
      'Laki-laki 63% (10) · Perempuan 37% (6)',
    );
    const headers = w.findAll('[data-test="chart-data"] thead th').map((th) => th.text());
    expect(headers).toEqual(['Label', 'Laki-laki', '% Laki-laki', 'Perempuan', '% Perempuan']);
    const firstRow = w.findAll('[data-test="chart-data"] tbody tr')[0]!.findAll('td');
    expect(firstRow.map((td) => td.text())).toEqual(['10', '63%', '6', '37%']);
  });
});
