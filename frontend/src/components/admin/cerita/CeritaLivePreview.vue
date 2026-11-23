<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import ArticleFigure from '../../cerita/ArticleFigure.vue';
import SectionProse from '../../cerita/SectionProse.vue';
import { useStoredFigurePreview } from '../../../composables/useStoredFigurePreview';
import type { ArticleFigure as ArticleFigureData } from '../../../types/ceritaArticle';

/**
 * "Pratinjau langsung": the selected section as the public reader draws it, from the SAVED data
 * (paragraphs and figure). Unsaved edits are not reflected here; each editor keeps its own Simpan.
 * The paragraphs use the public `SectionProse` and the figure the public `ArticleFigure`, so the
 * preview cannot drift from the site. Photos load through the authenticated client (blob URLs).
 */
const props = defineProps<{
  sectionTitle: string;
  /** Stored paragraph bodies, in order (limited Markdown). */
  paragraphs: string[];
  /** The stored figure of the section, mapped for the reader; null when it has none. */
  figure: ArticleFigureData | null;
}>();

const mode = ref<'desktop' | 'phone'>('desktop');
const preview = useStoredFigurePreview(toRef(props, 'figure'));
const isEmpty = computed(() => props.paragraphs.length === 0 && props.figure === null);
</script>

<template>
  <section aria-labelledby="cerita-pratinjau-judul" class="space-y-3" data-test="live-preview">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 id="cerita-pratinjau-judul" class="text-brand-navy text-base font-semibold">
        Pratinjau langsung
      </h3>
      <div role="group" aria-label="Ukuran pratinjau" class="border-border inline-flex rounded-btn border bg-white p-0.5">
        <button
          type="button"
          class="focus-visible:outline-focus-ring min-h-11 rounded-btn px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          :class="mode === 'desktop' ? 'bg-brand-navy text-white' : 'text-brand-navy hover:bg-surface-muted'"
          :aria-pressed="mode === 'desktop' ? 'true' : 'false'"
          data-test="preview-desktop"
          @click="mode = 'desktop'"
        >
          Desktop
        </button>
        <button
          type="button"
          class="focus-visible:outline-focus-ring min-h-11 rounded-btn px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          :class="mode === 'phone' ? 'bg-brand-navy text-white' : 'text-brand-navy hover:bg-surface-muted'"
          :aria-pressed="mode === 'phone' ? 'true' : 'false'"
          data-test="preview-phone"
          @click="mode = 'phone'"
        >
          Ponsel
        </button>
      </div>
    </div>
    <p class="text-text-muted text-xs">Menampilkan isi yang sudah disimpan.</p>

    <div class="bg-surface-muted rounded-card p-3">
      <div
        class="mx-auto w-full transition-[max-width] duration-150"
        :class="mode === 'phone' ? 'max-w-[375px]' : 'max-w-full'"
        data-test="preview-frame"
        :data-mode="mode"
      >
        <article
          aria-labelledby="cerita-pratinjau-artikel"
          class="rounded-card border-border space-y-4 border bg-white p-4"
        >
          <h4 id="cerita-pratinjau-artikel" class="text-brand-navy text-lg font-semibold break-words">
            {{ sectionTitle }}
          </h4>

          <p v-if="isEmpty" class="text-text-muted text-sm" data-test="preview-empty">
            Bagian ini belum memiliki paragraf atau gambar yang disimpan.
          </p>

          <SectionProse v-for="(body, index) in paragraphs" :key="index" :body="body" />

          <div v-if="figure" class="space-y-2" data-test="preview-figure">
            <p v-if="figure.kind === 'chart'" class="text-text-muted text-sm">
              Grafik “{{ figure.title }}” ditampilkan dari tabel indikator di situs.
            </p>
            <p v-else-if="preview.loading.value" class="text-text-muted text-sm" role="status">
              Memuat gambar…
            </p>
            <ArticleFigure v-else-if="preview.figure.value" :figure="preview.figure.value" />
            <p
              v-if="preview.unavailable.value"
              class="text-text-muted text-sm"
              role="status"
              data-test="preview-figure-unavailable"
            >
              Gambar belum bisa ditampilkan pada pratinjau. Situs tetap menampilkannya bila berkas
              tersedia.
            </p>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>
