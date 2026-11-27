<script setup lang="ts">
import { computed } from 'vue';
import type { ChartFigure, ChartTable, ChartType } from '../../types/ceritaArticle';
import BarDiagram, { type BarDiagramItem } from '../common/BarDiagram.vue';
import ChartDonut from './ChartDonut.vue';
import ChartPyramid from './ChartPyramid.vue';
import ChartStackedBar from './ChartStackedBar.vue';
import {
  CHART_VALUE_LABELS,
  chartGroups,
  chartMax,
  donutSlices,
  formatChartNumber,
  rowShares,
  type ChartGroup,
  type ChartValueKey,
} from '../../utils/ceritaChart';

/**
 * A chart of one indicator table on the Cerita page (SPEC §8). This component is the frame: title,
 * the `role="img"` summary, the legend, the "Lihat sebagai tabel" table and the source. The visual
 * depends on the chart type:
 * - `bar`: horizontal bars (the shared BarDiagram);
 * - `column`: vertical columns in CSS;
 * - `pyramid`: male left, female right, on one scale (ChartPyramid);
 * - `donut`: one ring for `total`, or one ring per sex for `by_sex` (ChartDonut, with its own legend);
 * - `stacked` and `percent`: one bar per row, male and female end to end or as a 100% split (ChartStackedBar).
 *
 * Male is solid and female hatched in every type that draws both. In horizontal bars each bar's own
 * label names the series ("Kelurahan — Perempuan"), so the two never rely on colour alone. The
 * numbers are always available as a table under "Lihat sebagai tabel"; `percent` and `donut` add
 * share columns to it.
 *
 * Renders nothing when the table is missing or has no value to draw.
 */
const props = defineProps<{ figure: ChartFigure; table: ChartTable | null | undefined }>();

const allGroups = computed(() => chartGroups(props.figure, props.table));
/**
 * `percent` needs both sexes to compute a split, so a row with only one value is left out rather
 * than drawn as 100% of that sex; the table below still lists every value of the other types.
 */
const groups = computed(() =>
  props.figure.chartType === 'percent'
    ? allGroups.value.filter((group) => group.values.length > 1)
    : allGroups.value,
);
const max = computed(() => chartMax(groups.value));
const chartType = computed<ChartType>(() => props.figure.chartType);
const bySex = computed(() => props.figure.series === 'by_sex');

/** Keys in the order they first appear, so the legend and the table columns match the chart. */
const keys = computed<ChartValueKey[]>(() => {
  const seen: ChartValueKey[] = [];
  for (const group of groups.value) {
    for (const value of group.values) {
      if (!seen.includes(value.key)) seen.push(value.key);
    }
  }
  return seen;
});

/** A donut is drawn for each key that has a slice; a sex with no value gets no ring. */
const donutKeys = computed(() =>
  keys.value.filter((key) => donutSlices(groups.value, key).length > 0),
);

/** The frame legend names the hatch and colour of each sex; the donut carries its own legend. */
const showLegend = computed(() => bySex.value && chartType.value !== 'donut');

const KIND_LABELS: Readonly<Record<ChartType, string>> = {
  bar: 'batang',
  column: 'kolom',
  pyramid: 'piramida penduduk',
  donut: 'donat',
  stacked: 'batang bertumpuk',
  percent: 'batang persentase',
};

const barItems = computed<BarDiagramItem[]>(() =>
  groups.value.flatMap((group) =>
    group.values.map((value) => ({
      id: `${group.id}-${value.key}`,
      label: bySex.value ? `${group.label} — ${value.label}` : group.label,
      value: value.value,
      color: value.key === 'female' ? 'bg-border-strong' : 'bg-brand-navy',
    })),
  ),
);

const summary = computed(
  () =>
    `Diagram ${KIND_LABELS[chartType.value]}: ${props.figure.title}. Nilai ada di tabel di bawah diagram.`,
);

/** Column height in pixels for a value, on a plot of 160px (the rest is the value label). */
function columnHeight(value: number): number {
  return Math.max(2, Math.round((value / max.value) * 160));
}

function formatValue(value: number): string {
  return formatChartNumber(value);
}

function valueOf(group: ChartGroup, key: ChartValueKey): number | undefined {
  return group.values.find((value) => value.key === key)?.value;
}

/**
 * Share of a value for the table: `percent` gives each row's own split; `donut` gives the share of
 * the donut's total (for that sex, or the one total). Keyed by row and key; missing when not shown.
 */
const shares = computed(() => {
  const map = new Map<string, number>();
  if (chartType.value === 'percent') {
    for (const group of groups.value) {
      for (const share of rowShares(group)) map.set(`${group.id}|${share.key}`, share.percent);
    }
  } else if (chartType.value === 'donut') {
    for (const key of keys.value) {
      for (const slice of donutSlices(groups.value, key)) {
        map.set(`${slice.id}|${key}`, slice.percent);
      }
    }
  }
  return map;
});

/** Table columns: each value, then its share where the type shows shares. */
interface TableColumn {
  key: ChartValueKey;
  kind: 'value' | 'share';
  label: string;
}

const columns = computed<TableColumn[]>(() => {
  const out: TableColumn[] = [];
  for (const key of keys.value) {
    out.push({ key, kind: 'value', label: CHART_VALUE_LABELS[key] });
    if (chartType.value === 'percent') {
      out.push({ key, kind: 'share', label: `% ${CHART_VALUE_LABELS[key]}` });
    } else if (chartType.value === 'donut') {
      const of = key === 'total' ? 'total' : CHART_VALUE_LABELS[key].toLowerCase();
      out.push({ key, kind: 'share', label: `% dari ${of}` });
    }
  }
  return out;
});

function cellText(group: ChartGroup, column: TableColumn): string {
  if (column.kind === 'share') {
    const share = shares.value.get(`${group.id}|${column.key}`);
    return share === undefined ? '—' : `${share}%`;
  }
  const value = valueOf(group, column.key);
  return value === undefined ? '—' : formatValue(value);
}
</script>

<template>
  <figure
    v-if="groups.length > 0 && (chartType !== 'donut' || donutKeys.length > 0)"
    class="rounded-card border-border border bg-white p-4 shadow-md"
    data-test="figure-chart"
    :data-chart-type="chartType"
  >
    <figcaption class="text-brand-navy text-center text-base font-semibold" data-test="chart-title">
      {{ figure.title }}
    </figcaption>

    <div class="mt-4" role="img" :aria-label="summary" data-test="chart-visual">
      <BarDiagram v-if="chartType === 'bar'" hide-header :title="figure.title" :items="barItems" />

      <div
        v-else-if="chartType === 'column'"
        class="border-border-strong flex items-end gap-4 overflow-x-auto border-b-2 px-2 pb-0 sm:gap-6"
        data-test="chart-columns"
      >
        <div
          v-for="group in groups"
          :key="group.id"
          class="flex min-w-16 flex-1 flex-col items-center"
        >
          <div class="flex items-end justify-center gap-2">
            <div
              v-for="value in group.values"
              :key="value.key"
              class="flex w-8 flex-col items-center justify-end sm:w-10"
              :data-test="`chart-column-${value.key}`"
            >
              <span class="text-brand-navy mb-1 text-xs font-bold tabular-nums">
                {{ formatValue(value.value) }}
              </span>
              <div
                class="w-full"
                :class="
                  value.key === 'female' ? 'chart-hatch border-brand-navy border' : 'bg-brand-navy'
                "
                :style="{ height: `${columnHeight(value.value)}px` }"
              />
            </div>
          </div>
          <span class="text-brand-navy mt-2 pb-2 text-center text-xs font-medium">
            {{ group.label }}
          </span>
        </div>
      </div>

      <ChartPyramid v-else-if="chartType === 'pyramid'" :groups="groups" />

      <div
        v-else-if="chartType === 'donut'"
        class="flex flex-wrap justify-center gap-8"
        data-test="chart-donuts"
      >
        <ChartDonut
          v-for="key in donutKeys"
          :key="key"
          :groups="groups"
          :value-key="key"
          :heading="bySex ? CHART_VALUE_LABELS[key] : undefined"
        />
      </div>

      <ChartStackedBar v-else :groups="groups" :percent="chartType === 'percent'" />
    </div>

    <ul
      v-if="showLegend"
      class="text-text-muted mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm"
      data-test="chart-legend"
    >
      <li v-for="key in keys" :key="key" class="flex items-center gap-2">
        <span
          aria-hidden="true"
          class="inline-block h-3.5 w-3.5"
          :class="key === 'female' ? 'chart-hatch border-brand-navy border' : 'bg-brand-navy'"
        />
        {{ CHART_VALUE_LABELS[key] }}
      </li>
    </ul>

    <details class="mt-4" data-test="chart-details">
      <summary class="text-brand-navy cursor-pointer text-sm font-medium">
        Lihat sebagai tabel
      </summary>
      <div class="mt-3 overflow-x-auto">
        <table class="w-full border-collapse text-sm" data-test="chart-data">
          <caption class="sr-only">
            {{
              figure.title
            }}
          </caption>
          <thead>
            <tr class="border-border text-text-muted border-b text-left">
              <th scope="col" class="py-2 pr-4 font-medium">Label</th>
              <th
                v-for="column in columns"
                :key="`${column.key}-${column.kind}`"
                scope="col"
                class="py-2 pr-4 text-right font-medium"
              >
                {{ column.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="group in groups" :key="group.id" class="border-border border-b">
              <th scope="row" class="text-text-muted py-2 pr-4 text-left font-normal">
                {{ group.label }}
              </th>
              <td
                v-for="column in columns"
                :key="`${column.key}-${column.kind}`"
                class="py-2 pr-4 text-right tabular-nums"
              >
                {{ cellText(group, column) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>

    <p v-if="figure.source" class="text-text-muted mt-3 text-sm" data-test="chart-source">
      Sumber: {{ figure.source }}
    </p>
  </figure>
</template>
