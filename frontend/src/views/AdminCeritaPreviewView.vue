<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import ArticleFigure from '../components/cerita/ArticleFigure.vue';
import SectionProse from '../components/cerita/SectionProse.vue';
import { READER_MAIN } from '../components/cerita/readerLayout';
import type { ArticleFigure as ArticleFigureData, ChartTable } from '../types/ceritaArticle';
import {
  PREVIEW_MESSAGE,
  isTrustedMessage,
  parsePreviewPayload,
  type CeritaPreviewPayload,
} from '../utils/ceritaPreviewMessage';

/**
 * The bare page the section editor's live preview draws in a same-origin iframe (no admin shell,
 * no public header). It draws a section the way the public reader does: `SectionProse` for the
 * body and `ArticleFigure` for the figure, on the reader's column. The iframe's own width is what
 * the reader's media queries read, so Desktop and Ponsel really differ.
 *
 * The draft arrives by `postMessage` from the editor. Only a message from this window's parent and
 * from our own origin is read, and only a well-formed payload is kept. The page reports its ready
 * state and its height back to the parent. Everything inside is `inert`: it is a picture of the
 * draft, and the fields in the editor stay the only place to type.
 */

const origin = window.location.origin;
const payload = ref<CeritaPreviewPayload | null>(null);
const figureVisible = ref(false);
const root = ref<HTMLElement | null>(null);
let observer: ResizeObserver | null = null;

/** Accepts a draft only from the parent window of the same origin, and only when well formed. */
function onMessage(event: MessageEvent): void {
  if (window.parent === window) return;
  if (!isTrustedMessage(event, window.parent, origin)) return;
  const next = parsePreviewPayload(event.data);
  if (next) payload.value = next;
}

function postToParent(message: Record<string, unknown>): void {
  if (window.parent === window) return;
  window.parent.postMessage(message, origin);
}

function reportHeight(): void {
  const element = root.value;
  if (!element) return;
  postToParent({
    type: PREVIEW_MESSAGE.height,
    height: element.getBoundingClientRect().height,
  });
}

onMounted(() => {
  window.addEventListener('message', onMessage);
  postToParent({ type: PREVIEW_MESSAGE.ready });
  if (root.value && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(reportHeight);
    observer.observe(root.value);
  }
  reportHeight();
});

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage);
  observer?.disconnect();
  observer = null;
});

const title = computed(() => payload.value?.title.trim() ?? '');
const body = computed(() => payload.value?.body.trim() ?? '');
const figure = computed<ArticleFigureData | null>(() => payload.value?.figure ?? null);
const tables = computed<Record<string, ChartTable>>(() => payload.value?.tables ?? {});
const showsFigure = computed(() => figure.value !== null && figureVisible.value);
const isEmpty = computed(() => body.value === '' && !showsFigure.value);
</script>

<template>
  <main ref="root" class="bg-white text-brand-navy" data-test="preview-root" inert>
    <div
      class="bg-surface-muted border-border flex items-center gap-2 border-b px-3 py-2"
      data-test="preview-sitebar"
    >
      <span aria-hidden="true" class="bg-border-strong h-5 w-5 shrink-0 rounded"></span>
      <div class="min-w-0 leading-tight">
        <p class="text-text-muted truncate text-[10px]">Kelurahan Cinta Statistik</p>
        <p class="text-brand-navy truncate text-xs font-bold">Kelurahan Manggar</p>
      </div>
      <p
        v-if="payload?.chapterLabel"
        class="text-brand-navy ml-auto max-w-[55%] shrink-0 truncate rounded-full bg-white px-2 py-0.5 text-[11px]"
        data-test="preview-chapter"
      >
        {{ payload.chapterLabel }}
      </p>
    </div>

    <article :class="[READER_MAIN, 'space-y-5 px-4 py-6 sm:px-6']" data-test="preview-article">
      <h1 class="text-brand-navy text-lg font-bold break-words" data-test="preview-title">
        {{ title || 'Judul bagian belum diisi' }}
      </h1>

      <SectionProse v-if="body" :body="body" />

      <div
        v-if="figure"
        v-show="figureVisible"
        class="bg-surface-muted rounded-card p-4 sm:p-6"
        data-test="preview-stage"
      >
        <ArticleFigure :figure="figure" :tables="tables" @visible-change="figureVisible = $event" />
      </div>

      <p v-if="isEmpty" class="text-text-muted text-base" data-test="preview-empty">
        Bagian ini belum memiliki isi atau gambar.
      </p>
    </article>
  </main>
</template>
