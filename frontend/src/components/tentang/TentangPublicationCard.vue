<script setup lang="ts">
import TentangIcon, { type TentangIconName } from './TentangIcon.vue';

withDefaults(
  defineProps<{
    title: string;
    description: string;
    ctaLabel?: string;
    icon?: TentangIconName;
  }>(),
  { ctaLabel: 'Segera Hadir', icon: 'document' },
);
</script>

<template>
  <div class="flex flex-col gap-4 rounded-btn border border-border bg-white p-5 sm:flex-row sm:items-center">
    <span
      class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-surface-muted text-brand-navy"
      aria-hidden="true"
    >
      <TentangIcon :name="icon" />
    </span>

    <div class="flex-1">
      <h3 class="text-lg font-semibold text-brand-navy">{{ title }}</h3>
      <p class="mt-1 text-base text-brand-navy">{{ description }}</p>
    </div>

    <span
      class="inline-flex self-start items-center rounded-[5px] bg-brand-navy px-3 py-1.5 text-sm font-medium text-white sm:self-center"
      data-test="publication-badge"
    >
      {{ ctaLabel }}
    </span>
  </div>
</template>
