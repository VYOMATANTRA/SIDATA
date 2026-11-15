<script setup lang="ts">
import { computed, useId } from 'vue';
import BaseButton from '../../common/BaseButton.vue';
import {
  formatFileSize,
  publicationDownloadHref,
  publicationMetaLine,
  type PublicationItem,
} from '../../../content/publikasi';

/**
 * One publication in the `/admin/publikasi` grid: category chip, title, the page count and
 * publication month, the description in a muted box, and the file facts with the actions.
 *
 * Every action is a real button (or a link for Unduh) and carries the visible word first, then a
 * screen-reader-only "publikasi <judul>", so the accessible name still starts with the visible
 * text (WCAG 2.5.3) without three identical "Ubah" buttons being announced. Naik and Turun are
 * disabled at the ends and while a search or category filter hides some rows: the list order
 * only means something for the full catalog.
 */

const props = withDefaults(
  defineProps<{
    publication: PublicationItem;
    /** Prefix for the action ids, so the grid can hand focus back after a move. */
    idPrefix?: string;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
    busy?: boolean;
  }>(),
  { idPrefix: undefined, canMoveUp: false, canMoveDown: false, busy: false },
);

const emit = defineEmits<{
  (e: 'edit'): void;
  (e: 'delete'): void;
  (e: 'move-up'): void;
  (e: 'move-down'): void;
}>();

const fallbackId = useId();
const prefix = computed(() => props.idPrefix ?? `publikasi-card-${fallbackId}`);
const titleId = computed(() => `${prefix.value}-title`);

const title = computed(() => props.publication.title.trim());
const meta = computed(() => publicationMetaLine(props.publication));
const downloadHref = computed(() => publicationDownloadHref(props.publication));
const isAvailable = computed(() => downloadHref.value !== null);

const fileLine = computed(() => {
  const size = formatFileSize(props.publication.fileSizeBytes);
  return [props.publication.fileType, size].filter(Boolean).join(' · ');
});
</script>

<template>
  <article
    class="rounded-card border-border bg-surface flex h-full flex-col gap-3 border p-5"
    :aria-labelledby="titleId"
  >
    <div class="flex flex-wrap items-center gap-2">
      <span
        class="border-status-success-border bg-status-success-surface text-status-success inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold"
        data-test="card-category"
      >
        {{ publication.category }}
      </span>
      <span
        v-if="!isAvailable"
        class="border-border-strong bg-surface-muted text-text-muted inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold"
        data-test="card-status"
      >
        Segera hadir
      </span>
    </div>

    <h3 :id="titleId" class="text-brand-navy text-lg leading-snug font-semibold break-words">
      {{ title }}
    </h3>

    <p v-if="meta" class="text-text-muted text-sm" data-test="card-meta">{{ meta }}</p>

    <p class="rounded-btn bg-surface-muted text-brand-navy p-3 text-sm leading-relaxed">
      {{ publication.description }}
    </p>

    <p v-if="fileLine" class="font-mono text-xs text-text-muted" data-test="card-file">
      {{ fileLine }}
    </p>

    <div class="mt-auto flex flex-wrap gap-2 pt-2">
      <BaseButton
        :id="`${prefix}-edit`"
        type="button"
        variant="secondary"
        size="sm"
        class="min-h-11"
        :disabled="busy"
        data-test="card-edit"
        @click="emit('edit')"
      >
        Ubah <span class="sr-only">publikasi {{ title }}</span>
      </BaseButton>
      <BaseButton
        :id="`${prefix}-delete`"
        type="button"
        variant="secondary"
        size="sm"
        class="min-h-11"
        :disabled="busy"
        data-test="card-delete"
        @click="emit('delete')"
      >
        Hapus <span class="sr-only">publikasi {{ title }}</span>
      </BaseButton>
      <BaseButton
        v-if="downloadHref"
        :id="`${prefix}-download`"
        :href="downloadHref"
        target="_blank"
        variant="secondary"
        size="sm"
        class="min-h-11"
        data-test="card-download"
      >
        Unduh <span class="sr-only">publikasi {{ title }}</span>
      </BaseButton>
      <BaseButton
        :id="`${prefix}-up`"
        type="button"
        variant="secondary"
        size="sm"
        class="min-h-11"
        :disabled="busy || !canMoveUp"
        data-test="card-move-up"
        @click="emit('move-up')"
      >
        Naik <span class="sr-only">publikasi {{ title }}</span>
      </BaseButton>
      <BaseButton
        :id="`${prefix}-down`"
        type="button"
        variant="secondary"
        size="sm"
        class="min-h-11"
        :disabled="busy || !canMoveDown"
        data-test="card-move-down"
        @click="emit('move-down')"
      >
        Turun <span class="sr-only">publikasi {{ title }}</span>
      </BaseButton>
    </div>
  </article>
</template>
