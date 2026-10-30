<script setup lang="ts">
import { RouterLink } from 'vue-router';

withDefaults(
  defineProps<{
    label: string;
    /** Parent crumb label. Defaults to the Tentang hub. */
    parentLabel?: string;
    parentTo?: string;
  }>(),
  { parentLabel: 'Tentang', parentTo: '/tentang' },
);
</script>

<template>
  <nav aria-label="Breadcrumb" class="border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
    <ol class="mx-auto flex max-w-5xl items-center gap-2 text-base">
      <li>
        <RouterLink
          :to="parentTo"
          class="text-brand-navy focus-visible:outline-brand-navy font-medium hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {{ parentLabel }}
        </RouterLink>
      </li>
      <li aria-hidden="true" class="text-gray-400">&gt;</li>
      <li>
        <span class="text-gray-700" aria-current="page">{{ label }}</span>
      </li>
    </ol>
  </nav>
</template>
