<script setup lang="ts">
import { MagnifyingGlassIcon } from '@heroicons/vue/24/outline';

/**
 * The search box of a card list: a visible-on-focus label (screen-reader only, the placeholder shows
 * the same words), a decorative magnifier, and a full-width control on phones.
 */
defineProps<{
  id: string;
  modelValue: string;
  label: string;
  placeholder: string;
  dataTest?: string;
}>();

defineEmits<{ (e: 'update:modelValue', value: string): void }>();
</script>

<template>
  <div class="relative w-full md:w-auto">
    <label :for="id" class="sr-only">{{ label }}</label>
    <MagnifyingGlassIcon
      class="text-text-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
      aria-hidden="true"
      data-test="search-icon"
    />
    <input
      :id="id"
      :value="modelValue"
      type="search"
      :placeholder="placeholder"
      autocomplete="off"
      class="rounded-btn border-border-strong text-brand-navy placeholder:text-text-muted focus-visible:outline-focus-ring min-h-11 w-full border bg-surface py-2 pr-3 pl-9 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 md:w-56"
      :data-test="dataTest ?? 'search'"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </div>
</template>
