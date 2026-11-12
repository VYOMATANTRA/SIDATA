<script setup lang="ts">
import BaseButton from '../../common/BaseButton.vue';

/**
 * Move up / move down / remove buttons for one row of a repeatable list. Reordering is always
 * done with these buttons (never drag-only). Each visible word ("Naik", "Turun", "Hapus") is
 * followed by a screen-reader-only row label ("poin 2"), so the accessible name still starts with
 * the visible text (WCAG 2.5.3) yet a screen reader does not hear three identical buttons.
 */
defineProps<{
  /** Row noun and number for accessible names, e.g. "poin 2". */
  rowLabel: string;
  isFirst: boolean;
  isLast: boolean;
  busy?: boolean;
  /** Ids so the list can hand keyboard focus back after a move. */
  moveUpId: string;
  moveDownId: string;
  removeId: string;
}>();

const emit = defineEmits<{
  (e: 'move-up'): void;
  (e: 'move-down'): void;
  (e: 'remove'): void;
}>();
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <BaseButton
      :id="moveUpId"
      type="button"
      variant="secondary"
      size="sm"
      class="min-h-11"
      :disabled="busy || isFirst"
      @click="emit('move-up')"
    >
      Naik <span class="sr-only">{{ rowLabel }}</span>
    </BaseButton>
    <BaseButton
      :id="moveDownId"
      type="button"
      variant="secondary"
      size="sm"
      class="min-h-11"
      :disabled="busy || isLast"
      @click="emit('move-down')"
    >
      Turun <span class="sr-only">{{ rowLabel }}</span>
    </BaseButton>
    <BaseButton
      :id="removeId"
      type="button"
      variant="secondary"
      size="sm"
      class="min-h-11"
      :disabled="busy"
      @click="emit('remove')"
    >
      Hapus <span class="sr-only">{{ rowLabel }}</span>
    </BaseButton>
  </div>
</template>
