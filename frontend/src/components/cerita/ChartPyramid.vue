<script setup lang="ts">
import { computed } from 'vue';
import {
  chartMax,
  formatChartNumber,
  type ChartGroup,
  type ChartValueKey,
} from '../../utils/ceritaChart';

/**
 * A population pyramid (SPEC §8): one row per group, male bars going left and female bars going
 * right from a shared centre column, all on one scale so the two sides compare. Male is solid,
 * female hatched (never colour alone); the side names are printed above the bars and the values
 * beside them. A value that is missing for a row leaves that side empty, shown as an em dash.
 */
const props = defineProps<{ groups: readonly ChartGroup[] }>();

const max = computed(() => chartMax(props.groups));

function valueOf(group: ChartGroup, key: ChartValueKey): number | undefined {
  return group.values.find((value) => value.key === key)?.value;
}

function barWidth(value: number): string {
  const share = Math.min(100, Math.max(0, (value / max.value) * 100));
  return `${share}%`;
}

function valueText(value: number | undefined): string {
  return value === undefined ? '—' : formatChartNumber(value);
}
</script>

<template>
  <div class="space-y-3" data-test="chart-pyramid">
    <div
      class="text-text-muted grid grid-cols-[minmax(0,1fr)_minmax(4.5rem,auto)_minmax(0,1fr)] gap-2 text-xs font-medium sm:gap-3"
      aria-hidden="true"
    >
      <span class="text-right">Laki-laki</span>
      <span />
      <span>Perempuan</span>
    </div>

    <div
      v-for="group in groups"
      :key="group.id"
      class="grid grid-cols-[minmax(0,1fr)_minmax(4.5rem,auto)_minmax(0,1fr)] items-center gap-2 sm:gap-3"
      data-test="pyramid-row"
    >
      <div class="flex min-w-0 items-center justify-end gap-2" data-test="pyramid-male">
        <span class="text-brand-navy shrink-0 text-xs font-bold tabular-nums">
          {{ valueText(valueOf(group, 'male')) }}
        </span>
        <div class="flex min-w-0 flex-1 justify-end">
          <div
            v-if="valueOf(group, 'male') !== undefined"
            class="bg-brand-navy h-5"
            :style="{ width: barWidth(valueOf(group, 'male')!) }"
          />
        </div>
      </div>

      <span class="text-brand-navy text-center text-xs leading-4 font-medium break-words">
        {{ group.label }}
      </span>

      <div class="flex min-w-0 items-center gap-2" data-test="pyramid-female">
        <div class="flex min-w-0 flex-1 justify-start">
          <div
            v-if="valueOf(group, 'female') !== undefined"
            class="chart-hatch border-brand-navy h-5 border"
            :style="{ width: barWidth(valueOf(group, 'female')!) }"
          />
        </div>
        <span class="text-brand-navy shrink-0 text-xs font-bold tabular-nums">
          {{ valueText(valueOf(group, 'female')) }}
        </span>
      </div>
    </div>
  </div>
</template>
