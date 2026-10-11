<script setup lang="ts">
import { useId } from 'vue';
import TentangIcon from './TentangIcon.vue';

withDefaults(
  defineProps<{
    heading: string;
    icon?: string;
  }>(),
  { icon: 'info' },
);

const headingId = useId();
</script>

<template>
  <section
    class="border-y border-brand-navy/20 bg-brand-cyan/20 px-4 py-5 sm:px-6"
    :aria-labelledby="headingId"
  >
    <div class="mx-auto flex max-w-5xl items-start gap-3">
      <span
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-navy text-white"
        aria-hidden="true"
      >
        <TentangIcon :name="icon" />
      </span>

      <div class="text-base leading-relaxed text-brand-navy">
        <h2 :id="headingId" class="font-bold">{{ heading }}</h2>
        <div class="mt-1 space-y-2">
          <slot />
        </div>
      </div>
    </div>
  </section>
</template>
