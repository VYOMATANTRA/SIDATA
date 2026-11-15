<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  ArrowDownIcon,
  ArrowDownTrayIcon,
  ArrowUpIcon,
  DocumentTextIcon,
  PencilSquareIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import CardActionButton from '../cards/CardActionButton.vue';
import CardDragGrip from '../cards/CardDragGrip.vue';
import CardDropIndicator from '../cards/CardDropIndicator.vue';
import CardSelectCheckbox from '../cards/CardSelectCheckbox.vue';
import {
  formatFileSize,
  formatPublishedAt,
  pageCountValue,
  publicationDownloadHref,
  type PublicationItem,
} from '../../../content/publikasi';
import { mediaPreviewPath } from '../../../services/media.service';
import { useAuthenticatedBlobUrl } from '../../../composables/useAuthenticatedBlobUrl';
import { edgeAt, type DragBlock } from '../../../composables/useCardDragReorder';

/**
 * One publication as a full-width row on `/admin/publikasi` (a journal-style listing): the grip and
 * the selection checkbox on the left; then the category chip (and "Segera hadir" when it is not
 * downloadable), the title, the description clamped to three lines, the cover and five labelled
 * facts (Halaman, Diterbitkan, Format, Ukuran, Sumber), a divider, and the text-link actions.
 *
 * The cover is the editor preview, fetched with the authenticated client and shown as a blob URL. It
 * is only requested once the card scrolls near the viewport (lazy), and the blob URL is revoked when
 * the card unmounts. Until then, or with no cover, a neutral placeholder shows. The card only reports
 * what was asked; the view runs the save, the dialogs and the focus.
 */
const props = withDefaults(
  defineProps<{
    publication: PublicationItem;
    /** Prefix for the card's control ids, so the list can hand focus back after a move. */
    idPrefix: string;
    /** Urutkan mode: the Naik / Turun links show. */
    sorting?: boolean;
    dragBlock?: DragBlock;
    selected?: boolean;
    dragging?: boolean;
    dropEdge?: 'before' | 'after' | null;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
    busy?: boolean;
  }>(),
  {
    sorting: false,
    dragBlock: null,
    selected: false,
    dragging: false,
    dropEdge: null,
    canMoveUp: false,
    canMoveDown: false,
    busy: false,
  },
);

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
const title = computed(() => props.publication.title.trim());
const description = computed(() => props.publication.description.trim());
const downloadHref = computed(() => publicationDownloadHref(props.publication));
const available = computed(() => downloadHref.value !== null);
const titleId = computed(() => `${props.idPrefix}-judul`);

const pages = computed(() => {
  const value = pageCountValue(props.publication.pageCount);
  return value === null ? '—' : String(value);
});
const published = computed(() => formatPublishedAt(props.publication.publishedAt) ?? '—');
const format = computed(() => props.publication.fileType?.trim() || '—');
const size = computed(() => formatFileSize(props.publication.fileSizeBytes) || '—');
const source = computed(() => props.publication.source?.trim() || '—');

// Lazy cover: the preview is requested only once the card is near the viewport. Without an
// IntersectionObserver (old browsers, tests) it loads at once.
const inView = ref(typeof IntersectionObserver === 'undefined');
let observer: IntersectionObserver | null = null;
onMounted(() => {
  if (inView.value || !cardElement.value) return;
  observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      inView.value = true;
      observer?.disconnect();
      observer = null;
    },
    { rootMargin: '200px' },
  );
  observer.observe(cardElement.value);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

const coverPath = computed(() => {
  const id = props.publication.coverAssetId;
  if (!id || !inView.value) return null;
  return `${mediaPreviewPath(id)}?variant=thumbnail`;
});
const cover = useAuthenticatedBlobUrl(coverPath);

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
    data-test="publication-card"
    :data-selected="selected ? 'true' : 'false'"
    @dragover="onDragOver"
    @drop="onDrop"
  >
    <CardDropIndicator v-if="dropEdge" :edge="dropEdge" />

    <CardDragGrip
      :blocked="dragBlock"
      :data-text="idPrefix"
      :drag-image="cardElement"
      sort-label="Urutkan Publikasi"
      search-title="Seret dinonaktifkan selama pencarian atau saringan aktif. Kosongkan kotak pencarian dan saringan untuk mengubah urutan."
      @drag-start="emit('drag-start')"
      @drag-end="emit('drag-end')"
    />

    <div class="flex min-w-0 flex-1 items-center gap-3 p-3 sm:gap-4 sm:p-4">
      <CardSelectCheckbox
        :id="`${idPrefix}-pilih`"
        :checked="selected"
        :disabled="busy"
        :label="`Pilih publikasi ${title}`"
        data-test="publication-checkbox"
        @toggle="emit('toggle')"
      />

      <div class="min-w-0 flex-1 space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <span
            class="border-status-success-border bg-status-success-surface text-status-success inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold"
            data-test="card-category"
          >
            {{ publication.category }}
          </span>
          <span
            v-if="!available"
            class="border-border-strong bg-surface-muted text-text-muted inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold"
            data-test="card-status"
          >
            Segera hadir
          </span>
        </div>

        <h3 :id="titleId" class="text-brand-navy text-lg leading-snug font-semibold break-words" data-test="card-title">
          {{ title }}
        </h3>

        <p class="text-brand-navy line-clamp-3 text-sm leading-relaxed" data-test="card-description">
          {{ description }}
        </p>

        <div class="flex flex-col gap-4 sm:flex-row">
          <!-- Decorative: the title names the publication, so the cover has empty alt text. -->
          <div
            class="rounded-btn border-border bg-surface-muted relative h-36 w-24 shrink-0 overflow-hidden border sm:h-[165px] sm:w-[120px]"
            data-test="card-cover-frame"
          >
            <img
              v-if="cover.url.value"
              :src="cover.url.value"
              alt=""
              class="h-full w-full object-cover object-center"
              data-test="card-cover"
            />
            <div
              v-else
              aria-hidden="true"
              class="text-text-muted flex h-full items-center justify-center"
              data-test="card-cover-placeholder"
            >
              <DocumentTextIcon class="h-8 w-8" aria-hidden="true" />
            </div>
          </div>

          <dl class="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
            <div class="min-w-0">
              <dt class="text-text-muted text-xs">Halaman</dt>
              <dd class="text-brand-navy text-base font-semibold" data-test="card-pages">{{ pages }}</dd>
            </div>
            <div class="min-w-0">
              <dt class="text-text-muted text-xs">Diterbitkan</dt>
              <dd class="text-brand-navy text-base font-semibold" data-test="card-published">{{ published }}</dd>
            </div>
            <div class="min-w-0">
              <dt class="text-text-muted text-xs">Format</dt>
              <dd class="text-brand-navy text-base font-semibold break-words" data-test="card-format">{{ format }}</dd>
            </div>
            <div class="min-w-0">
              <dt class="text-text-muted text-xs">Ukuran</dt>
              <dd class="text-brand-navy text-base font-semibold" data-test="card-size">{{ size }}</dd>
            </div>
            <div class="min-w-0">
              <dt class="text-text-muted text-xs">Sumber</dt>
              <dd class="text-brand-navy text-sm leading-snug font-medium break-words" data-test="card-source">{{ source }}</dd>
            </div>
          </dl>
        </div>

        <div class="border-border flex flex-wrap items-center gap-2 border-t pt-3" data-test="card-actions">
          <CardActionButton
            v-if="downloadHref"
            :id="`${idPrefix}-unduh`"
            :icon="ArrowDownTrayIcon"
            label="Unduh"
            :sr-text="`publikasi ${title}`"
            :href="downloadHref"
            target="_blank"
            data-test="card-download"
          />
          <CardActionButton
            :id="`${idPrefix}-ubah`"
            :icon="PencilSquareIcon"
            label="Ubah"
            :sr-text="`publikasi ${title}`"
            :disabled="busy"
            data-test="card-edit"
            @click="emit('edit')"
          />
          <CardActionButton
            :id="`${idPrefix}-hapus`"
            :icon="XMarkIcon"
            label="Hapus"
            :sr-text="`publikasi ${title}`"
            :disabled="busy"
            data-test="card-delete"
            @click="emit('delete')"
          />
          <template v-if="sorting">
            <CardActionButton
              :id="`${idPrefix}-up`"
              :icon="ArrowUpIcon"
              label="Naik"
              :sr-text="`publikasi ${title}`"
              :disabled="busy || !canMoveUp"
              data-test="card-move-up"
              @click="emit('move', -1)"
            />
            <CardActionButton
              :id="`${idPrefix}-down`"
              :icon="ArrowDownIcon"
              label="Turun"
              :sr-text="`publikasi ${title}`"
              :disabled="busy || !canMoveDown"
              data-test="card-move-down"
              @click="emit('move', 1)"
            />
          </template>
        </div>
      </div>
    </div>
  </li>
</template>
