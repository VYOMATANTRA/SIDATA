<script setup lang="ts">
import { useId } from 'vue';
import TentangIcon, { type TentangIconName } from './TentangIcon.vue';

withDefaults(
  defineProps<{
    heading: string;
    icon?: TentangIconName;
  }>(),
  { icon: 'info' },
);

const headingId = useId();
</script>

<template>
  <section
    class="border-brand-navy/20 bg-brand-cyan/20 border-y px-4 py-5 sm:px-6"
    :aria-labelledby="headingId"
  >
    <div class="mx-auto flex max-w-5xl items-start gap-3">
      <span
        class="bg-brand-navy flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
        aria-hidden="true"
      >
        <TentangIcon :name="icon" />
      </span>

      <div class="text-brand-navy text-base leading-relaxed">
        <h2 :id="headingId" class="font-bold">{{ heading }}</h2>
        <div class="mt-1 space-y-2">
          <slot />
        </div>
      </div>
    </div>
  </section>
</template>
