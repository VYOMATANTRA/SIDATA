<script setup lang="ts">
import { useId } from 'vue';
import TentangIcon from './TentangIcon.vue';

withDefaults(
  defineProps<{
    heading: string;
    icon?: string;
    /** Optional short pill rendered next to the heading (e.g. a step number) */
    badge?: string;
  }>(),
  { icon: 'info', badge: undefined },
);

const headingId = useId();
</script>

<template>
  <section class="rounded-btn border border-gray-400 bg-white p-5" :aria-labelledby="headingId">
    <div class="flex flex-wrap items-center gap-3">
      <span
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-indigo text-white"
        aria-hidden="true"
      >
        <TentangIcon :name="icon" />
      </span>
      <h2 :id="headingId" class="text-base font-bold text-brand-navy">{{ heading }}</h2>
      <span
        v-if="badge"
        class="rounded-[5px] bg-brand-cyan px-2 py-0.5 text-sm font-medium text-brand-navy"
      >
        {{ badge }}
      </span>
    </div>

    <div class="mt-3 space-y-3 text-base leading-relaxed text-gray-800">
      <slot />
    </div>
  </section>
</template>
