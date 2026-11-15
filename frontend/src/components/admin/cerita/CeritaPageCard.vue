<script setup lang="ts">
import BaseButton from '../../common/BaseButton.vue';
import type { AdminPage } from '../../../stores/ceritaAdmin.store';
import { ceritaIds } from './ceritaDomIds';

/**
 * One Cerita page as a card on `/admin/cerita`: a decorative grip strip, the optional selection
 * checkbox (Pilih mode), the big title, the Penulis / Tanggal Dibuat / Terakhir Diedit columns and
 * the actions on the right. Urutkan mode adds Naik / Turun buttons; there is no dragging. The card
 * only reports what was asked; the view runs the save, the dialogs and the focus.
 */
defineProps<{
  page: AdminPage;
  /** Urutkan mode: show the Naik / Turun buttons. */
  sorting?: boolean;
  /** Pilih mode: show the checkbox. */
  selecting?: boolean;
  selected?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  busy?: boolean;
}>();

const emit = defineEmits<{
  (e: 'edit'): void;
  (e: 'delete'): void;
  (e: 'move', direction: -1 | 1): void;
  (e: 'toggle'): void;
}>();

const DATE_FORMAT = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' });

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : DATE_FORMAT.format(date);
}
</script>

<template>
  <li
    class="rounded-card border-border bg-surface flex overflow-hidden border"
    data-test="page-card"
    :data-slug="page.slug"
  >
    <span
      aria-hidden="true"
      class="bg-surface-muted border-border flex w-8 shrink-0 items-center justify-center border-r"
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
        <div v-if="selecting" class="pt-1">
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
