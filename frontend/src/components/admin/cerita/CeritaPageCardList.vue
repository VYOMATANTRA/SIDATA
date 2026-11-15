<script setup lang="ts">
import type { AdminPage } from '../../../stores/ceritaAdmin.store';
import CeritaPageCard from './CeritaPageCard.vue';

/**
 * The list of Cerita page cards on `/admin/cerita`, in server order. `pages` is the list after the
 * search filter; `firstSlug` / `lastSlug` name the ends of the full order, so Naik / Turun are
 * disabled by the real position rather than by what the filter happens to show. Drag state comes
 * from the view: `dragSlug` is the card in flight, `dropTarget` the card it hovers and the side.
 */
defineProps<{
  pages: readonly AdminPage[];
  /** Pages in the full list, before any search filter. */
  totalCount: number;
  firstSlug: string | null;
  lastSlug: string | null;
  sorting?: boolean;
  selectedSlugs?: readonly string[];
  dragSlug?: string | null;
  dropTarget?: { slug: string; edge: 'before' | 'after' } | null;
  busy?: boolean;
}>();

const emit = defineEmits<{
  (e: 'edit', slug: string): void;
  (e: 'delete', slug: string): void;
  (e: 'move', slug: string, direction: -1 | 1): void;
  (e: 'toggle', slug: string): void;
  (e: 'drag-start', slug: string): void;
  (e: 'drag-end'): void;
  (e: 'drag-over', slug: string, edge: 'before' | 'after'): void;
  (e: 'drop', slug: string, edge: 'before' | 'after'): void;
}>();
</script>

<template>
  <div class="space-y-3" data-test="page-list">
    <p
      v-if="totalCount === 0"
      class="rounded-card border-border-strong text-text-muted border border-dashed p-4 text-sm"
      data-test="page-empty"
    >
      Belum ada Cerita. Pilih “Tambah Cerita” untuk membuat halaman Cerita pertama.
    </p>
    <p
      v-else-if="pages.length === 0"
      class="rounded-card border-border-strong text-text-muted border border-dashed p-4 text-sm"
      role="status"
      data-test="search-empty"
    >
      Tidak ada Cerita yang cocok dengan pencarian ini.
    </p>

    <ol v-else class="space-y-3">
      <CeritaPageCard
        v-for="page in pages"
        :key="page.id"
        :page="page"
        :sorting="sorting"
        :selected="selectedSlugs?.includes(page.slug) ?? false"
        :dragging="dragSlug === page.slug"
        :drop-edge="dropTarget?.slug === page.slug ? dropTarget.edge : null"
        :is-first="page.slug === firstSlug"
        :is-last="page.slug === lastSlug"
        :busy="busy"
        @edit="emit('edit', page.slug)"
        @delete="emit('delete', page.slug)"
        @move="(direction) => emit('move', page.slug, direction)"
        @toggle="emit('toggle', page.slug)"
        @drag-start="emit('drag-start', page.slug)"
        @drag-end="emit('drag-end')"
        @drag-over="(edge) => emit('drag-over', page.slug, edge)"
        @drop="(edge) => emit('drop', page.slug, edge)"
      />
    </ol>
  </div>
</template>
