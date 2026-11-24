<script setup lang="ts">
import { computed } from 'vue';
import { PhotoIcon, PresentationChartBarIcon } from '@heroicons/vue/24/outline';
import BaseButton from '../../common/BaseButton.vue';
import CardDragGrip from '../cards/CardDragGrip.vue';
import { useAuthenticatedBlobUrl } from '../../../composables/useAuthenticatedBlobUrl';
import type { DragBlock } from '../../../composables/useCardDragReorder';
import type { Completeness } from '../../../utils/ceritaChapterOverview';
import { ceritaIds } from './ceritaDomIds';

/**
 * One section card of the chapter overview: drag grip, thumbnail (the first photo of a photo or
 * gallery figure, loaded with the authenticated client; an icon for a chart, a diagram or no
 * figure), the eyebrow "BAGIAN 1.2", the title button that opens the section, a one-line excerpt,
 * the figure and completeness badges (text, never colour alone) and a ⋯ menu. Every action in the
 * menu is a native button, so ordering never needs the drag.
 */
const props = defineProps<{
  id: string;
  number: string;
  title: string;
  excerpt: string | null;
  figureBadge: string;
  completeness: Completeness;
  /** `/api/media/<id>/preview` of the thumbnail photo, or null for the icon placeholder. */
  thumbPath: string | null;
  thumbAlt: string;
  isFirst: boolean;
  isLast: boolean;
  canMove: boolean;
  busy: boolean;
  dragBlock: DragBlock;
  /** Whether the card is the drop target of a drag in progress (its edge). */
  dropEdge?: 'before' | 'after' | null;
}>();

const emit = defineEmits<{
  (e: 'edit'): void;
  (e: 'move-up'): void;
  (e: 'move-down'): void;
  (e: 'relocate'): void;
  (e: 'duplicate'): void;
  (e: 'delete'): void;
  (e: 'drag-start'): void;
  (e: 'drag-end'): void;
}>();

const thumbPathRef = computed(() => props.thumbPath);
const thumb = useAuthenticatedBlobUrl(thumbPathRef);

/** Closes the ⋯ menu so the next action starts from a closed menu. */
function closeMenu(event: Event): void {
  (event.currentTarget as HTMLElement).closest('details')?.removeAttribute('open');
}

const titleLabel = computed(() => props.title);
</script>

<template>
  <div
    class="rounded-card border-border relative flex items-center gap-3 border bg-white py-3 pr-2 pl-1"
    :class="{
      'border-t-brand-navy border-t-2': dropEdge === 'before',
      'border-b-brand-navy border-b-2': dropEdge === 'after',
    }"
    data-test="overview-card"
  >
    <CardDragGrip
      :blocked="dragBlock"
      :data-text="titleLabel"
      sort-label="Ringkasan bab"
      @drag-start="emit('drag-start')"
      @drag-end="emit('drag-end')"
    />

    <div
      class="bg-surface-muted border-border rounded-btn relative hidden h-[76px] w-[112px] shrink-0 overflow-hidden border sm:block"
      data-test="overview-thumb"
    >
      <img
        v-if="thumb.url.value"
        :src="thumb.url.value"
        :alt="thumbAlt"
        class="h-full w-full object-cover"
        data-test="overview-thumb-img"
      />
      <span
        v-else
        class="text-text-muted flex h-full w-full items-center justify-center"
        :aria-hidden="true"
        data-test="overview-thumb-placeholder"
      >
        <PresentationChartBarIcon
          v-if="figureBadge === 'Grafik' || figureBadge === 'Diagram'"
          class="h-6 w-6"
          aria-hidden="true"
        />
        <PhotoIcon v-else class="h-6 w-6" aria-hidden="true" />
      </span>
    </div>

    <div class="min-w-0 flex-1 space-y-1">
      <p
        class="text-text-muted text-[12px] font-semibold tracking-wide uppercase"
        data-test="overview-eyebrow"
      >
        Bagian {{ number }}
      </p>
      <button
        :id="ceritaIds.overviewCardTitle(id)"
        type="button"
        class="text-brand-navy focus-visible:outline-focus-ring block min-h-11 max-w-full rounded-xs text-left text-[17px] font-semibold break-words hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        data-test="overview-title"
        @click="emit('edit')"
      >
        {{ title }}
      </button>
      <p v-if="excerpt" class="text-text-muted truncate text-[13px]" data-test="overview-excerpt">
        {{ excerpt }}
      </p>
      <p v-else class="text-text-muted text-[13px]" data-test="overview-excerpt">
        Belum ada paragraf.
      </p>
    </div>

    <p class="flex shrink-0 flex-wrap items-center justify-end gap-2">
      <span
        class="inline-flex items-center gap-1.5 rounded-full bg-[#eef1f6] px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap text-[#3b4560]"
        data-test="overview-figure-badge"
      >
        {{ figureBadge }}
      </span>
      <span
        class="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap"
        :class="
          completeness.complete
            ? 'bg-status-success-surface text-status-success'
            : 'bg-status-warning-surface text-status-warning'
        "
        data-test="overview-completeness"
      >
        {{ completeness.label }}
      </span>
    </p>

    <details class="relative flex shrink-0 items-stretch" data-test="overview-card-menu">
      <summary
        :id="ceritaIds.overviewCardMenu(id)"
        class="hover:bg-surface-muted focus-visible:outline-focus-ring text-brand-navy flex min-h-11 w-11 cursor-pointer list-none items-center justify-center text-[18px] focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden"
        :aria-label="`Pilihan untuk bagian ${number} ${title}`"
      >
        <span aria-hidden="true">⋯</span>
      </summary>
      <div
        class="border-border rounded-card absolute top-full right-0 z-10 mt-1 grid w-56 gap-1 border bg-white p-2 shadow-md"
      >
        <BaseButton
          type="button"
          variant="ghost"
          size="md"
          class="min-h-11 justify-start text-sm"
          :disabled="busy"
          data-test="card-edit"
          @click="
            closeMenu($event);
            emit('edit');
          "
        >
          Edit bagian
        </BaseButton>
        <BaseButton
          :id="ceritaIds.overviewCardDuplicate(id)"
          type="button"
          variant="ghost"
          size="md"
          class="min-h-11 justify-start text-sm"
          :disabled="busy"
          data-test="card-duplicate"
          @click="
            closeMenu($event);
            emit('duplicate');
          "
        >
          Duplikat
        </BaseButton>
        <BaseButton
          :id="ceritaIds.overviewCardMove(id)"
          type="button"
          variant="ghost"
          size="md"
          class="min-h-11 justify-start text-sm"
          :disabled="busy || !canMove"
          :aria-describedby="canMove ? undefined : `${ceritaIds.overviewCardMove(id)}-info`"
          data-test="card-move"
          @click="
            closeMenu($event);
            emit('relocate');
          "
        >
          Pindahkan ke bab lain…
        </BaseButton>
        <p
          v-if="!canMove"
          :id="`${ceritaIds.overviewCardMove(id)}-info`"
          class="text-text-muted px-1 text-[12px]"
          data-test="card-move-info"
        >
          Halaman ini hanya punya satu bab, sehingga bagian tidak bisa dipindah.
        </p>
        <BaseButton
          :id="ceritaIds.overviewCardUp(id)"
          type="button"
          variant="ghost"
          size="md"
          class="min-h-11 justify-start text-sm"
          :disabled="busy || isFirst"
          data-test="card-up"
          @click="
            closeMenu($event);
            emit('move-up');
          "
        >
          Naik satu posisi
        </BaseButton>
        <BaseButton
          :id="ceritaIds.overviewCardDown(id)"
          type="button"
          variant="ghost"
          size="md"
          class="min-h-11 justify-start text-sm"
          :disabled="busy || isLast"
          data-test="card-down"
          @click="
            closeMenu($event);
            emit('move-down');
          "
        >
          Turun satu posisi
        </BaseButton>
        <BaseButton
          :id="ceritaIds.overviewCardDelete(id)"
          type="button"
          variant="danger"
          size="md"
          class="min-h-11 justify-start text-sm"
          :disabled="busy"
          data-test="card-delete"
          @click="
            closeMenu($event);
            emit('delete');
          "
        >
          Hapus bagian
        </BaseButton>
      </div>
    </details>
  </div>
</template>
