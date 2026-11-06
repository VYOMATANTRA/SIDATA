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
  <article class="rounded-btn bg-brand-cyan flex h-full w-full flex-col p-5">
    <span
      class="bg-brand-navy flex h-12 w-12 items-center justify-center rounded-full text-white"
      aria-hidden="true"
    >
      <TentangIcon :name="icon" />
    </span>

    <h3 class="text-brand-navy mt-4 text-lg font-semibold">{{ title }}</h3>
    <p class="text-brand-navy/90 mt-2 text-base leading-relaxed">{{ description }}</p>
  </article>
</template>
