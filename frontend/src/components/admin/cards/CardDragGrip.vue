<script setup lang="ts">
import { computed } from 'vue';
import type { DragBlock } from '../../../composables/useCardDragReorder';

/**
 * The grip handle of a reorderable card. It can be dragged at any time, except while `blocked` (a
 * search or filter hides part of the order, or a save is running): then it shows a not-allowed
 * cursor and says why in its tooltip. `sortLabel` names the Urutkan mode whose Naik / Turun buttons
 * do the same reorder from the keyboard and on touch.
 */
const props = withDefaults(
  defineProps<{
    blocked?: DragBlock;
    /** Text put in the drag data; Firefox starts a drag only when some data is set. */
    dataText: string;
    /** The card element, used as the drag image. */
    dragImage?: HTMLElement | null;
    sortLabel?: string;
    /** Tooltip while a search or filter blocks the grip. */
    searchTitle?: string;
  }>(),
  {
    blocked: null,
    dragImage: null,
    sortLabel: 'Urutkan',
    searchTitle:
      'Seret dinonaktifkan selama pencarian aktif. Kosongkan kotak pencarian untuk mengubah urutan.',
  },
);

const emit = defineEmits<{
  (e: 'drag-start'): void;
  (e: 'drag-end'): void;
}>();

const title = computed(() => {
  if (props.blocked === 'search') return props.searchTitle;
  if (props.blocked === 'busy') return 'Seret dinonaktifkan sementara urutan sedang disimpan.';
  return `Seret untuk mengubah urutan. Naik dan Turun di ${props.sortLabel} juga bisa dipakai.`;
});

function onDragStart(event: DragEvent): void {
  event.dataTransfer?.setData('text/plain', props.dataText);
  event.dataTransfer?.setDragImage?.(props.dragImage ?? (event.target as Element), 24, 24);
  emit('drag-start');
}
</script>

<template>
  <span
    :draggable="blocked ? 'false' : 'true'"
    aria-hidden="true"
    :title="title"
    class="bg-surface-muted border-border flex w-8 shrink-0 items-center justify-center border-r"
    :class="blocked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'"
    data-test="grip"
    @dragstart="onDragStart"
    @dragend="emit('drag-end')"
  >
    <svg viewBox="0 0 12 18" class="text-text-muted h-4 w-3" focusable="false">
      <circle cx="3" cy="3" r="1.5" fill="currentColor" />
      <circle cx="9" cy="3" r="1.5" fill="currentColor" />
      <circle cx="3" cy="9" r="1.5" fill="currentColor" />
      <circle cx="9" cy="9" r="1.5" fill="currentColor" />
      <circle cx="3" cy="15" r="1.5" fill="currentColor" />
      <circle cx="9" cy="15" r="1.5" fill="currentColor" />
    </svg>
  </span>
</template>
