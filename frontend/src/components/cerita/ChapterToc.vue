<script setup lang="ts">
import { ref } from 'vue';

export interface TocChapter {
  id: string;
  slug: string;
  number: string | null;
  title: string;
}

export interface ChapterTocProps {
  chapters: TocChapter[];
  activeChapterId: string | null;
  /** 'rail' = persistent desktop sidebar. 'sheet' = mobile sticky bar that expands into a list. */
  variant: 'rail' | 'sheet';
}

const props = defineProps<ChapterTocProps>();
const emit = defineEmits<{ navigate: [chapterId: string] }>();

const isSheetOpen = ref(false);

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
</script>

<template>
  <nav
    v-if="variant === 'rail'"
    class="sticky top-24 hidden max-h-[calc(100vh-7rem)] w-56 shrink-0 overflow-y-auto lg:block"
    aria-label="Daftar Bab"
    data-test="chapter-toc-rail"
  >
    <ol class="space-y-1 border-l border-slate-200">
      <li v-for="chapter in chapters" :key="chapter.id">
        <a
          :href="`#${chapter.slug}`"
          class="-ml-px flex items-start gap-2.5 border-l-2 py-1.5 pl-4 text-sm transition-colors"
          :class="
            chapter.id === activeChapterId
              ? 'border-brand-cyan text-brand-navy font-semibold'
              : 'border-transparent text-slate-500 hover:text-brand-navy'
          "
          :aria-current="chapter.id === activeChapterId ? 'true' : undefined"
          data-test="chapter-toc-link"
          @click="handleSelect(chapter.id)"
        >
          <span v-if="chapter.number" class="text-xs tabular-nums">{{ chapter.number }}</span>
          <span>{{ chapter.title }}</span>
        </a>
      </li>
    </ol>
  </nav>

  <div v-else class="fixed right-0 bottom-0 left-0 z-30 lg:hidden" data-test="chapter-toc-sheet">
    <div
      v-show="isSheetOpen"
      id="chapter-toc-sheet-panel"
      class="max-h-[60vh] overflow-y-auto border-t border-slate-200 bg-white shadow-lg"
      data-test="chapter-toc-sheet-panel"
    >
      <ol class="divide-y divide-slate-100">
        <li v-for="chapter in chapters" :key="chapter.id">
          <a
            :href="`#${chapter.slug}`"
            class="flex items-center gap-3 px-4 py-3 text-sm"
            :class="chapter.id === activeChapterId ? 'text-brand-navy font-semibold' : 'text-slate-600'"
            :aria-current="chapter.id === activeChapterId ? 'true' : undefined"
            data-test="chapter-toc-link"
            @click="handleSelect(chapter.id)"
          >
            <span
              v-if="chapter.number"
              class="bg-brand-navy/5 text-brand-navy flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs tabular-nums"
            >
              {{ chapter.number }}
            </span>
            <span>{{ chapter.title }}</span>
          </a>
        </li>
      </ol>
    </div>

    <button
      type="button"
      class="border-brand-navy/10 bg-brand-navy flex w-full items-center justify-between gap-3 border-t px-4 py-3 text-left text-white"
      :aria-expanded="isSheetOpen"
      aria-controls="chapter-toc-sheet-panel"
      data-test="chapter-toc-trigger"
      @click="toggleSheet"
    >
      <span class="flex min-w-0 items-center gap-2.5">
        <span
          v-if="activeChapter()?.number"
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs tabular-nums"
        >
          {{ activeChapter()?.number }}
        </span>
        <span class="truncate text-sm font-semibold">
          {{ activeChapter()?.title ?? 'Daftar Bab' }}
        </span>
      </span>
      <svg
        class="h-4 w-4 shrink-0 transition-transform"
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
  </div>
</template>
