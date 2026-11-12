<script setup lang="ts">
import { computed } from 'vue';
import type { IndicatorDto } from '../../stores/indicators.store';
import { buildIndicatorNarrative, formatIndicatorValue } from '../../utils/comparisonFraming';

export interface IndicatorStatProps {
  indicator: IndicatorDto;
}

const props = defineProps<IndicatorStatProps>();

const narrative = computed(() => buildIndicatorNarrative(props.indicator));
const displayValue = computed(() => formatIndicatorValue(props.indicator.valueCurrent));
</script>

<template>
  <div
    class="rounded-card border border-border bg-white p-5 shadow-xs sm:p-6"
    data-test="indicator-stat"
  >
    <dl>
      <dt class="text-sm font-medium text-text-muted">{{ indicator.label }}</dt>
      <dd class="text-brand-navy mt-1 text-xl leading-tight font-bold tracking-tight sm:text-2xl">
        {{ displayValue
        }}<span v-if="indicator.unit" class="ml-1 text-sm font-normal text-text-muted">{{
          indicator.unit
        }}</span>
      </dd>
    </dl>

    <p class="mt-3 text-sm leading-relaxed text-text-muted" data-test="indicator-narrative">
      {{ narrative.text }}
    </p>

    <div
      v-if="narrative.isStale"
      class="mt-3 inline-flex items-center gap-1.5 rounded-full bg-status-warning-surface px-2.5 py-1 text-sm font-medium text-status-warning"
      data-test="indicator-stale-badge"
    >
      Data berumur
    </div>

    <p v-if="indicator.source" class="mt-3 text-sm text-text-muted" data-test="indicator-source">
      Sumber: {{ indicator.source }}
    </p>
  </div>
</template>
