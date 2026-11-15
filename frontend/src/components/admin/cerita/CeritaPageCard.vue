<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BookOpenIcon,
  PencilSquareIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import CardActionButton from '../cards/CardActionButton.vue';
import CardDragGrip from '../cards/CardDragGrip.vue';
import CardDropIndicator from '../cards/CardDropIndicator.vue';
import CardSelectCheckbox from '../cards/CardSelectCheckbox.vue';
import type { AdminPage } from '../../../stores/ceritaAdmin.store';
import { edgeAt, type DragBlock } from '../../../composables/useCardDragReorder';
import { ceritaIds } from './ceritaDomIds';
import { ceritaCoverFor } from '../../../content/ceritaCovers';

/**
 * One Cerita page as a card on `/admin/cerita`: the grip handle, the selection checkbox (always
 * shown, centred on the card), the big title, the Penulis / Tanggal Dibuat / Terakhir Diedit columns
 * and the actions under them (the same left edge on every width). From `md` a thumbnail sits at the
 * right: the category's bundled photo (`content/ceritaCovers`), or a neutral placeholder. The grip can be dragged at any time
 * unless a search filter is active or a save is in flight; Naik / Turun in Urutkan mode are the
 * keyboard and touch route to the same reorder. The card only reports what was asked; the view runs
 * the save, the dialogs and the focus. The grip, checkbox and drop line are the shared card parts in
 * `components/admin/cards`.
 */
const props = defineProps<{
  page: AdminPage;
  /** Urutkan mode: the Naik / Turun buttons show. */
  sorting?: boolean;
  /** Why the grip cannot be dragged right now, or null when it can (any time, Urutkan or not). */
  dragBlock?: DragBlock;
  selected?: boolean;
  /** This card is being dragged. */
  dragging?: boolean;
  /** Where the dragged card would land relative to this one, while it hovers here. */
  dropEdge?: 'before' | 'after' | null;
  isFirst?: boolean;
  isLast?: boolean;
  busy?: boolean;
}>();

const emit = defineEmits<{
  (e: 'edit'): void;
  (e: 'delete'): void;
  (e: 'move', direction: -1 | 1): void;
  (e: 'toggle'): void;
  (e: 'drag-start'): void;
  (e: 'drag-end'): void;
  (e: 'drag-over', edge: 'before' | 'after'): void;
  (e: 'drop', edge: 'before' | 'after'): void;
}>();

const cardElement = ref<HTMLElement | null>(null);
const DATE_FORMAT = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' });

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : DATE_FORMAT.format(date);
}

// The thumbnail is the category's bundled photo (the same one the home page shows), keyed by slug.
// A page without one gets the neutral placeholder.
const coverSrc = computed(() => ceritaCoverFor(props.page.slug));

function onDragOver(event: DragEvent): void {
  if (props.dragBlock) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  emit('drag-over', edgeAt(event));
}

function onDrop(event: DragEvent): void {
  if (props.dragBlock) return;
  event.preventDefault();
  emit('drop', edgeAt(event));
}
</script>

<template>
  <li
    ref="cardElement"
    class="rounded-card relative flex border transition-colors"
    :class="[
      selected ? 'border-brand-navy bg-surface-hover' : 'border-border bg-surface',
      dragging ? 'opacity-50' : '',
    ]"
    data-test="page-card"
    :data-slug="page.slug"
    :data-selected="selected ? 'true' : 'false'"
    @dragover="onDragOver"
    @drop="onDrop"
  >
    <CardDropIndicator v-if="dropEdge" :edge="dropEdge" />

    <CardDragGrip
      :blocked="dragBlock ?? null"
      :data-text="page.slug"
      :drag-image="cardElement"
      sort-label="Urutkan Cerita"
      @drag-start="emit('drag-start')"
      @drag-end="emit('drag-end')"
    />

    <div class="flex min-w-0 flex-1 items-center gap-3 p-4">
      <CardSelectCheckbox
        :id="ceritaIds.cardCheckbox(page.slug)"
        :checked="selected ?? false"
        :disabled="busy"
        :label="`Pilih halaman ${page.title}`"
        @toggle="emit('toggle')"
      />

      <div class="min-w-0 flex-1 space-y-3">
        <h3 class="text-brand-navy text-lg font-semibold break-words" data-test="card-title">
          {{ page.title }}
        </h3>
        <dl class="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div class="min-w-0">
            <dt class="text-text-muted">Penulis</dt>
            <dd class="text-brand-navy break-words" data-test="card-author">
              {{ page.bylineAuthor || '—' }}
            </dd>
          </div>
          <div class="min-w-0">
            <dt class="text-text-muted">Tanggal Dibuat</dt>
            <dd class="text-brand-navy" data-test="card-created">
              {{ formatDate(page.createdAt) }}
            </dd>
          </div>
          <div class="min-w-0">
            <dt class="text-text-muted">Terakhir Diedit</dt>
            <dd class="text-brand-navy" data-test="card-updated">
              {{ formatDate(page.updatedAt) }}
            </dd>
          </div>
        </dl>

        <div class="flex flex-wrap items-center gap-2" data-test="card-actions">
          <template v-if="sorting">
            <CardActionButton
              :id="ceritaIds.cardUp(page.slug)"
              :icon="ArrowUpIcon"
              label="Naik"
              :sr-text="`halaman ${page.title}`"
              :disabled="busy || isFirst"
              data-test="card-up"
              @click="emit('move', -1)"
            />
            <CardActionButton
              :id="ceritaIds.cardDown(page.slug)"
              :icon="ArrowDownIcon"
              label="Turun"
              :sr-text="`halaman ${page.title}`"
              :disabled="busy || isLast"
              data-test="card-down"
              @click="emit('move', 1)"
            />
          </template>
          <CardActionButton
            :id="ceritaIds.cardEdit(page.slug)"
            :icon="PencilSquareIcon"
            label="Edit"
            :sr-text="`halaman ${page.title}`"
            :disabled="busy"
            data-test="card-edit"
            @click="emit('edit')"
          />
          <CardActionButton
            :id="ceritaIds.cardDelete(page.slug)"
            :icon="XMarkIcon"
            label="Hapus"
            :sr-text="`halaman ${page.title}`"
            :disabled="busy"
            data-test="card-delete"
            @click="emit('delete')"
          />
        </div>
      </div>
    </div>

    <!-- Decorative: the title above already names the page, so the image has empty alt text. -->
    <!--
      Full card height, flush to the top, right and bottom edges; the rounded right corners clip it.
      The width is fixed, so the text column does not reflow from card to card.
    -->
    <div
      class="rounded-r-card relative hidden w-56 shrink-0 overflow-hidden md:block"
      data-test="card-thumbnail"
    >
      <img
        v-if="coverSrc"
        :src="coverSrc"
        alt=""
        loading="lazy"
        decoding="async"
        class="absolute inset-0 h-full w-full object-cover object-center"
        data-test="thumbnail-image"
      />
      <div
        v-else
        aria-hidden="true"
        class="bg-surface-muted text-text-muted absolute inset-0 flex items-center justify-center"
        data-test="thumbnail-placeholder"
      >
        <BookOpenIcon class="h-8 w-8" aria-hidden="true" />
      </div>
    </div>
  </li>
</template>
