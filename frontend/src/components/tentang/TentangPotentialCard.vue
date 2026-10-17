<script setup lang="ts">
import TentangIcon, { type TentangIconName } from './TentangIcon.vue';

withDefaults(
  defineProps<{
    title: string;
    description: string;
    icon?: TentangIconName;
  }>(),
  { icon: 'chart' },
);
</script>

<template>
  <article class="flex h-full w-full flex-col rounded-btn bg-brand-cyan p-5">
    <span
      class="flex h-12 w-12 items-center justify-center rounded-full bg-brand-navy text-white"
      aria-hidden="true"
    >
      <TentangIcon :name="icon" />
    </span>

    <h3 class="mt-4 text-lg font-semibold text-brand-navy">{{ title }}</h3>
    <p class="mt-2 text-base leading-relaxed text-brand-navy/90">{{ description }}</p>
  </article>
</template>
