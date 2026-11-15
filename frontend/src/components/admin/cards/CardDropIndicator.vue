<script setup lang="ts">
import { computed } from 'vue';

/**
 * The drop line of a reorderable card list: a bold line with a dot at its start, on the side the
 * dragged card would land (above or below a card, or the zone after the last card). Decorative: the
 * drop is announced in text by the view, so the indicator is hidden from assistive technology.
 */
const props = defineProps<{ edge: 'before' | 'after' | 'end' }>();

const placement = computed(() => {
  if (props.edge === 'before') return '-top-2';
  if (props.edge === 'after') return '-bottom-2';
  return 'top-1/2 -translate-y-1/2';
});
</script>

<template>
  <span
    aria-hidden="true"
    class="pointer-events-none absolute inset-x-0 z-10 flex items-center"
    :class="placement"
    data-test="drop-indicator"
    :data-edge="edge"
  >
    <span class="bg-brand-navy -ml-1.5 size-3 shrink-0 rounded-full" />
    <span class="bg-brand-navy h-1.5 flex-1 rounded-full" />
  </span>
</template>
