<script setup lang="ts">
import { computed } from 'vue';

export interface StatItem {
  /** Identifier or built-in icon name ('person' | 'house' | 'density' | 'ratio') */
  icon?: 'person' | 'house' | 'density' | 'ratio' | string;
  /** Primary numeric or text figure (e.g. '53.098', 100, '2 jiwa/km²', '1,06 : 1') */
  value: string | number;
  /** Label description below the figure (e.g. 'Penduduk', 'Rukun Tetangga') */
  label: string;
  /** Optional secondary unit or suffix if value is raw number */
  unit?: string;
  /** Optional aria-label override for screen readers */
  ariaLabel?: string;
}

export interface StatCardProps {
  /** List of statistics to display in the card. If omitted, default Manggar stats are shown */
  items?: StatItem[];
  /** Single item shorthand: figure value */
  value?: string | number;
  /** Single item shorthand: description label */
  label?: string;
  /** Single item shorthand: icon name */
  icon?: 'person' | 'house' | 'density' | 'ratio' | string;
  /** Visual variant: 'dark' (Figma default charcoal) | 'glass' | 'navy' | 'light' */
  variant?: 'dark' | 'glass' | 'navy' | 'light';
  /** Optional title or section heading for the card landmark */
  title?: string;
  /** Optional custom card classes */
  cardClass?: string;
}

const props = withDefaults(defineProps<StatCardProps>(), {
  variant: 'dark',
  title: 'Statistik Wilayah Kelurahan Manggar',
});

// Default 4 Key Statistics matching Figma design for Kelurahan Manggar
const defaultStats: StatItem[] = [
  {
    icon: 'person',
    value: '53.098',
    label: 'Penduduk',
  },
  {
    icon: 'house',
    value: '100',
    label: 'Rukun Tetangga',
  },
  {
    icon: 'density',
    value: '2 jiwa/km²',
    label: 'Kepadatan Penduduk',
  },
  {
    icon: 'ratio',
    value: '1,06 : 1',
    label: 'Rasio Laki-laki & Perempuan',
  },
];

// Computed list of items (supports both array prop or single-item shorthand)
const displayedItems = computed<StatItem[]>(() => {
  if (props.items !== undefined) {
    return props.items;
  }
  if (props.value !== undefined && props.label !== undefined) {
    return [
      {
        icon: props.icon,
        value: props.value,
        label: props.label,
      },
    ];
  }
  return defaultStats;
});

// Variant styling classes
const variantClasses = computed(() => {
  switch (props.variant) {
    case 'glass':
      return 'bg-surface-glass backdrop-blur-md border border-white/20 text-white shadow-lg';
    case 'navy':
      return 'bg-brand-navy border border-white/10 text-white shadow-md';
    case 'light':
      return 'bg-white border border-slate-200/90 text-slate-900 shadow-xs';
    case 'dark':
    default:
      // Exact Figma dark card matching screenshot
      return 'bg-[#232528] border border-white/5 text-white shadow-xl';
  }
});
</script>

<template>
  <div
    class="w-full rounded-2xl p-6 transition-all sm:px-8 sm:py-7"
    :class="[variantClasses, cardClass]"
    data-test="stat-card"
    role="region"
    :aria-label="title"
  >
    <!-- Screen-reader-only heading for accessibility conformance (WCAG 2.1 Level A) -->
    <h2 class="sr-only">{{ title }}</h2>

    <!--
      Semantic Description List (<dl>) adhering to docs/UI_STYLE_GUIDE.md & docs/ACCESSIBILITY.md
      Layout: Flexbox with justify-center and equal gaps, ensuring stats are always centered with equal spacing regardless of count.
    -->
    <dl
      v-if="displayedItems.length > 0"
      class="flex flex-wrap items-start justify-center gap-x-6 gap-y-6 text-center sm:gap-x-10 md:gap-x-14"
      data-test="stat-list"
    >
      <div
        v-for="(item, idx) in displayedItems"
        :key="idx"
        class="flex max-w-[170px] min-w-[120px] flex-col items-center text-center"
        data-test="stat-item"
      >
        <!-- Icon Container -->
        <div
          class="mb-3 flex h-10 w-10 items-center justify-center sm:h-12 sm:w-12"
          aria-hidden="true"
          data-test="stat-icon-wrapper"
        >
          <slot name="icon" :item="item" :index="idx">
            <!-- 1. Person / Penduduk Icon -->
            <svg
              v-if="item.icon === 'person'"
              class="h-8 w-8 sm:h-9 sm:w-9"
              :class="variant === 'light' ? 'text-brand-navy' : 'text-white'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="7" r="4" />
              <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
            </svg>

            <!-- 2. House / RT Icon -->
            <svg
              v-else-if="item.icon === 'house'"
              class="h-8 w-8 sm:h-9 sm:w-9"
              :class="variant === 'light' ? 'text-brand-navy' : 'text-white'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M3 10.5L12 3l9 7.5v9a2 2 0 0 1-2 2h-4v-6a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v6H5a2 2 0 0 1-2-2v-9z"
              />
            </svg>

            <!-- 3. Density / Map Flag Icon -->
            <svg
              v-else-if="item.icon === 'density'"
              class="h-8 w-8 sm:h-9 sm:w-9"
              :class="variant === 'light' ? 'text-brand-navy' : 'text-white'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <!-- 3D Perspective Base Grid -->
              <path d="M12 11l8 4.5-8 4.5-8-4.5 8-4.5z" />
              <path d="M12 15.5l-4-2.25" />
              <path d="M12 15.5l4-2.25" />
              <!-- Center Flagpole & Flag -->
              <path d="M12 11V3" />
              <path d="M12 3l6 3-6 3" />
            </svg>

            <!-- 4. Ratio / Pie Chart Icon -->
            <svg
              v-else-if="item.icon === 'ratio'"
              class="h-8 w-8 sm:h-9 sm:w-9"
              :class="variant === 'light' ? 'text-brand-navy' : 'text-white'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
              <path d="M22 12A10 10 0 0 0 12 2v10z" />
            </svg>

            <!-- Fallback Default Icon -->
            <svg
              v-else
              class="h-8 w-8 sm:h-9 sm:w-9"
              :class="variant === 'light' ? 'text-brand-navy' : 'text-white'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v8" />
              <path d="M8 12h8" />
            </svg>
          </slot>
        </div>

        <!-- Description Term (<dt>): Stat Label Description (precedes <dd> in DOM for screen readers) -->
        <dt
          class="order-2 mt-1.5 max-w-[140px] text-xs leading-snug whitespace-pre-line sm:text-sm"
          :class="variant === 'light' ? 'font-medium text-slate-600' : 'font-normal text-slate-200'"
          data-test="stat-label"
        >
          {{ item.label }}
        </dt>

        <!-- Description Details (<dd>): Numeric Stat Value -->
        <dd
          class="order-1 min-w-0 text-xl leading-tight font-bold tracking-tight sm:text-2xl"
          :class="variant === 'light' ? 'text-brand-navy' : 'text-white'"
          data-test="stat-value"
        >
          {{ item.value
          }}<span v-if="item.unit" class="ml-1 text-sm font-normal">{{ item.unit }}</span>
        </dd>
      </div>
    </dl>
    <div
      v-else
      class="flex flex-col items-center justify-center py-6 text-center"
      data-test="stat-empty"
    >
      <slot name="empty">
        <p
          class="text-sm italic"
          :class="variant === 'light' ? 'text-slate-500' : 'text-slate-400'"
        >
          Tidak ada data statistik yang ditampilkan.
        </p>
      </slot>
    </div>
  </div>
</template>
