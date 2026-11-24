<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AlertBanner from '../../common/AlertBanner.vue';
import BaseButton from '../../common/BaseButton.vue';
import FormField from '../../common/FormField.vue';
import CeritaAddSectionPanel from './CeritaAddSectionPanel.vue';
import CeritaSectionCard from './CeritaSectionCard.vue';
import {
  edgeAt,
  useCardDragReorder,
  type DragBlock,
} from '../../../composables/useCardDragReorder';
import type { PendingFigureKind } from '../../../composables/figureKindHint';
import type { AdminChapter, AdminSection } from '../../../stores/ceritaAdmin.store';
import type { OverviewCard } from '../../../utils/ceritaChapterOverview';
import { sectionNumberLabel } from '../../../utils/ceritaTreeLabels';
import { useKeyboardReorder } from '../../../composables/useKeyboardReorder';
import { titleTextProblem } from '../../../utils/titleTextRules';
import type { FailureKind } from '../../../utils/userMessages';
import { ceritaIds } from './ceritaDomIds';

/**
 * The centre column when a chapter (and no section) is selected: "BAB n DARI N · JUDUL", the
 * chapter title as a labelled field saved with "Simpan judul", Hapus bab, the list of section cards
 * (ordered on the grip: drag, or Spasi and the arrow keys), and the "Tambah bagian baru" panel. The
 * overview only reports
 * what was asked; the view runs the saves, the dialogs and the focus.
 */

const props = defineProps<{
  chapter: AdminChapter;
  /** 1-based position of the chapter in its page, and the page's chapter count. */
  position: number;
  total: number;
  cards: OverviewCard[];
  /** Other chapters of the page, the targets of "Pindahkan ke bab lain…". */
  otherChaptersCount: number;
  /** The chapter's number ("1", "2"), the prefix of every card number. */
  chapterNumber: string;
  busy: boolean;
  titleError?: string;
  titleErrorKind?: FailureKind;
  titleStale?: boolean;
  addError?: string;
  addErrorKind?: FailureKind;
  addBusy?: boolean;
}>();

const emit = defineEmits<{
  (e: 'save-title', title: string): void;
  (e: 'reload'): void;
  (e: 'chapter-delete'): void;
  (e: 'edit-section', section: AdminSection): void;
  (e: 'relocate-section', section: AdminSection): void;
  (e: 'duplicate-section', section: AdminSection): void;
  (e: 'delete-section', section: AdminSection): void;
  (e: 'place-section', section: AdminSection, toIndex: number): void;
  (e: 'add-section', title: string, kind: PendingFigureKind | null): void;
}>();

// --- Chapter title (a draft; a new chapter starts from its saved title) ---

const draft = ref(props.chapter.title);
const submitted = ref(false);
watch(
  () => props.chapter.id,
  () => {
    draft.value = props.chapter.title;
    submitted.value = false;
  },
);

const titleProblem = computed(() => {
  switch (titleTextProblem(draft.value)) {
    case 'empty':
      return 'Judul bab wajib diisi.';
    case 'too-long':
      return 'Judul bab maksimal 255 karakter.';
    case 'html':
      return 'Judul bab tidak boleh memuat tag HTML.';
    case 'characters':
      return 'Judul bab memuat karakter yang tidak diizinkan.';
    default:
      return undefined;
  }
});

function saveTitle(): void {
  submitted.value = true;
  if (titleProblem.value || props.busy) return;
  emit('save-title', draft.value.trim());
}

// --- Ordering of section cards on the grips (drag, or the keyboard) ---

const dragBlock = computed<DragBlock>(() => (props.busy ? 'busy' : null));
const drag = useCardDragReorder({
  order: computed(() => props.chapter.sections.map((section) => section.id)),
  blocked: dragBlock,
  onMove: (id, toIndex) => {
    const section = props.chapter.sections.find((item) => item.id === id);
    if (section) emit('place-section', section, toIndex);
  },
});

const keyboard = useKeyboardReorder({
  order: computed(() => props.chapter.sections.map((section) => section.id)),
  blocked: computed(() => props.busy),
  label: (id) => {
    const card = props.cards.find((item) => item.section.id === id);
    return `Bagian ${card?.number ?? ''}`.trim();
  },
  noun: 'Bagian',
  onMove: (id, toIndex) => {
    const section = props.chapter.sections.find((item) => item.id === id);
    if (section) emit('place-section', section, toIndex);
  },
});

/** The cards in the order to show; a keyboard move previews its place and renumbers the cards. */
const shownCards = computed<OverviewCard[]>(() =>
  keyboard.arrange(props.cards, (card) => card.section.id).map((card, index) => {
    const number = sectionNumberLabel(props.chapterNumber, index);
    return { ...card, number, thumbAlt: `Pratinjau gambar bagian ${number}` };
  }),
);

function allowDrop(event: DragEvent): void {
  event.preventDefault();
}

function edgeFor(id: string): 'before' | 'after' | null {
  const keyed = keyboard.edgeOf(id);
  if (keyed) return keyed;
  const target = drag.dropTarget.value;
  return target && target.key === id ? target.edge : null;
}

const chapterLabel = computed(
  () => `Bab ${props.position} dari ${props.total} · ${props.chapter.title}`,
);
</script>

<template>
  <section
    :aria-labelledby="ceritaIds.overviewLabel"
    class="min-w-0 space-y-6"
    data-test="chapter-overview"
  >
    <header class="space-y-3">
      <p
        :id="ceritaIds.overviewLabel"
        tabindex="-1"
        class="text-text-muted text-[13px] font-semibold tracking-wide uppercase outline-none"
        data-test="overview-heading"
      >
        {{ chapterLabel }}
      </p>

      <form novalidate class="space-y-3" data-test="chapter-title-form" @submit.prevent="saveTitle">
        <FormField
          :id="ceritaIds.overviewTitleField"
          label="Judul bab"
          :error="submitted ? titleProblem : undefined"
          required
          v-slot="{ describedBy, invalid }"
        >
          <div class="flex flex-col gap-2 sm:flex-row sm:items-start">
            <input
              :id="ceritaIds.overviewTitleField"
              v-model="draft"
              type="text"
              :class="[
                'text-brand-navy placeholder:text-text-muted border-border-strong focus-visible:outline-focus-ring aria-invalid:border-status-error min-h-12 min-w-0 flex-1 rounded-none border-0 border-b border-dashed bg-transparent px-0 py-1 text-[28px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-solid',
              ]"
              :disabled="busy"
              :aria-describedby="describedBy"
              :aria-invalid="invalid ? 'true' : undefined"
              data-test="chapter-title-input"
            />
            <BaseButton
              :id="ceritaIds.overviewTitleSave"
              type="submit"
              size="md"
              class="min-h-11 shrink-0"
              :disabled="busy"
              data-test="chapter-title-save"
            >
              Simpan judul
            </BaseButton>
          </div>
        </FormField>

        <AlertBanner
          v-if="titleError"
          :message="titleError"
          :kind="titleErrorKind"
          data-test="chapter-title-error"
        >
          <template v-if="titleStale" #action>
            <BaseButton
              type="button"
              variant="secondary"
              size="sm"
              class="min-h-11"
              :disabled="busy"
              data-test="chapter-title-reload"
              @click="emit('reload')"
            >
              Muat versi terbaru
            </BaseButton>
          </template>
        </AlertBanner>
      </form>

      <div class="flex flex-wrap items-center gap-1" data-test="chapter-actions">
        <BaseButton
          :id="ceritaIds.overviewChapterDelete"
          type="button"
          variant="danger"
          size="md"
          class="min-h-11 text-sm"
          :disabled="busy"
          data-test="chapter-delete"
          @click="emit('chapter-delete')"
        >
          Hapus bab
        </BaseButton>
      </div>
    </header>

    <div class="space-y-3">
      <h3 :id="ceritaIds.overviewList" class="text-brand-navy text-base font-semibold">
        Bagian dalam bab ini
      </h3>
      <p class="text-text-muted text-[14px]" data-test="overview-hint">
        Seret ikon titik-titik untuk mengubah urutan kartu. Dari keyboard, fokus ikon itu, tekan
        Spasi, lalu panah atas atau bawah, dan Spasi lagi untuk menjatuhkan. Klik kartu untuk
        mengedit isi dan figurnya.
      </p>
      <span class="sr-only" role="status" aria-live="polite" data-test="overview-reorder-status">{{
        keyboard.announcement.value
      }}</span>

      <p
        v-if="cards.length === 0"
        class="rounded-card border-border-strong text-text-muted border border-dashed p-4 text-sm"
        data-test="overview-empty"
      >
        Belum ada bagian di bab ini.
      </p>

      <ol
        v-else
        class="space-y-3"
        :aria-labelledby="ceritaIds.overviewList"
        data-test="overview-list"
      >
        <li
          v-for="card in shownCards"
          :key="card.section.id"
          class="relative"
          data-test="overview-item"
          @dragover="
            (event) => {
              allowDrop(event);
              if (drag.dragKey.value) drag.hoverDrop(card.section.id, edgeAt(event));
            }
          "
          @drop.prevent="drag.dropOn(card.section.id, edgeAt($event))"
        >
          <CeritaSectionCard
            :id="card.section.id"
            :number="card.number"
            :title="card.title"
            :excerpt="card.excerpt"
            :figure-badge="card.figureBadge"
            :completeness="card.completeness"
            :thumb-path="card.thumbPath"
            :thumb-alt="card.thumbAlt"
            :can-move="otherChaptersCount > 0"
            :busy="busy"
            :drop-edge="edgeFor(card.section.id)"
            :carried="keyboard.isCarried(card.section.id)"
            @edit="emit('edit-section', card.section)"
            @relocate="emit('relocate-section', card.section)"
            @duplicate="emit('duplicate-section', card.section)"
            @delete="emit('delete-section', card.section)"
            @drag-start="drag.startDrag(card.section.id)"
            @drag-end="drag.clearDrag()"
            @grip-keydown="keyboard.onGripKeydown($event, card.section.id)"
            @grip-blur="keyboard.onGripBlur($event, card.section.id)"
          />
        </li>
      </ol>
    </div>

    <CeritaAddSectionPanel
      :busy="addBusy ?? false"
      :error="addError"
      :error-kind="addErrorKind"
      @add="(title, kind) => emit('add-section', title, kind)"
    />
  </section>
</template>
