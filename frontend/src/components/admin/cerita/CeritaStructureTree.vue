<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  PlusIcon,
} from '@heroicons/vue/24/outline';
import BaseButton from '../../common/BaseButton.vue';
import ReorderGripButton from '../cards/ReorderGripButton.vue';
import { edgeAt, useCardDragReorder } from '../../../composables/useCardDragReorder';
import { useKeyboardReorder } from '../../../composables/useKeyboardReorder';
import type { AdminChapter, AdminPage, AdminSection } from '../../../stores/ceritaAdmin.store';
import {
  chapterNumberLabel,
  sectionNumberLabel,
  type FigureTreeLabel,
} from '../../../utils/ceritaTreeLabels';
import { ceritaIds } from './ceritaDomIds';

/**
 * The left column of the Cerita editor: "Info cerita", then the page's chapters, each expandable,
 * with its sections numbered "1.1, 1.2" and the kind of each section's figure. Every action is a
 * button (Ubah judul, Hapus, ...) inside a native disclosure. Order is changed on the grip: drag it,
 * or focus it and use Spasi with the arrow keys (`useKeyboardReorder`). Chapters reorder within the
 * page, sections within their chapter (cross-chapter moves are in the section's options through the
 * move dialog). Every row shows its position as a number.
 *
 * The tree only reports what was asked; the view runs the dialogs, the saves and the selection.
 */
const props = defineProps<{
  page: AdminPage;
  selectedChapterId: string | null;
  selectedSectionId: string | null;
  /** The chapter whose overview is open in the centre column (no section selected), or null. */
  overviewChapterId?: string | null;
  busy: boolean;
  figureSummary: (sectionId: string) => FigureTreeLabel;
}>();

const emit = defineEmits<{
  (e: 'info'): void;
  (e: 'select-chapter', chapter: AdminChapter): void;
  (e: 'select-section', chapter: AdminChapter, section: AdminSection): void;
  (e: 'add-chapter'): void;
  (e: 'add-section', chapter: AdminChapter): void;
  (e: 'rename-chapter', chapter: AdminChapter): void;
  (e: 'delete-chapter', chapter: AdminChapter): void;
  /** `done` (keyboard only) reports whether the save went through, so the list can settle. */
  (e: 'place-chapter', chapter: AdminChapter, toIndex: number, done?: (ok: boolean) => void): void;
  (e: 'rename-section', chapter: AdminChapter, section: AdminSection): void;
  (e: 'delete-section', chapter: AdminChapter, section: AdminSection): void;
  (
    e: 'place-section',
    chapter: AdminChapter,
    section: AdminSection,
    toIndex: number,
    done?: (ok: boolean) => void,
  ): void;
}>();

// Chapters are open by default; the set holds only the ones the editor closed.
const collapsed = ref<Set<string>>(new Set());

function isOpen(chapter: AdminChapter): boolean {
  return !collapsed.value.has(chapter.id);
}

function toggle(chapter: AdminChapter): void {
  const next = new Set(collapsed.value);
  if (next.has(chapter.id)) next.delete(chapter.id);
  else next.add(chapter.id);
  collapsed.value = next;
}

// The chapter that holds the selected section is always open, so the selection is visible.
watch(
  () => props.selectedChapterId,
  (id) => {
    if (id && collapsed.value.has(id)) {
      const next = new Set(collapsed.value);
      next.delete(id);
      collapsed.value = next;
    }
  },
);

/** The chapter's number at its position in the list as shown (a carried chapter shows its new one). */
function chapterNumber(chapter: AdminChapter, index: number): string {
  return chapterNumberLabel(chapter.number, index);
}

function sectionNumber(chapter: AdminChapter, chapterIndex: number, sectionIndex: number): string {
  return sectionNumberLabel(chapterNumber(chapter, chapterIndex), sectionIndex);
}

function sectionLabel(section: AdminSection, sectionIndex: number): string {
  return section.title?.trim() ? section.title : `Bagian ${sectionIndex + 1}`;
}

function chapterLabel(chapter: AdminChapter, chapterIndex: number): string {
  return `Bab ${chapterNumber(chapter, chapterIndex)} · ${chapter.title}`;
}

/** The "Bab 2" or "Bagian 1.3" text of a row as it stands in the committed order. */
function committedNumberOfChapter(id: string): string {
  const index = props.page.chapters.findIndex((item) => item.id === id);
  const chapter = props.page.chapters[index];
  return chapter ? chapterNumber(chapter, index) : '';
}

function committedNumberOfSection(id: string): string {
  for (const [chapterIndex, chapter] of props.page.chapters.entries()) {
    const sectionIndex = chapter.sections.findIndex((item) => item.id === id);
    if (sectionIndex >= 0) return sectionNumber(chapter, chapterIndex, sectionIndex);
  }
  return '';
}

// --- Drag (grips only; each list keeps its own state) ---

const dragBlock = computed(() => (props.busy ? ('busy' as const) : null));

const chapterDrag = useCardDragReorder({
  order: computed(() => props.page.chapters.map((chapter) => chapter.id)),
  blocked: dragBlock,
  onMove: (id, toIndex) => {
    const chapter = props.page.chapters.find((item) => item.id === id);
    if (chapter) emit('place-chapter', chapter, toIndex);
  },
});

/** The chapter whose sections are being dragged; the section order is read from it. */
const dragChapterId = ref<string | null>(null);
const sectionOrder = computed(() => {
  const chapter = props.page.chapters.find((item) => item.id === dragChapterId.value);
  return (chapter?.sections ?? []).map((section) => section.id);
});

const sectionDrag = useCardDragReorder({
  order: sectionOrder,
  blocked: dragBlock,
  onMove: (id, toIndex) => {
    const chapter = props.page.chapters.find((item) => item.id === dragChapterId.value);
    const section = chapter?.sections.find((item) => item.id === id);
    if (chapter && section) emit('place-section', chapter, section, toIndex);
  },
});

// --- Keyboard reorder on the same grips (each list keeps its own state) ---

const busyBlock = computed(() => props.busy);

const chapterKb = useKeyboardReorder({
  order: computed(() => props.page.chapters.map((chapter) => chapter.id)),
  blocked: busyBlock,
  label: (id) => `Bab ${committedNumberOfChapter(id)}`,
  noun: 'Bab',
  onMove: (id, toIndex) =>
    new Promise<boolean>((resolve) => {
      const chapter = props.page.chapters.find((item) => item.id === id);
      if (!chapter) {
        resolve(false);
        return;
      }
      emit('place-chapter', chapter, toIndex, resolve);
    }),
});

/** The chapter whose sections are reordered from the keyboard; its section order is read from it. */
const keyboardChapterId = ref<string | null>(null);
const keyboardSectionOrder = computed(() => {
  const chapter = props.page.chapters.find((item) => item.id === keyboardChapterId.value);
  return (chapter?.sections ?? []).map((section) => section.id);
});

const sectionKb = useKeyboardReorder({
  order: keyboardSectionOrder,
  blocked: busyBlock,
  label: (id) => `Bagian ${committedNumberOfSection(id)}`,
  noun: 'Bagian',
  onMove: (id, toIndex) =>
    new Promise<boolean>((resolve) => {
      // The chapter or section may have gone (deleted or moved elsewhere) since the pick-up.
      const chapter = props.page.chapters.find((item) => item.id === keyboardChapterId.value);
      const section = chapter?.sections.find((item) => item.id === id);
      if (!chapter || !section) {
        resolve(false);
        return;
      }
      emit('place-section', chapter, section, toIndex, resolve);
    }),
  // Once a keyboard move ends, the list stops following the chapter it was taken from.
  onFinish: () => {
    keyboardChapterId.value = null;
  },
});

/** The chapters in the order to show (a keyboard move previews its new place). */
const chaptersShown = computed(() =>
  chapterKb.arrange(props.page.chapters, (chapter) => chapter.id),
);

function sectionsShown(chapter: AdminChapter): AdminSection[] {
  return sectionKb.arrange(chapter.sections, (section) => section.id);
}

/** Keyboard pick-up of a section: the list it belongs to is the one that gets the order. */
function sectionKeydown(event: KeyboardEvent, chapter: AdminChapter, section: AdminSection): void {
  if (!sectionKb.carriedKey.value) keyboardChapterId.value = chapter.id;
  sectionKb.onGripKeydown(event, section.id);
}

function startSectionDrag(chapter: AdminChapter, section: AdminSection): void {
  dragChapterId.value = chapter.id;
  sectionDrag.startDrag(section.id);
}

/** A section dropped on a row of its own chapter; a drop from another chapter is ignored. */
function dropSection(chapter: AdminChapter, section: AdminSection, event: DragEvent): void {
  if (dragChapterId.value === chapter.id) sectionDrag.dropOn(section.id, edgeAt(event));
}

function endDrag(): void {
  chapterDrag.clearDrag();
  sectionDrag.clearDrag();
}

/** Drags are only accepted over a valid target, so the browser shows the drop as allowed. */
function allowDrop(event: DragEvent): void {
  event.preventDefault();
}

function chapterEdge(chapter: AdminChapter, edge: 'before' | 'after'): boolean {
  if (chapterKb.edgeOf(chapter.id) === edge) return true;
  return (
    chapterDrag.dropTarget.value?.key === chapter.id && chapterDrag.dropTarget.value.edge === edge
  );
}

function sectionEdge(
  chapter: AdminChapter,
  section: AdminSection,
  edge: 'before' | 'after',
): boolean {
  if (sectionKb.edgeOf(section.id) === edge) return true;
  return (
    dragChapterId.value === chapter.id &&
    sectionDrag.dropTarget.value?.key === section.id &&
    sectionDrag.dropTarget.value.edge === edge
  );
}

/** Closes the disclosure a menu item sits in, so the next action starts from a closed menu. */
function closeMenu(event: Event): void {
  (event.currentTarget as HTMLElement).closest('details')?.removeAttribute('open');
}
</script>

<template>
  <nav aria-labelledby="cerita-pohon-judul" class="space-y-1" data-test="structure-tree">
    <h3
      id="cerita-pohon-judul"
      class="text-text-muted px-1.5 pb-2 text-[13px] font-bold tracking-[0.06em] uppercase"
    >
      Struktur cerita
    </h3>

    <button
      :id="ceritaIds.pageDetails"
      type="button"
      class="hover:bg-surface-muted focus-visible:outline-focus-ring rounded-btn text-brand-navy flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
      :disabled="busy"
      data-test="info-button"
      @click="emit('info')"
    >
      <span class="flex-1">Info cerita</span>
      <span class="text-text-muted text-[12px]">Judul, penulis</span>
    </button>

    <div class="bg-border mx-1.5 my-2 h-px" aria-hidden="true"></div>

    <p
      v-if="page.chapters.length === 0"
      class="rounded-card border-border-strong text-text-muted border border-dashed p-4 text-sm"
      data-test="chapter-empty"
    >
      Halaman ini belum memiliki bab. Pilih “Tambah bab” untuk memulai.
    </p>

    <ol v-else class="space-y-2" data-test="chapter-list">
      <li
        v-for="(chapter, chapterIndex) in chaptersShown"
        :key="chapter.id"
        class="relative"
        :class="{
          'border-brand-navy border-t-2': chapterEdge(chapter, 'before'),
          'border-brand-navy border-b-2': chapterEdge(chapter, 'after'),
        }"
        data-test="chapter-item"
        @dragover="
          (event) => {
            allowDrop(event);
            if (chapterDrag.dragKey.value) chapterDrag.hoverDrop(chapter.id, edgeAt(event));
          }
        "
        @drop.prevent="chapterDrag.dropOn(chapter.id, edgeAt($event))"
      >
        <div
          class="rounded-btn flex items-stretch gap-0.5"
          :class="
            chapterKb.isCarried(chapter.id) ? 'ring-brand-navy bg-white shadow-md ring-2' : ''
          "
        >
          <ReorderGripButton
            :id="ceritaIds.treeChapterGrip(chapter.id)"
            :label="`Pindahkan bab ${chapterNumber(chapter, chapterIndex)}: ${chapter.title}`"
            :data-text="chapter.title"
            :disabled="busy"
            :carried="chapterKb.isCarried(chapter.id)"
            @drag-start="chapterDrag.startDrag(chapter.id)"
            @drag-end="endDrag"
            @keydown="chapterKb.onGripKeydown($event, chapter.id)"
            @blur="chapterKb.onGripBlur($event, chapter.id)"
          />
          <button
            :id="ceritaIds.treeChapter(chapter.id)"
            type="button"
            class="hover:bg-surface-muted focus-visible:outline-focus-ring rounded-btn flex min-h-11 min-w-0 flex-1 items-start gap-2 px-1 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
            :class="
              overviewChapterId === chapter.id
                ? 'bg-selected shadow-[inset_4px_0_0_var(--color-brand-navy)]'
                : ''
            "
            :aria-expanded="isOpen(chapter) ? 'true' : 'false'"
            :aria-controls="`cerita-pohon-bab-panel-${chapter.id}`"
            :aria-current="overviewChapterId === chapter.id ? 'true' : undefined"
            data-test="chapter-toggle"
            @click="
              toggle(chapter);
              emit('select-chapter', chapter);
            "
          >
            <span
              aria-hidden="true"
              class="text-text-muted mt-[3px] flex h-5 w-4 shrink-0 items-center justify-center"
            >
              <ChevronDownIcon v-if="isOpen(chapter)" class="h-4 w-4" />
              <ChevronRightIcon v-else class="h-4 w-4" />
            </span>
            <span class="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-2">
              <span
                class="text-brand-navy min-w-0 text-sm font-bold break-words"
                data-test="chapter-title"
              >
                {{ chapterLabel(chapter, chapterIndex) }}
              </span>
              <span
                class="shrink-0 text-[12px]"
                :class="chapter.sections.length === 0 ? 'text-status-warning' : 'text-text-muted'"
                data-test="chapter-meta"
              >
                {{
                  chapter.sections.length === 0
                    ? 'Belum ada bagian'
                    : `${chapter.sections.length} bagian`
                }}
              </span>
            </span>
          </button>
          <details class="relative flex shrink-0 items-stretch" data-test="chapter-menu">
            <summary
              class="hover:bg-surface-muted focus-visible:outline-focus-ring text-text-muted hover:text-brand-navy rounded-btn flex min-h-11 w-11 cursor-pointer list-none items-center justify-center text-[18px] focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden"
              :aria-label="`Pilihan untuk ${chapterLabel(chapter, chapterIndex)}`"
            >
              <span aria-hidden="true">⋯</span>
            </summary>
            <div
              class="border-border rounded-card absolute top-full right-0 z-10 mt-1 grid w-56 gap-1 border bg-white p-2 shadow-md"
            >
              <BaseButton
                :id="ceritaIds.chapterRename(chapter.id)"
                type="button"
                variant="ghost"
                size="md"
                class="min-h-11 justify-start text-sm"
                :disabled="busy"
                data-test="chapter-rename"
                @click="
                  closeMenu($event);
                  emit('rename-chapter', chapter);
                "
              >
                Ubah judul
              </BaseButton>
              <BaseButton
                :id="ceritaIds.chapterDelete(chapter.id)"
                type="button"
                variant="danger"
                size="md"
                class="min-h-11 justify-start text-sm"
                :disabled="busy"
                @click="
                  closeMenu($event);
                  emit('delete-chapter', chapter);
                "
              >
                Hapus bab
              </BaseButton>
            </div>
          </details>
        </div>

        <div
          v-if="isOpen(chapter)"
          :id="`cerita-pohon-bab-panel-${chapter.id}`"
          class="mt-0.5 space-y-1 pl-[34px]"
        >
          <ol
            v-if="chapter.sections.length > 0"
            class="space-y-0.5"
            :aria-label="`Bagian dari ${chapterLabel(chapter, chapterIndex)}`"
          >
            <li
              v-for="(section, sectionIndex) in sectionsShown(chapter)"
              :key="section.id"
              class="rounded-btn relative"
              :class="{
                'border-brand-navy border-t-2': sectionEdge(chapter, section, 'before'),
                'border-brand-navy border-b-2': sectionEdge(chapter, section, 'after'),
              }"
              data-test="section-item"
              @dragover="
                (event) => {
                  allowDrop(event);
                  if (dragChapterId === chapter.id)
                    sectionDrag.hoverDrop(section.id, edgeAt(event));
                }
              "
              @drop.prevent="dropSection(chapter, section, $event)"
            >
              <div
                class="rounded-btn flex items-stretch gap-0.5"
                :class="[
                  selectedSectionId === section.id
                    ? 'bg-selected font-semibold shadow-[inset_4px_0_0_var(--color-brand-navy)]'
                    : '',
                  sectionKb.isCarried(section.id)
                    ? 'ring-brand-navy bg-white shadow-md ring-2'
                    : '',
                ]"
              >
                <ReorderGripButton
                  :id="ceritaIds.treeSectionGrip(section.id)"
                  :label="`Pindahkan bagian ${sectionNumber(chapter, chapterIndex, sectionIndex)}: ${sectionLabel(section, chapter.sections.indexOf(section))}`"
                  :data-text="sectionLabel(section, chapter.sections.indexOf(section))"
                  :disabled="busy"
                  :carried="sectionKb.isCarried(section.id)"
                  @drag-start="startSectionDrag(chapter, section)"
                  @drag-end="endDrag"
                  @keydown="sectionKeydown($event, chapter, section)"
                  @blur="sectionKb.onGripBlur($event, section.id)"
                />
                <button
                  :id="ceritaIds.treeSection(section.id)"
                  type="button"
                  class="hover:bg-surface-muted focus-visible:outline-focus-ring rounded-btn flex min-h-11 min-w-0 flex-1 items-center gap-2 px-1 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
                  :aria-current="selectedSectionId === section.id ? 'true' : undefined"
                  data-test="section-select"
                  @click="emit('select-section', chapter, section)"
                >
                  <span
                    class="text-text-muted w-7 shrink-0 text-[12px] font-semibold tabular-nums"
                    :class="selectedSectionId === section.id ? 'text-brand-navy' : ''"
                  >
                    {{ sectionNumber(chapter, chapterIndex, sectionIndex) }}
                  </span>
                  <span class="text-brand-navy min-w-0 flex-1 truncate text-sm font-medium">
                    {{ sectionLabel(section, chapter.sections.indexOf(section)) }}
                  </span>
                  <span
                    class="flex shrink-0 items-center gap-1 text-[12px] font-medium whitespace-nowrap"
                    :class="
                      figureSummary(section.id).empty
                        ? 'text-status-warning'
                        : selectedSectionId === section.id
                          ? 'text-brand-navy'
                          : 'text-text-muted'
                    "
                    data-test="section-figure"
                  >
                    <ExclamationTriangleIcon
                      v-if="figureSummary(section.id).empty"
                      class="h-3.5 w-3.5"
                      aria-hidden="true"
                    />{{ figureSummary(section.id).label }}
                  </span>
                </button>
                <details class="relative flex shrink-0 items-stretch" data-test="section-menu">
                  <summary
                    class="hover:bg-surface-muted focus-visible:outline-focus-ring text-text-muted hover:text-brand-navy rounded-btn flex min-h-11 w-11 cursor-pointer list-none items-center justify-center text-[18px] focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden"
                    :aria-label="`Pilihan untuk bagian ${sectionNumber(chapter, chapterIndex, sectionIndex)} ${sectionLabel(section, chapter.sections.indexOf(section))}`"
                  >
                    <span aria-hidden="true">⋯</span>
                  </summary>
                  <div
                    class="border-border rounded-card absolute top-full right-0 z-10 mt-1 grid w-56 gap-1 border bg-white p-2 shadow-md"
                  >
                    <BaseButton
                      :id="ceritaIds.sectionRename(section.id)"
                      type="button"
                      variant="ghost"
                      size="md"
                      class="min-h-11 justify-start text-sm"
                      :disabled="busy"
                      data-test="section-rename"
                      @click="
                        closeMenu($event);
                        emit('rename-section', chapter, section);
                      "
                    >
                      Ubah judul
                    </BaseButton>
                    <BaseButton
                      :id="ceritaIds.sectionDelete(section.id)"
                      type="button"
                      variant="danger"
                      size="md"
                      class="min-h-11 justify-start text-sm"
                      :disabled="busy"
                      @click="
                        closeMenu($event);
                        emit('delete-section', chapter, section);
                      "
                    >
                      Hapus bagian
                    </BaseButton>
                  </div>
                </details>
              </div>
            </li>
          </ol>

          <BaseButton
            :id="ceritaIds.addSection(chapter.id)"
            type="button"
            variant="ghost"
            size="md"
            class="text-brand-navy min-h-11 w-full justify-start text-sm"
            :disabled="busy"
            data-test="section-add"
            @click="emit('add-section', chapter)"
          >
            <template #leftIcon>
              <PlusIcon class="h-4 w-4" aria-hidden="true" />
            </template>
            Tambah bagian
            <span class="sr-only">pada {{ chapterLabel(chapter, chapterIndex) }}</span>
          </BaseButton>
        </div>
      </li>
    </ol>

    <p
      v-if="page.chapters.length > 0"
      class="text-text-muted mt-4 px-2 text-[13px] leading-relaxed"
      data-test="drag-hint"
    >
      Seret ikon titik-titik untuk mengubah urutan bab atau bagian. Dari keyboard, fokus ikon itu,
      tekan Spasi, lalu panah atas atau bawah, dan Spasi lagi untuk menjatuhkan.
    </p>
    <span class="sr-only" role="status" aria-live="polite" data-test="chapter-reorder-status">{{
      chapterKb.announcement.value
    }}</span>
    <span class="sr-only" role="status" aria-live="polite" data-test="section-reorder-status">{{
      sectionKb.announcement.value
    }}</span>

    <button
      :id="ceritaIds.addChapter"
      type="button"
      class="border-border-strong text-brand-navy hover:bg-surface-muted focus-visible:outline-focus-ring rounded-btn mt-3 flex min-h-11 w-full items-center justify-center gap-2 border-2 border-dashed text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      :disabled="busy"
      data-test="chapter-add"
      @click="emit('add-chapter')"
    >
      <PlusIcon class="h-4 w-4" aria-hidden="true" />
      Tambah bab
    </button>
  </nav>
</template>
