<script setup lang="ts">
import { computed } from 'vue';

export interface BarDiagramItem {
  label: string;
  value: number;
  formattedValue?: string;
  color?: string;
}

export interface BarDiagramProps {
  /** Diagram title displayed in the header */
  title: string;
  /** List of data items to render as horizontal bars */
  items: BarDiagramItem[];
  /** Optional unit suffix (e.g. 'jiwa', 'orang', '%') */
  unit?: string;
  /** Optional explicit maximum scale. If omitted, max is auto-computed from items */
  max?: number;
  /** Whether to format numeric values with localized thousands separators (default: true) */
  formatNumbers?: boolean;
  /** Whether to display the value labels on the right (default: true) */
  showValues?: boolean;
  /** Track background color class or hex (default: 'bg-[#ecf6f9]') */
  trackColorClass?: string;
  /** Default bar fill color class (default: 'bg-brand-navy') */
  barColorClass?: string;
  /** Optional loading skeleton state */
  loading?: boolean;
  /** Message displayed when items array is empty */
  emptyText?: string;
}

const props = withDefaults(defineProps<BarDiagramProps>(), {
  unit: '',
  formatNumbers: true,
  showValues: true,
  trackColorClass: 'bg-[#ecf6f9]',
  barColorClass: 'bg-brand-navy',
  loading: false,
  emptyText: 'Belum ada data diagram untuk ditampilkan.',
});

/**
 * Compute the maximum value for relative scaling.
 * Defaults to props.max if provided, otherwise the highest value among items.
 * Ensures minimum max is at least 1 to prevent division by zero.
 */
const effectiveMax = computed(() => {
  if (typeof props.max === 'number' && props.max > 0) {
    return props.max;
  }
  const highest = Math.max(...props.items.map((item) => item.value), 0);
  return highest > 0 ? highest : 1;
});

/**
 * Format a number using Indonesian locale thousands separators (e.g., 1000 -> 1.000).
 */
function formatNumber(val: number): string {
  if (!props.formatNumbers) {
    return String(val);
  }
  return new Intl.NumberFormat('id-ID').format(val);
}

/**
 * Get display string for an item's value.
 */
function getDisplayValue(item: BarDiagramItem): string {
  if (item.formattedValue) {
    return item.formattedValue;
  }
  const formatted = formatNumber(item.value);
  return props.unit ? `${formatted} ${props.unit}` : formatted;
}

/**
 * Calculate bar percentage width relative to effective max scale (0% - 100%).
 */
function getPercentage(value: number): number {
  if (value <= 0 || effectiveMax.value <= 0) {
    return 0;
  }
  const pct = (value / effectiveMax.value) * 100;
  return Math.min(100, Math.max(0, Math.round(pct * 10) / 10));
}
</script>

<template>
  <div
    class="rounded-card border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs transition-shadow"
    data-test="bar-diagram-card"
  >
    <!-- Header: Icon & Diagram Title -->
    <div class="mb-5 flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
      <div class="flex items-center gap-3 min-w-0">
        <!-- Default Report/Chart Icon or Slot -->
        <slot name="icon">
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-btn bg-brand-navy/5 text-brand-navy"
            aria-hidden="true"
          >
            <svg
              class="h-6 w-6 text-brand-navy"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <!-- L-shaped document/chart frame -->
              <path d="M4 4v14a2 2 0 0 0 2 2h14" />
              <!-- Top short bar -->
              <path d="M7 6h3" />
              <!-- Middle long bar -->
              <path d="M7 11h11" />
              <!-- Bottom medium bar -->
              <path d="M7 16h8" />
            </svg>
          </div>
        </slot>

        <!-- Diagram Title -->
        <h3
          class="text-base font-bold tracking-tight text-slate-900 sm:text-lg min-w-0 truncate"
          data-test="diagram-title"
        >
          {{ title }}
        </h3>
      </div>

      <!-- Optional Extra Header Slot (e.g. Filters, Badges) -->
      <slot name="header-extra" />
    </div>

    <!-- Loading Skeleton State -->
    <div v-if="loading" class="space-y-4 py-2" data-test="loading-skeleton">
      <div v-for="n in 4" :key="n" class="space-y-2 animate-pulse">
        <div class="flex justify-between">
          <div class="h-4 w-28 rounded-md bg-slate-200" />
          <div class="h-4 w-10 rounded-md bg-slate-200" />
        </div>
        <div class="h-3.5 w-full rounded-full bg-slate-100" />
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="items.length === 0"
      class="py-8 text-center text-xs text-slate-500 sm:text-sm"
      data-test="empty-state"
    >
      <slot name="empty">
        <p>{{ emptyText }}</p>
      </slot>
    </div>

    <!-- Data Bars List -->
    <div v-else class="space-y-4 sm:space-y-5" data-test="bars-container">
      <div
        v-for="(item, index) in items"
        :key="item.label || index"
        class="space-y-1.5"
        data-test="bar-item"
      >
        <!-- Label & Value Header -->
        <div class="flex items-center justify-between text-xs sm:text-sm">
          <span
            class="font-medium text-brand-navy min-w-0 truncate pr-2"
            data-test="bar-label"
          >
            {{ item.label }}
          </span>
          <span
            v-if="showValues"
            class="shrink-0 font-bold text-brand-navy tabular-nums"
            data-test="bar-value"
          >
            {{ getDisplayValue(item) }}
          </span>
        </div>

        <!-- Pill Progress Bar Track -->
        <div
          class="relative h-3.5 sm:h-4 w-full overflow-hidden rounded-full transition-colors"
          :class="trackColorClass"
          role="progressbar"
          :aria-valuenow="item.value"
          :aria-valuemin="0"
          :aria-valuemax="effectiveMax"
          :aria-label="`${item.label}: ${getDisplayValue(item)}`"
        >
          <!-- Dynamic Filled Bar -->
          <div
            class="h-full rounded-full transition-all duration-500 ease-out"
            :class="item.color || barColorClass"
            :style="{ width: `${getPercentage(item.value)}%` }"
            data-test="bar-fill"
          />
        </div>
      </div>
    </div>
  </div>
</template>
