<script setup lang="ts">
import { computed, useId } from 'vue';
import { REORDER_HELP } from '../../../composables/useKeyboardReorder';

/**
 * The grip of a reorderable row, operable by pointer and by keyboard. The grip is a real button:
 * Space or Enter picks the row up, the arrow keys move it, Space or Enter drops it and Escape
 * cancels (`useKeyboardReorder`). Pointer drag starts on the wrapper, as it always did
 * (`useCardDragReorder`). `carried` mirrors the keyboard pick-up as `aria-pressed`.
 */
const props = defineProps<{
  id: string;
  /** Accessible name, e.g. "Pindahkan bagian 1.2: Judul". */
  label: string;
  /** Text put in the drag data; Firefox starts a drag only when some data is set. */
  dataText: string;
  /** Disabled while a save runs (no pick-up and no drag). */
  disabled?: boolean;
  /** Picked up with the keyboard right now. */
  carried?: boolean;
}>();

const emit = defineEmits<{
  (e: 'drag-start'): void;
  (e: 'drag-end'): void;
  (e: 'keydown', event: KeyboardEvent): void;
  (e: 'blur', event: FocusEvent): void;
}>();

const helpId = `${useId()}-kb-bantuan`;

const title = computed(() =>
  props.disabled
    ? 'Urutan sedang disimpan.'
    : 'Seret untuk mengubah urutan, atau pilih dengan Spasi lalu gunakan panah.',
);

function onDragStart(event: DragEvent): void {
  event.dataTransfer?.setData('text/plain', props.dataText);
  event.dataTransfer?.setDragImage?.(event.target as Element, 24, 24);
  emit('drag-start');
}
</script>

<template>
  <span
    :draggable="disabled ? 'false' : 'true'"
    class="bg-surface-muted border-border flex w-8 shrink-0 items-stretch justify-center border-r"
    :class="disabled ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'"
    data-test="grip-wrap"
    @dragstart="onDragStart"
    @dragend="emit('drag-end')"
  >
    <button
      :id="id"
      type="button"
      class="text-text-muted hover:text-brand-navy focus-visible:outline-focus-ring flex w-full items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-[-2px] disabled:cursor-not-allowed disabled:opacity-50"
      :class="carried ? 'bg-brand-navy text-white hover:text-white' : ''"
      :aria-label="label"
      :aria-describedby="helpId"
      :aria-pressed="carried ? 'true' : 'false'"
      :disabled="disabled"
      :title="title"
      data-test="grip"
      @keydown="emit('keydown', $event)"
      @blur="emit('blur', $event)"
    >
      <span :id="helpId" class="sr-only">{{ REORDER_HELP }}</span>
      <svg viewBox="0 0 12 18" class="h-4 w-3" focusable="false" aria-hidden="true">
        <circle cx="3" cy="3" r="1.5" fill="currentColor" />
        <circle cx="9" cy="3" r="1.5" fill="currentColor" />
        <circle cx="3" cy="9" r="1.5" fill="currentColor" />
        <circle cx="9" cy="9" r="1.5" fill="currentColor" />
        <circle cx="3" cy="15" r="1.5" fill="currentColor" />
        <circle cx="9" cy="15" r="1.5" fill="currentColor" />
      </svg>
    </button>
  </span>
</template>
