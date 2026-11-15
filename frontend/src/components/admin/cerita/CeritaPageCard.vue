<script setup lang="ts">
import { ref } from 'vue';
import BaseButton from '../../common/BaseButton.vue';
import type { AdminPage } from '../../../stores/ceritaAdmin.store';
import { ceritaIds } from './ceritaDomIds';

/**
 * One Cerita page as a card on `/admin/cerita`: the grip handle, the selection checkbox (always
 * shown), the big title, the Penulis / Tanggal Dibuat / Terakhir Diedit columns and the actions.
 * In Urutkan mode the grip can be dragged to a new place (HTML5 drag and drop, no dependency) and
 * Naik / Turun buttons do the same thing from the keyboard. The card only reports what was asked;
 * the view runs the save, the dialogs and the focus.
 */
const props = defineProps<{
  page: AdminPage;
  /** Urutkan mode: the grip is draggable and the Naik / Turun buttons show. */
  sorting?: boolean;
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

/** Upper half of the card means "before it", lower half "after it". */
function edgeAt(event: DragEvent): 'before' | 'after' {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  return event.clientY < box.top + box.height / 2 ? 'before' : 'after';
}

function onGripDragStart(event: DragEvent): void {
  // Firefox starts a drag only when some data is set.
  event.dataTransfer?.setData('text/plain', props.page.slug);
  event.dataTransfer?.setDragImage?.(cardElement.value ?? (event.target as Element), 24, 24);
  emit('drag-start');
}

function onDragOver(event: DragEvent): void {
  if (!props.sorting) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  emit('drag-over', edgeAt(event));
}

function onDrop(event: DragEvent): void {
  if (!props.sorting) return;
  event.preventDefault();
  emit('drop', edgeAt(event));
}
</script>

<template>
  <li
    ref="cardElement"
    class="rounded-card relative flex overflow-hidden border transition-colors"
    :class="
      selected
        ? 'border-brand-navy bg-surface-hover'
        : 'border-border bg-surface'
    "
    :style="dragging ? { opacity: 0.5 } : undefined"
    data-test="page-card"
    :data-slug="page.slug"
    :data-selected="selected ? 'true' : 'false'"
    @dragover="onDragOver"
    @drop="onDrop"
  >
    <span
      v-if="dropEdge === 'before'"
      aria-hidden="true"
      class="bg-brand-navy absolute inset-x-0 -top-1 z-10 h-1 rounded-full"
      data-test="drop-indicator"
    />
    <span
      v-if="dropEdge === 'after'"
      aria-hidden="true"
      class="bg-brand-navy absolute inset-x-0 -bottom-1 z-10 h-1 rounded-full"
      data-test="drop-indicator"
    />

    <span
      :draggable="sorting ? 'true' : 'false'"
      aria-hidden="true"
      class="bg-surface-muted border-border flex w-8 shrink-0 items-center justify-center border-r"
      :class="sorting ? 'cursor-grab active:cursor-grabbing' : ''"
      data-test="grip"
      @dragstart="onGripDragStart"
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

    <div class="flex min-w-0 flex-1 flex-col gap-4 p-4 md:flex-row md:items-center">
      <div class="flex min-w-0 flex-1 items-start gap-3">
        <div class="pt-1">
          <input
            :id="ceritaIds.cardCheckbox(page.slug)"
            type="checkbox"
            class="focus-visible:outline-focus-ring accent-brand-navy h-5 w-5 focus-visible:outline-2 focus-visible:outline-offset-2"
            :checked="selected"
            :disabled="busy"
            data-test="page-checkbox"
            @change="emit('toggle')"
          />
          <label :for="ceritaIds.cardCheckbox(page.slug)" class="sr-only">
            Pilih halaman {{ page.title }}
          </label>
        </div>

        <div class="min-w-0 space-y-3">
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
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 md:shrink-0 md:justify-end">
        <template v-if="sorting">
          <BaseButton
            :id="ceritaIds.cardUp(page.slug)"
            type="button"
            variant="secondary"
            size="md"
            class="min-h-11"
            :disabled="busy || isFirst"
            data-test="card-up"
            @click="emit('move', -1)"
          >
            Naik <span class="sr-only">halaman {{ page.title }}</span>
          </BaseButton>
          <BaseButton
            :id="ceritaIds.cardDown(page.slug)"
            type="button"
            variant="secondary"
            size="md"
            class="min-h-11"
            :disabled="busy || isLast"
            data-test="card-down"
            @click="emit('move', 1)"
          >
            Turun <span class="sr-only">halaman {{ page.title }}</span>
          </BaseButton>
        </template>
        <BaseButton
          :id="ceritaIds.cardEdit(page.slug)"
          type="button"
          variant="secondary"
          size="md"
          class="min-h-11"
          :disabled="busy"
          data-test="card-edit"
          @click="emit('edit')"
        >
          Edit <span class="sr-only">halaman {{ page.title }}</span>
        </BaseButton>
        <BaseButton
          :id="ceritaIds.cardDelete(page.slug)"
          type="button"
          variant="secondary"
          size="md"
          class="min-h-11"
          :disabled="busy"
          data-test="card-delete"
          @click="emit('delete')"
        >
          Hapus <span class="sr-only">halaman {{ page.title }}</span>
        </BaseButton>
      </div>
    </div>
  </li>
</template>
