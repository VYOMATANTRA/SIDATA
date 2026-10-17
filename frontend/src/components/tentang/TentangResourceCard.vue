<script setup lang="ts">
import TentangIcon, { type TentangIconName } from './TentangIcon.vue';

withDefaults(
  defineProps<{
    title: string;
    icon?: TentangIconName;
    /** Label of the trailing pill. When present the pill renders as a placeholder. */
    ctaLabel?: string;
  }>(),
  { icon: 'system', ctaLabel: undefined },
);
</script>

<template>
  <article class="flex h-full flex-col rounded-btn bg-brand-navy-deep p-5">
    <div class="flex items-center gap-3">
      <span
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-indigo text-white"
        aria-hidden="true"
      >
        <TentangIcon :name="icon" />
      </span>
      <h3 class="text-base font-bold text-white">{{ title }}</h3>
    </div>

    <div class="mt-3 flex-1 text-base leading-relaxed text-white">
      <slot />
    </div>

    <div v-if="ctaLabel" class="mt-4 border-t border-white/70 pt-4">
      <!-- TODO: ganti dengan BaseLink saat halaman Publikasi/Peta tersedia -->
      <span
        class="inline-flex items-center gap-2 rounded-[5px] bg-brand-cyan px-4 py-1.5 text-base text-brand-navy"
      >
        {{ ctaLabel }}
        <span aria-hidden="true">&rarr;</span>
      </span>
      <span class="sr-only">(tautan belum tersedia)</span>
    </div>
  </article>
</template>
