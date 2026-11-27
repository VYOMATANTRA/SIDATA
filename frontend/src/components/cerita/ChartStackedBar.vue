<script setup lang="ts">
import { computed } from 'vue';
import {
  formatChartNumber,
  rowShares,
  type ChartGroup,
  type ChartValueKey,
} from '../../utils/ceritaChart';

/**
 * Male and female as one horizontal bar per row (SPEC §8).
 *
 * `percent` false (batang bertumpuk): the two sexes sit end to end, so each bar's length is the
 * row's total; all bars share one scale (the longest total). `percent` true (batang persentase):
 * every bar is 100 wide and shows the row's own male and female split.
 *
 * Male is solid, female hatched. Under each bar the values are written out in text, so the
 * reading never depends on colour or length alone.
 */
const props = defineProps<{ groups: readonly ChartGroup[]; percent: boolean }>();

interface Segment {
  key: ChartValueKey;
  label: string;
  value: number;
  /** Relative size inside the bar: the value (stacked) or the share (percent). */
  grow: number;
  percent: number;
}

interface Row {
  id: string;
  label: string;
  /** Width of the whole bar, in percent of the scale. */
  width: number;
  segments: Segment[];
  summary: string;
}

const scale = computed(() => {
  let max = 0;
  for (const group of props.groups) {
    max = Math.max(
      max,
      group.values.reduce((sum, value) => sum + Math.max(0, value.value), 0),
    );
  }
  return max > 0 ? max : 1;
});

const rows = computed<Row[]>(() =>
  props.groups.map((group) => {
    const shares = rowShares(group);
    const total = group.values.reduce((sum, value) => sum + Math.max(0, value.value), 0);
    const segments: Segment[] = shares.map((share) => ({
      key: share.key,
      label: share.label,
      value: share.value,
      grow: props.percent ? share.percent : Math.max(0, share.value),
      percent: share.percent,
    }));
    const summary = props.percent
      ? shares
          .map((share) => `${share.label} ${share.percent}% (${formatChartNumber(share.value)})`)
          .join(' · ')
      : [
          ...shares.map((share) => `${share.label} ${formatChartNumber(share.value)}`),
          ...(shares.length > 1 ? [`Total ${formatChartNumber(total)}`] : []),
        ].join(' · ');
    return {
      id: group.id,
      label: group.label,
      width: props.percent ? 100 : Math.min(100, (total / scale.value) * 100),
      segments,
      summary,
    };
  }),
);

function segmentClass(key: ChartValueKey): string {
  return key === 'female' ? 'chart-hatch' : 'bg-brand-navy';
}

/** Proportional width inside the bar; `flex-basis: 0` makes the grow factors exact. */
function segmentStyle(segment: Segment): Record<string, string> {
  return { flexGrow: String(segment.grow), flexBasis: '0' };
}
</script>

<template>
  <ul class="space-y-4" :data-test="percent ? 'chart-percent' : 'chart-stacked'">
    <li v-for="row in rows" :key="row.id" class="space-y-1" data-test="stacked-row">
      <p class="text-brand-navy text-xs font-medium break-words">{{ row.label }}</p>
      <div class="w-full" aria-hidden="true">
        <div class="flex h-6 gap-px overflow-hidden" :style="{ width: `${row.width}%` }">
          <div
            v-for="segment in row.segments"
            :key="segment.key"
            class="h-full min-w-0"
            :class="segmentClass(segment.key)"
            :style="segmentStyle(segment)"
            :data-test="`stacked-segment-${segment.key}`"
          />
        </div>
      </div>
      <p class="text-text-muted text-xs" data-test="stacked-summary">
        {{ row.summary }}
      </p>
    </li>
  </ul>
</template>
