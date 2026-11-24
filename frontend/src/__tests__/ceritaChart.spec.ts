import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FigureChart from '../components/cerita/FigureChart.vue';
import ArticleFigure from '../components/cerita/ArticleFigure.vue';
import { chartGroups, chartMax } from '../utils/ceritaChart';
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
