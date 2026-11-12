<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import { READER_ASIDE } from './readerLayout';

export interface TocChapter {
  id: string;
  slug: string;
  number: string | null;
  title: string;
}

export interface ChapterTocProps {
  chapters: TocChapter[];
  activeChapterId: string | null;
  /**
   * 'rail' = persistent desktop list in the right-hand column, beside the article (from `lg`).
   * 'sheet' = mobile selector: a navy bar that sticks just under the public header and opens a
   * list of chapters beneath it (below `lg`).
   */
  variant: 'rail' | 'sheet';
}

const props = defineProps<ChapterTocProps>();
const emit = defineEmits<{ navigate: [chapterId: string] }>();

const isSheetOpen = ref(false);
const panelId = useId();
const rootRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLButtonElement | null>(null);

function activeChapter(): TocChapter | null {
  return props.chapters.find((chapter) => chapter.id === props.activeChapterId) ?? null;
}

function handleSelect(chapterId: string) {
  isSheetOpen.value = false;
  emit('navigate', chapterId);
}

function toggleSheet() {
  isSheetOpen.value = !isSheetOpen.value;
}

function closeSheet(restoreFocus: boolean) {
  if (!isSheetOpen.value) return;
  isSheetOpen.value = false;
  if (restoreFocus) void nextTick(() => triggerRef.value?.focus());
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isSheetOpen.value) {
    event.stopPropagation();
    closeSheet(true);
  }
}

// Keyboard: tabbing out of the open list dismisses it instead of leaving it covering the page.
function handleFocusOut(event: FocusEvent) {
  const next = event.relatedTarget;
  if (isSheetOpen.value && next instanceof Node && !rootRef.value?.contains(next)) {
    isSheetOpen.value = false;
  }
}

// Pointer: a press anywhere outside the selector dismisses it (this also covers opening the
// navigation menu, so only one primary overlay is ever open).
function handleOutsidePointer(event: Event) {
  if (event.target instanceof Node && !rootRef.value?.contains(event.target)) {
    isSheetOpen.value = false;
  }
}

watch(isSheetOpen, (open) => {
  if (typeof document === 'undefined') return;
  if (open) {
    document.addEventListener('pointerdown', handleOutsidePointer);
  } else {
    document.removeEventListener('pointerdown', handleOutsidePointer);
  }
});

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') {
    document.removeEventListener('pointerdown', handleOutsidePointer);
  }
});
</script>

<template>
  <nav
    v-if="variant === 'rail'"
    :class="[
      READER_ASIDE,
      'sticky top-[calc(var(--public-header-height)+1.5rem)] hidden max-h-[calc(100dvh-var(--public-header-height)-3rem)] w-full max-w-60 self-start overflow-y-auto py-10 lg:block',
    ]"
    aria-label="Daftar Bab"
    data-test="chapter-toc-rail"
  >
    <p class="text-brand-navy mb-3 px-3 text-sm font-semibold">Daftar bab</p>
    <ol class="space-y-1">
      <li v-for="chapter in chapters" :key="chapter.id">
        <a
          :href="`#${chapter.slug}`"
          class="rounded-btn focus-visible:outline-focus-ring flex items-start gap-3 px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          :class="
            chapter.id === activeChapterId
              ? 'bg-brand-navy font-semibold text-white'
              : 'text-brand-navy hover:bg-surface-muted'
          "
          :aria-current="chapter.id === activeChapterId ? 'true' : undefined"
          data-test="chapter-toc-link"
          @click="handleSelect(chapter.id)"
        >
          <span v-if="chapter.number" class="shrink-0 tabular-nums">{{ chapter.number }}</span>
          <span class="min-w-0 break-words">{{ chapter.title }}</span>
        </a>
      </li>
    </ol>
  </nav>

  <div
    v-else
    ref="rootRef"
    class="bg-surface-inverse sticky top-[var(--public-header-height)] z-30 border-t border-white/15 lg:hidden"
    data-test="chapter-toc-sheet"
    @keydown="handleKeydown"
    @focusout="handleFocusOut"
  >
    <button
      ref="triggerRef"
      type="button"
      class="focus-visible:outline-focus-ring-inverse flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left text-white focus-visible:outline-2 focus-visible:-outline-offset-2 sm:px-6"
      :aria-expanded="isSheetOpen"
      :aria-controls="panelId"
      data-test="chapter-toc-trigger"
      @click="toggleSheet"
    >
      <span class="flex min-w-0 items-baseline gap-2.5">
        <span class="text-text-inverse-muted shrink-0 text-sm">Daftar bab</span>
        <span class="truncate text-sm font-semibold" data-test="chapter-toc-current">
          <template v-if="activeChapter()">
            <span v-if="activeChapter()?.number" class="mr-1.5 tabular-nums">{{
              activeChapter()?.number
            }}</span
            >{{ activeChapter()?.title }}
          </template>
        </span>
      </span>
      <svg
        class="h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none"
        :class="{ 'rotate-180': isSheetOpen }"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>

    <nav
      v-show="isSheetOpen"
      :id="panelId"
      aria-label="Pilih bab"
      class="border-border absolute inset-x-0 top-full max-h-[calc(100dvh-var(--public-header-height)-4rem)] overflow-y-auto overscroll-contain border-t bg-white shadow-lg"
      data-test="chapter-toc-sheet-panel"
    >
      <ol class="divide-border divide-y">
        <li v-for="chapter in chapters" :key="chapter.id">
          <a
            :href="`#${chapter.slug}`"
            class="focus-visible:outline-focus-ring flex min-h-12 items-center gap-3 px-4 py-3 text-base focus-visible:outline-2 focus-visible:-outline-offset-2 sm:px-6"
            :class="
              chapter.id === activeChapterId
                ? 'bg-surface-muted text-brand-navy font-semibold'
                : 'text-brand-navy'
            "
            :aria-current="chapter.id === activeChapterId ? 'true' : undefined"
            data-test="chapter-toc-link"
            @click="handleSelect(chapter.id)"
          >
            <span
              v-if="chapter.number"
              class="border-brand-navy flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm tabular-nums"
              :class="
                chapter.id === activeChapterId ? 'bg-brand-navy text-white' : 'text-brand-navy'
              "
            >
              {{ chapter.number }}
            </span>
            <span class="min-w-0 break-words">{{ chapter.title }}</span>
          </a>
        </li>
      </ol>
    </nav>
  </div>
</template>
