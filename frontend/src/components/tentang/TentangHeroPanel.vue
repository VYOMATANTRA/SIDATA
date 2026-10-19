<script setup lang="ts">
import { useId } from 'vue';

withDefaults(defineProps<{ title: string; subtitle: string }>(), {});

const titleId = useId();
</script>

<template>
  <section class="bg-brand-navy px-4 py-10 sm:px-6 sm:py-12" :aria-labelledby="titleId">
    <div class="mx-auto max-w-5xl">
      <h1 :id="titleId" class="text-lg sm:text-xl font-bold tracking-tight text-white">{{ title }}</h1>
      <p class="mt-3 max-w-3xl text-base leading-relaxed text-white/90">{{ subtitle }}</p>

      <div v-if="$slots.figure" class="mt-6">
        <slot name="figure" />
      </div>
    </div>
  </section>
</template>
