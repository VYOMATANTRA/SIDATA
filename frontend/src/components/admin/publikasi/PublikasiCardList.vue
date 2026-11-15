<script setup lang="ts">
import type { DragBlock } from '../../../composables/useCardDragReorder';
import type { PublicationItem } from '../../../content/publikasi';
import CardDropIndicator from '../cards/CardDropIndicator.vue';
import PublikasiCard from './PublikasiCard.vue';

/**
 * The single-column list of publication cards on `/admin/publikasi`, in catalog order. `rows` is the
 * list after the search and category filter (each with its catalog `index`); `totalCount` is the full
 * list, so Naik / Turun are disabled by the real position. Drag state comes from the view.
 */
export interface PublikasiRow {
  key: string;
  publication: PublicationItem;
  index: number;
}

defineProps<{
  rows: readonly PublikasiRow[];
  totalCount: number;
  /** A search or category filter is active: the order is partly hidden, so Naik / Turun are off. */
  filtering: boolean;
  sorting?: boolean;
  dragBlock?: DragBlock;
  selectedKeys?: readonly string[];
  dragKey?: string | null;
  dropTarget?: { key: string; edge: 'before' | 'after' } | null;
  dropAtEnd?: boolean;
  busy?: boolean;
}>();

const emit = defineEmits<{
  (e: 'edit', index: number): void;
  (e: 'delete', index: number): void;
  (e: 'move', index: number, direction: -1 | 1): void;
  (e: 'toggle', key: string): void;
  (e: 'drag-start', key: string): void;
  (e: 'drag-end'): void;
  (e: 'drag-over', key: string, edge: 'before' | 'after'): void;
  (e: 'drop', key: string, edge: 'before' | 'after'): void;
  (e: 'drag-over-end'): void;
  (e: 'drop-end'): void;
}>();
</script>

<template>
  <ol class="space-y-3" data-test="publication-list">
    <PublikasiCard
      v-for="row in rows"
      :key="row.key"
      :id-prefix="`publikasi-card-${row.index}`"
      :publication="row.publication"
      :sorting="sorting"
      :drag-block="dragBlock"
      :drag-active="dragKey != null"
      :selected="selectedKeys?.includes(row.key) ?? false"
      :dragging="dragKey === row.key"
      :drop-edge="dropTarget?.key === row.key ? dropTarget.edge : null"
      :can-move-up="!filtering && row.index > 0"
      :can-move-down="!filtering && row.index < totalCount - 1"
      :busy="busy"
      @edit="emit('edit', row.index)"
      @delete="emit('delete', row.index)"
      @move="(direction) => emit('move', row.index, direction)"
      @toggle="emit('toggle', row.key)"
      @drag-start="emit('drag-start', row.key)"
      @drag-end="emit('drag-end')"
      @drag-over="(edge) => emit('drag-over', row.key, edge)"
      @drop="(edge) => emit('drop', row.key, edge)"
    />
    <!-- The zone after the last card: dropping here moves the card to the end of the catalog. -->
    <li
      v-if="dragKey"
      aria-hidden="true"
      class="relative h-4"
      data-test="drop-end"
      @dragover.prevent="emit('drag-over-end')"
      @drop.prevent="emit('drop-end')"
    >
      <CardDropIndicator v-if="dropAtEnd" edge="end" />
    </li>
  </ol>
</template>
