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
  <div class="rounded-btn bg-brand-cyan flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
    <span
      class="bg-brand-navy flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white"
      aria-hidden="true"
    >
      <TentangIcon :name="icon" />
    </span>

    <div class="flex-1">
      <h3 class="text-brand-navy text-lg font-semibold">{{ title }}</h3>
      <p class="text-brand-navy/90 mt-1 text-base">{{ description }}</p>
    </div>

    <span
      class="bg-brand-navy inline-flex items-center self-start rounded-[5px] px-3 py-1.5 text-sm font-medium text-white sm:self-center"
      data-test="publication-badge"
    >
      {{ ctaLabel }}
    </span>
  </div>
</template>
