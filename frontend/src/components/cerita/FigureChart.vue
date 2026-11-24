<script setup lang="ts">
import { computed } from 'vue';
import type { ChartFigure, ChartTable } from '../../types/ceritaArticle';
import BarDiagram, { type BarDiagramItem } from '../common/BarDiagram.vue';
import {
  CHART_VALUE_LABELS,
  chartGroups,
  chartMax,
  type ChartValueKey,
} from '../../utils/ceritaChart';

/**
 * A chart of one indicator table on the Cerita page (SPEC §8). `bar` draws horizontal bars with the
 * shared BarDiagram; `column` draws vertical columns in CSS. In columns, male is solid and female
 * hatched; in horizontal bars each bar's own label names the series ("Kelurahan — Perempuan") and
 * the tone differs, so the two never rely on colour alone. The same numbers are always available as a table under "Lihat sebagai tabel".
 *
 * Renders nothing when the table is missing or has no value to draw.
 */
const props = defineProps<{ figure: ChartFigure; table: ChartTable | null | undefined }>();

const groups = computed(() => chartGroups(props.figure, props.table));
const max = computed(() => chartMax(groups.value));

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

const bySex = computed(() => props.figure.series === 'by_sex');
const chartKindLabel = computed(() => (props.figure.chartType === 'bar' ? 'batang' : 'kolom'));

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
    `Diagram ${chartKindLabel.value}: ${props.figure.title}. Nilai ada di tabel di bawah diagram.`,
);

/** Column height in pixels for a value, on a plot of 160px (the rest is the value label). */
function columnHeight(value: number): number {
  return Math.max(2, Math.round((value / max.value) * 160));
}

function formatValue(value: number): string {
  return new Intl.NumberFormat('id-ID').format(value);
}

function valueOf(group: { values: { key: ChartValueKey; value: number }[] }, key: ChartValueKey) {
  return group.values.find((value) => value.key === key)?.value;
}
</script>

<template>
  <figure
    v-if="groups.length > 0"
    class="rounded-card border-border border bg-white p-4 shadow-md"
    data-test="figure-chart"
  >
    <figcaption class="text-brand-navy text-center text-base font-semibold" data-test="chart-title">
      {{ figure.title }}
    </figcaption>

    <div class="mt-4" role="img" :aria-label="summary" data-test="chart-visual">
      <BarDiagram
        v-if="figure.chartType === 'bar'"
        hide-header
        :title="figure.title"
        :items="barItems"
      />

      <div
        v-else
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
    </div>

    <ul
      v-if="bySex"
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
                v-for="key in keys"
                :key="key"
                scope="col"
                class="py-2 pr-4 text-right font-medium"
              >
                {{ CHART_VALUE_LABELS[key] }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="group in groups" :key="group.id" class="border-border border-b">
              <th scope="row" class="text-text-muted py-2 pr-4 text-left font-normal">
                {{ group.label }}
              </th>
              <td v-for="key in keys" :key="key" class="py-2 pr-4 text-right tabular-nums">
                {{ valueOf(group, key) === undefined ? '—' : formatValue(valueOf(group, key)!) }}
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

<style scoped>
/* Female values: diagonal hatching, so the two series differ in pattern as well as in colour. */
.chart-hatch {
  background-image: repeating-linear-gradient(
    135deg,
    #8491a9 0,
    #8491a9 2px,
    #ffffff 2px,
    #ffffff 5px
  );
}
</style>
