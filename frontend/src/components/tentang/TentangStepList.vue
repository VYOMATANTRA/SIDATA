<script setup lang="ts">
export interface StepItem {
  step: number;
  title: string;
  description: string;
  details: string[];
}

withDefaults(defineProps<{ steps: StepItem[] }>(), { steps: () => [] });
</script>

<template>
  <ol class="divide-y divide-gray-200" data-test="procedure-steps">
    <li
      v-for="item in steps"
      :key="item.step"
      class="procedure-step flex gap-4 py-6 first:pt-0 last:pb-0"
    >
      <span
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-navy text-base font-bold text-white"
        aria-hidden="true"
      >
        {{ item.step }}
      </span>

      <div>
        <h3 class="text-base font-bold text-brand-navy">{{ item.title }}</h3>
        <p class="mt-1 text-base leading-relaxed text-gray-800">{{ item.description }}</p>
        <ul class="mt-2 list-disc space-y-1 pl-5 text-base text-gray-700">
          <li v-for="(detail, index) in item.details" :key="index">{{ detail }}</li>
        </ul>
      </div>
    </li>
  </ol>
</template>
