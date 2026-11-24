<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue';
import { useStoredFigurePreview } from '../../../composables/useStoredFigurePreview';
import type { ArticleFigure as ArticleFigureData } from '../../../types/ceritaArticle';
import {
  PREVIEW_MESSAGE,
  PREVIEW_ROUTE,
  isPreviewReady,
  isTrustedMessage,
  parsePreviewHeight,
  type CeritaPreviewPayload,
} from '../../../utils/ceritaPreviewMessage';

/**
 * "Pratinjau langsung": the section as the reader draws it, from the editor's UNSAVED draft. The
 * draft is posted to a same-origin iframe of `PREVIEW_ROUTE`, which renders it with the public
 * `SectionProse` and `ArticleFigure` at its own viewport width, so the reader's media queries apply.
 *
 * Desktop: the iframe is 1280px wide, scaled down to the column. Ponsel: the iframe is 390px wide
 * at real size (scaled only if the column is narrower), inside a phone-shaped frame. The height
 * follows the content the iframe reports. Photos load through the authenticated client and reach
 * the iframe as blob URLs (`useStoredFigurePreview`), so unsaved uploads show too.
 */
const props = defineProps<{
  sectionTitle: string;
  /** The section's body as typed (limited Markdown, paragraphs separated by a blank line). */
  body: string;
  chapterLabel: string;
  /** The figure the figure editor's draft would show, with `/api/media/<id>` photo addresses. */
  figure: ArticleFigureData | null;
}>();

type PreviewMode = 'desktop' | 'phone';

const DESKTOP_WIDTH = 1280;
const PHONE_WIDTH = 390;
/** Padding and border of the phone frame, on both sides together. */
const PHONE_FRAME_EXTRA = 26;
const DEFAULT_HEIGHT = 480;
const DEBOUNCE_MS = 150;

const mode = ref<PreviewMode>('desktop');
const host = ref<HTMLElement | null>(null);
const frame = ref<HTMLIFrameElement | null>(null);
const hostWidth = ref(0);
const contentHeight = ref(DEFAULT_HEIGHT);

const origin = window.location.origin;
const preview = useStoredFigurePreview(toRef(props, 'figure'));

const scale = computed(() => {
  if (mode.value === 'desktop') return hostWidth.value > 0 ? hostWidth.value / DESKTOP_WIDTH : 1;
  if (hostWidth.value <= 0) return 1;
  return Math.min(1, (hostWidth.value - PHONE_FRAME_EXTRA) / PHONE_WIDTH);
});
const frameWidth = computed(() => (mode.value === 'desktop' ? DESKTOP_WIDTH : PHONE_WIDTH));
const stageWidth = computed(() => frameWidth.value * scale.value);
const stageHeight = computed(() => contentHeight.value * scale.value);
const outerWidth = computed(() =>
  mode.value === 'phone' ? stageWidth.value + PHONE_FRAME_EXTRA : stageWidth.value,
);

// --- Sending the draft ---

let timer: ReturnType<typeof setTimeout> | null = null;

/** The draft as a structured-cloneable payload (reactive proxies are copied out first). */
function payload(): CeritaPreviewPayload & { type: string } {
  return JSON.parse(
    JSON.stringify({
      type: PREVIEW_MESSAGE.data,
      title: props.sectionTitle,
      body: props.body,
      chapterLabel: props.chapterLabel,
      figure: preview.figure.value,
      tables: preview.tables.value,
    }),
  );
}

function sendNow(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  frame.value?.contentWindow?.postMessage(payload(), origin);
}

function scheduleSend(): void {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    sendNow();
  }, DEBOUNCE_MS);
}

// Any change to what the preview draws (text, figure, its photos or charts) is sent after a short
// pause, so a burst of typing makes one message.
watch(
  () => [
    props.sectionTitle,
    props.body,
    props.chapterLabel,
    preview.figure.value,
    preview.tables.value,
  ],
  scheduleSend,
);

// --- Receiving from the preview ---

function onMessage(event: MessageEvent): void {
  if (!isTrustedMessage(event, frame.value?.contentWindow ?? null, origin)) return;
  if (isPreviewReady(event.data)) {
    sendNow();
    return;
  }
  const height = parsePreviewHeight(event.data);
  if (height !== null) contentHeight.value = height;
}

let observer: ResizeObserver | null = null;

onMounted(() => {
  window.addEventListener('message', onMessage);
  if (host.value) {
    hostWidth.value = host.value.clientWidth;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver((entries) => {
        hostWidth.value = entries[0]?.contentRect.width ?? 0;
      });
      observer.observe(host.value);
    }
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage);
  observer?.disconnect();
  observer = null;
  if (timer !== null) clearTimeout(timer);
  timer = null;
});

const modes: ReadonlyArray<{ value: PreviewMode; label: string; test: string }> = [
  { value: 'desktop', label: 'Desktop', test: 'preview-desktop' },
  { value: 'phone', label: 'Ponsel', test: 'preview-phone' },
];
</script>

<template>
  <section aria-label="Pratinjau langsung" class="space-y-3" data-test="live-preview">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-brand-navy hidden text-base font-semibold min-[1536px]:block">
        Pratinjau langsung
      </h3>
      <div
        role="group"
        aria-label="Ukuran pratinjau"
        class="border-border rounded-btn inline-flex border bg-white p-0.5"
      >
        <button
          v-for="option in modes"
          :key="option.value"
          type="button"
          class="focus-visible:outline-focus-ring rounded-btn min-h-11 px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          :class="
            mode === option.value ? 'bg-brand-navy text-white' : 'text-brand-navy hover:bg-surface-muted'
          "
          :aria-pressed="mode === option.value ? 'true' : 'false'"
          :data-test="option.test"
          @click="mode = option.value"
        >
          {{ option.label }}
        </button>
      </div>
    </div>
    <p class="text-text-muted text-xs">
      Pratinjau memperbarui diri saat Anda mengetik. Perubahan tampil di situs setelah Simpan
      perubahan.
    </p>

    <div ref="host" class="bg-surface-muted rounded-card p-3" data-test="preview-host">
      <div
        class="mx-auto"
        :class="
          mode === 'phone' ? 'border-border-strong rounded-[1.75rem] border bg-white p-3' : undefined
        "
        :style="{ width: `${outerWidth}px`, maxWidth: '100%' }"
        :data-mode="mode"
        data-test="preview-frame"
      >
        <div
          class="relative mx-auto overflow-hidden bg-white"
          :style="{ width: `${stageWidth}px`, height: `${stageHeight}px` }"
          data-test="preview-stage-box"
        >
          <iframe
            ref="frame"
            :src="PREVIEW_ROUTE"
            title="Pratinjau bagian"
            tabindex="-1"
            class="absolute top-0 left-0 border-0 bg-white"
            :style="{
              width: `${frameWidth}px`,
              height: `${contentHeight}px`,
              transform: `scale(${scale})`,
              transformOrigin: '0 0',
            }"
            data-test="preview-iframe"
          ></iframe>
        </div>
      </div>
    </div>

    <p v-if="preview.loading.value" class="text-text-muted text-sm" role="status">
      Memuat gambar…
    </p>
    <p
      v-else-if="preview.unavailable.value"
      class="text-text-muted text-sm"
      role="status"
      data-test="preview-figure-unavailable"
    >
      Gambar belum bisa ditampilkan pada pratinjau. Situs tetap menampilkannya bila berkas tersedia.
    </p>
  </section>
</template>
