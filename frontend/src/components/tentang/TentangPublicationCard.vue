<script setup lang="ts">
import TentangIcon from './TentangIcon.vue';

withDefaults(
  defineProps<{
    title: string;
    description: string;
    ctaLabel: string;
    icon?: string;
  }>(),
  { icon: 'document' },
);
</script>

<template>
  <div class="flex flex-col gap-4 rounded-btn bg-brand-cyan p-5 sm:flex-row sm:items-center">
    <span
      class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-navy text-white"
      aria-hidden="true"
    >
      <TentangIcon :name="icon" />
    </span>

    <div class="flex-1">
      <h3 class="text-lg font-semibold text-brand-navy">{{ title }}</h3>
      <p class="mt-1 text-base text-brand-navy/90">{{ description }}</p>
    </div>

    <!-- TODO: ganti dengan BaseLink ke /publikasi setelah halaman publikasi tersedia -->
    <button
      type="button"
      disabled
      aria-disabled="true"
      class="inline-flex cursor-not-allowed items-center gap-2 rounded-[5px] bg-brand-navy px-4 py-2 text-base font-medium text-white"
    >
      {{ ctaLabel }}
      <span aria-hidden="true">&rarr;</span>
    </button>
    <span class="sr-only">(tautan belum tersedia)</span>
  </div>
</template>
