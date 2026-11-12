<script setup lang="ts">
import { RouterLink } from 'vue-router';

withDefaults(
  defineProps<{
    label: string;
    /** Parent crumb label. Defaults to 'Tentang'. */
    parentLabel?: string;
    /** Parent crumb destination. When omitted, parent is rendered as plain text. */
    parentTo?: string;
  }>(),
  { parentLabel: 'Tentang', parentTo: undefined },
);
</script>

<template>
  <!--
    Navy strip that continues the header and the navy hero panel below it, so no white band
    interrupts the navy region. Long labels wrap instead of overflowing.
  -->
  <nav
    aria-label="Breadcrumb"
    class="bg-brand-navy border-t border-white/15 px-4 py-3 text-white sm:px-6"
  >
    <ol class="mx-auto flex max-w-5xl flex-wrap items-baseline gap-x-2 gap-y-1 text-base">
      <li>
        <RouterLink
          v-if="parentTo"
          :to="parentTo"
          class="focus-visible:outline-focus-ring-inverse rounded-xs font-medium text-white underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {{ parentLabel }}
        </RouterLink>
        <span v-else class="text-text-inverse-muted font-medium">
          {{ parentLabel }}
        </span>
      </li>
      <li aria-hidden="true" class="text-text-inverse-muted">&gt;</li>
      <li class="min-w-0 break-words">
        <span class="text-white" aria-current="page">{{ label }}</span>
      </li>
    </ol>
  </nav>
</template>
