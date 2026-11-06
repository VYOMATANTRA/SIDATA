<script setup lang="ts">
import { useId } from 'vue';

withDefaults(defineProps<{ heading?: string }>(), { heading: undefined });

const headingId = useId();
</script>

<template>
  <section
    class="bg-brand-cyan px-4 py-8 sm:px-6 sm:py-10"
    :aria-labelledby="heading ? headingId : undefined"
  >
    <div class="mx-auto max-w-5xl">
      <h2 v-if="heading" :id="headingId" class="text-lg font-bold text-brand-navy">
        {{ heading }}
      </h2>
      <slot />
    </div>
  </section>
</template>
