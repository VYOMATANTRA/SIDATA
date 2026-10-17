<script setup lang="ts">
import { useId } from 'vue';

withDefaults(
  defineProps<{
    label: string;
    value: string;
    unit: string;
    caption: string;
    subcaption?: string;
    hedgeNote?: string | null;
  }>(),
  {},
);

const labelId = useId();
</script>

<template>
  <section class="bg-white px-4 py-10 sm:px-6 sm:py-12" :aria-labelledby="labelId">
    <div class="mx-auto max-w-5xl">
      <p :id="labelId" class="text-sm font-semibold tracking-[0.25em] text-brand-navy uppercase">
        {{ label }}
      </p>
      <p class="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span class="text-xl font-bold text-brand-navy">{{ value }}</span>
        <span class="text-lg font-semibold text-brand-cyan">{{ unit }}</span>
      </p>
      <p class="mt-2 max-w-2xl text-base text-gray-700">{{ caption }}</p>
      <p v-if="subcaption" class="mt-1 text-sm text-gray-500">{{ subcaption }}</p>
      <p
        v-if="hedgeNote"
        class="mt-3 inline-block rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800"
      >
        {{ hedgeNote }}
      </p>
    </div>
  </section>
</template>
