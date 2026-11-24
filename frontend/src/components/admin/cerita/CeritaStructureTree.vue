<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  PlusIcon,
} from '@heroicons/vue/24/outline';
import BaseButton from '../../common/BaseButton.vue';
import CardDragGrip from '../cards/CardDragGrip.vue';
import { useCardDragReorder } from '../../../composables/useCardDragReorder';
import { edgeAt } from '../../../composables/useCardDragReorder';
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
 * button (Ubah judul, Naik, Turun, Hapus) inside a native disclosure, so keyboard and touch never
 * need drag. Dragging a grip reorders chapters within the page, or sections within their chapter
 * (cross-chapter moves are in the section's options through the move dialog).
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
  (e: 'move-chapter', chapter: AdminChapter, direction: -1 | 1): void;
  (e: 'delete-chapter', chapter: AdminChapter): void;
  (e: 'place-chapter', chapter: AdminChapter, toIndex: number): void;
  (e: 'rename-section', chapter: AdminChapter, section: AdminSection): void;
  (e: 'move-section', chapter: AdminChapter, section: AdminSection, direction: -1 | 1): void;
  (e: 'delete-section', chapter: AdminChapter, section: AdminSection): void;
  (e: 'place-section', chapter: AdminChapter, section: AdminSection, toIndex: number): void;
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

function chapterNumber(index: number): string {
  return chapterNumberLabel(props.page.chapters[index]?.number, index);
}

function sectionNumber(chapterIndex: number, sectionIndex: number): string {
  return sectionNumberLabel(chapterNumber(chapterIndex), sectionIndex);
}

function sectionLabel(section: AdminSection, sectionIndex: number): string {
  return section.title?.trim() ? section.title : `Bagian ${sectionIndex + 1}`;
}

function chapterLabel(chapter: AdminChapter, chapterIndex: number): string {
  return `Bab ${chapterNumber(chapterIndex)} · ${chapter.title}`;
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
  return (
    chapterDrag.dropTarget.value?.key === chapter.id && chapterDrag.dropTarget.value.edge === edge
  );
}

function sectionEdge(
  chapter: AdminChapter,
  section: AdminSection,
  edge: 'before' | 'after',
): boolean {
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
        v-for="(chapter, chapterIndex) in page.chapters"
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
        <div class="rounded-btn flex items-stretch gap-0.5">
          <CardDragGrip
            :blocked="dragBlock"
            :data-text="chapter.title"
            sort-label="Pilihan bab"
            @drag-start="chapterDrag.startDrag(chapter.id)"
            @drag-end="endDrag"
          />
          <button
            :id="ceritaIds.treeChapter(chapter.id)"
            type="button"
            class="hover:bg-surface-muted focus-visible:outline-focus-ring rounded-btn flex min-h-11 min-w-0 flex-1 items-start gap-2 px-1 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
            :class="
              overviewChapterId === chapter.id ? 'bg-selected border-l-brand-navy border-l-4' : ''
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
                :id="ceritaIds.chapterUp(chapter.id)"
                type="button"
                variant="ghost"
                size="md"
                class="min-h-11 justify-start text-sm"
                :disabled="busy || chapterIndex === 0"
                @click="
                  closeMenu($event);
                  emit('move-chapter', chapter, -1);
                "
              >
                Naik
              </BaseButton>
              <BaseButton
                :id="ceritaIds.chapterDown(chapter.id)"
                type="button"
                variant="ghost"
                size="md"
                class="min-h-11 justify-start text-sm"
                :disabled="busy || chapterIndex === page.chapters.length - 1"
                @click="
                  closeMenu($event);
                  emit('move-chapter', chapter, 1);
                "
              >
                Turun
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
          <p
            v-if="chapter.sections.length === 0"
            class="text-text-muted px-1 py-2 text-sm"
            data-test="section-empty"
          >
            Belum ada bagian.
          </p>

          <ol
            v-else
            class="space-y-0.5"
            :aria-label="`Bagian dari ${chapterLabel(chapter, chapterIndex)}`"
          >
            <li
              v-for="(section, sectionIndex) in chapter.sections"
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
                :class="
                  selectedSectionId === section.id
                    ? 'bg-selected border-l-brand-navy border-l-4 font-semibold'
                    : ''
                "
              >
                <CardDragGrip
                  :blocked="dragBlock"
                  :data-text="sectionLabel(section, sectionIndex)"
                  sort-label="Pilihan bagian"
                  @drag-start="startSectionDrag(chapter, section)"
                  @drag-end="endDrag"
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
                    {{ sectionNumber(chapterIndex, sectionIndex) }}
                  </span>
                  <span class="text-brand-navy min-w-0 flex-1 truncate text-sm font-medium">
                    {{ sectionLabel(section, sectionIndex) }}
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
                    :aria-label="`Pilihan untuk bagian ${sectionNumber(chapterIndex, sectionIndex)} ${sectionLabel(section, sectionIndex)}`"
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
                      :id="ceritaIds.sectionUp(section.id)"
                      type="button"
                      variant="ghost"
                      size="md"
                      class="min-h-11 justify-start text-sm"
                      :disabled="busy || sectionIndex === 0"
                      @click="
                        closeMenu($event);
                        emit('move-section', chapter, section, -1);
                      "
                    >
                      Naik
                    </BaseButton>
                    <BaseButton
                      :id="ceritaIds.sectionDown(section.id)"
                      type="button"
                      variant="ghost"
                      size="md"
                      class="min-h-11 justify-start text-sm"
                      :disabled="busy || sectionIndex === chapter.sections.length - 1"
                      @click="
                        closeMenu($event);
                        emit('move-section', chapter, section, 1);
                      "
                    >
                      Turun
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
      Seret ikon titik-titik untuk mengubah urutan bab atau bagian. Pilihan “Naik” dan “Turun” di
      menu ⋯ melakukan hal yang sama dari keyboard.
    </p>

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
