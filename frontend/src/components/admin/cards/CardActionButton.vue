<script setup lang="ts">
import type { Component } from 'vue';
import BaseButton from '../../common/BaseButton.vue';

/**
 * A per-item action on an admin card (Cerita pages now, Publikasi items next): an outlined small
 * button with a decorative icon before its visible label. The accessible name is the visible label
 * followed by `srText` (the item's title, so every card's "Edit" is distinct), which keeps the
 * visible text at the start of the name (WCAG 2.5.3). The icon is hidden from assistive tech.
 */
defineProps<{
  /** Heroicons 24/outline component, drawn at 1rem before the label. */
  icon: Component;
  /** Visible label, e.g. "Edit", "Hapus". */
  label: string;
  /** Spoken after the label, e.g. "halaman Kependudukan". */
  srText: string;
  disabled?: boolean;
  /** Keeps the id so a focus handover can find the button after a move or a delete. */
  id?: string;
  dataTest?: string;
}>();

defineEmits<{ (e: 'click'): void }>();
</script>

<template>
  <BaseButton
    :id="id"
    type="button"
    variant="secondary"
    size="md"
    class="min-h-11"
    :disabled="disabled"
    :data-test="dataTest"
    @click="$emit('click')"
  >
    <template #leftIcon>
      <component :is="icon" class="h-4 w-4" aria-hidden="true" />
    </template>
    {{ label }} <span class="sr-only">{{ srText }}</span>
  </BaseButton>
</template>
