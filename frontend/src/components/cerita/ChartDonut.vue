<script setup lang="ts">
import { computed, useId } from 'vue';
import {
  CHART_HATCH_OVERLAY,
  donutSlices,
  formatChartNumber,
  type ChartGroup,
  type ChartValueKey,
} from '../../utils/ceritaChart';

/**
 * One donut ring for one value key of a chart (SPEC §8). `total` gives one ring; `by_sex` gives
 * one ring per sex, the parent places them side by side and passes the `heading`. Each slice is a
 * row of the table; slices are told apart by a text legend that names every slice with its value
 * and its share, in the same order as the ring. Female is hatched, so the female ring differs in
 * pattern as well as colour. Slices of zero or less are left out (a share cannot be negative).
 */
const props = defineProps<{
  groups: readonly ChartGroup[];
  valueKey: ChartValueKey;
  heading?: string;
}>();

const RADIUS = 45;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Tonal navy ramp for the slices (brand colours only). The legend names each slice, so colour is never the only key. */
const TONES = ['#0a2353', '#4f6183', '#8491a9', '#c3c9d6', '#2f4f86', '#dde2ea'] as const;

const patternId = `donut-hatch-${useId()}`;
const hatched = computed(() => props.valueKey === 'female');
const slices = computed(() => donutSlices(props.groups, props.valueKey));
const total = computed(() => slices.value.reduce((sum, slice) => sum + slice.value, 0));

/** Each slice as a dash on the ring: its length, and the offset where it starts (clockwise). */
const arcs = computed(() => {
  let start = 0;
  return slices.value.map((slice, index) => {
    const length = total.value > 0 ? (slice.value / total.value) * CIRCUMFERENCE : 0;
    const arc = {
      ...slice,
      tone: TONES[index % TONES.length] ?? TONES[0],
      dash: `${length} ${CIRCUMFERENCE - length}`,
      offset: -start,
    };
    start += length;
    return arc;
  });
});

function swatchStyle(tone: string): Record<string, string> {
  return hatched.value
    ? { backgroundColor: tone, backgroundImage: CHART_HATCH_OVERLAY }
    : { backgroundColor: tone };
}
</script>

<template>
  <div class="flex flex-col items-center gap-3" data-test="chart-donut" :data-key="valueKey">
    <p v-if="heading" class="text-brand-navy text-sm font-semibold" data-test="donut-heading">
      {{ heading }}
    </p>

    <div class="relative h-44 w-44 shrink-0">
      <svg viewBox="0 0 120 120" class="h-full w-full" aria-hidden="true" focusable="false">
        <defs v-if="hatched">
          <pattern
            :id="patternId"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" stroke-width="2" />
          </pattern>
        </defs>
        <g transform="rotate(-90 60 60)">
          <template v-for="arc in arcs" :key="arc.id">
            <circle
              cx="60"
              cy="60"
              :r="RADIUS"
              fill="none"
              :stroke="arc.tone"
              stroke-width="22"
              :stroke-dasharray="arc.dash"
              :stroke-dashoffset="arc.offset"
              data-test="donut-slice"
            />
            <circle
              v-if="hatched"
              cx="60"
              cy="60"
              :r="RADIUS"
              fill="none"
              :stroke="`url(#${patternId})`"
              stroke-width="22"
              :stroke-dasharray="arc.dash"
              :stroke-dashoffset="arc.offset"
            />
          </template>
        </g>
      </svg>
      <p class="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span class="text-brand-navy text-base font-bold tabular-nums" data-test="donut-total">
          {{ formatChartNumber(total) }}
        </span>
        <span class="text-text-muted text-xs">Total</span>
      </p>
    </div>

    <ul class="text-text-muted w-full max-w-xs space-y-1 text-sm" data-test="donut-legend">
      <li v-for="arc in arcs" :key="arc.id" class="flex items-start gap-2">
        <span
          aria-hidden="true"
          class="mt-1 inline-block h-3 w-3 shrink-0 rounded-sm"
          :style="swatchStyle(arc.tone)"
        />
        <span class="min-w-0 break-words">
          {{ arc.label }}: {{ formatChartNumber(arc.value) }} ({{ arc.percent }}%)
        </span>
      </li>
    </ul>
  </div>
</template>
