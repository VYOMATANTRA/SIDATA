<script setup lang="ts">
import { useId } from 'vue';

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
  }>(),
  { chapterCount: 0 },
);

const titleId = useId();
</script>

<template>
  <section
    class="bg-surface-inverse border-t border-white/15 px-4 py-10 sm:px-6 sm:py-14"
    :aria-labelledby="titleId"
    data-test="cerita-hero"
  >
    <div class="mx-auto max-w-5xl">
      <p class="text-text-inverse-muted text-sm font-medium tracking-[0.2em] uppercase">Cerita</p>
      <h1 :id="titleId" class="mt-2 text-lg break-words text-white sm:text-xl">
        {{ title }}
      </h1>
      <p
        v-if="chapterCount > 0"
        class="text-text-inverse-muted mt-3 text-base"
        data-test="cerita-hero-meta"
      >
        {{ chapterCount }} bab
      </p>
    </div>
  </section>
</template>
