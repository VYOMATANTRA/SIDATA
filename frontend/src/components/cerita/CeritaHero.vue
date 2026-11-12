<script setup lang="ts">
import { useId } from 'vue';
import { RouterLink } from 'vue-router';
import type { ArticleByline } from '../../types/ceritaArticle';
import { READER_GRID, READER_MAIN } from './readerLayout';

/**
 * Navy title band of a Cerita topic page. The public header above it is navy as well, so the two
 * read as one region. It shows only what the data already holds (the topic title and how many
 * chapters it has); no introduction copy is written here.
 */
withDefaults(
  defineProps<{
    title: string;
    /** Number of chapters on the page; the count line is omitted when it is 0. */
    chapterCount?: number;
    /**
     * Editorial headline. When given it becomes the page heading and the topic title moves into
     * the eyebrow. No source supplies one yet (Wave 4).
     */
    headline?: string;
    /** Optional authorship line under the heading. No source supplies one yet (Wave 4). */
    byline?: ArticleByline;
  }>(),
  { chapterCount: 0, headline: undefined, byline: undefined },
);

const titleId = useId();
</script>

<template>
  <section
    class="bg-surface-inverse border-t border-white/15 py-8 sm:py-12"
    :aria-labelledby="titleId"
    data-test="cerita-hero"
  >
    <div :class="READER_GRID">
      <div :class="READER_MAIN">
        <RouterLink
          to="/"
          class="focus-visible:outline-focus-ring-inverse rounded-btn -ml-1 inline-flex min-h-9 items-center gap-1.5 px-1 text-sm font-medium text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          aria-label="Kembali ke Beranda"
          data-test="cerita-back"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          Kembali
        </RouterLink>
        <p class="text-text-inverse-muted mt-4 text-sm font-medium tracking-[0.2em] uppercase">
          {{ headline ? `Cerita · ${title}` : 'Cerita' }}
        </p>
        <h1 :id="titleId" class="mt-2 text-lg break-words text-white sm:text-xl">
          {{ headline || title }}
        </h1>
        <p v-if="byline" class="mt-3 text-base text-white" data-test="cerita-byline">
          Oleh {{ byline.author
          }}<span v-if="byline.affiliation" class="text-text-inverse-muted block text-sm">{{
            byline.affiliation
          }}</span>
        </p>
        <p
          v-if="chapterCount > 0"
          class="text-text-inverse-muted mt-3 text-base"
          data-test="cerita-hero-meta"
        >
          {{ chapterCount }} bab
        </p>
      </div>
    </div>
  </section>
</template>
