<script setup lang="ts">
import { useId } from 'vue';

withDefaults(
  defineProps<{
    eyebrow: string;
    title: string;
    subtitle: string;
    image: string;
  }>(),
  {},
);

const titleId = useId();
</script>

<template>
  <section class="relative isolate overflow-hidden" :aria-labelledby="titleId">
    <img :src="image" alt="" class="absolute inset-0 h-full w-full object-cover" />
    <div class="absolute inset-0 bg-brand-navy/75" aria-hidden="true" />

    <div class="relative px-4 pt-32 pb-28 sm:px-6 sm:pt-40 sm:pb-36">
      <div class="mx-auto max-w-5xl">
        <p class="text-base font-medium tracking-[0.2em] text-brand-cyan uppercase">{{ eyebrow }}</p>
        <h1 :id="titleId" class="mt-3 text-xl text-white">{{ title }}</h1>
        <p class="mt-4 max-w-xl text-base leading-relaxed text-white/90">{{ subtitle }}</p>
      </div>
    </div>

    <!-- Violet wave divider taken from the Figma frame -->
    <div class="pointer-events-none absolute inset-x-0 bottom-0" aria-hidden="true">
      <svg viewBox="0 0 1440 120" preserveAspectRatio="none" class="h-16 w-full sm:h-24">
        <path
          class="text-brand-violet"
          d="M0 64C240 120 480 8 720 56 960 104 1200 32 1440 72V120H0Z"
          fill="currentColor"
          fill-opacity="0.9"
        />
      </svg>
    </div>
  </section>
</template>
