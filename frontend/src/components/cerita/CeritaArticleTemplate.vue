<script setup lang="ts">
import { ref } from 'vue';
import type { CeritaArticle } from '../../types/ceritaArticle';
import CeritaHero from './CeritaHero.vue';
import ChapterToc from './ChapterToc.vue';
import ArticleBlocks from './ArticleBlocks.vue';
import { READER_GRID, READER_MAIN } from './readerLayout';

/**
 * The article layout of a Cerita page, driven only by a `CeritaArticle` (no stores, no requests):
 * navy title band, the article in the middle column, the chapter list on the right. Wave 4 builds
 * the `article` from stored content and passes it in; until then it is fed dummy data in
 * development only (`/cerita/contoh`).
 */
const props = defineProps<{ article: CeritaArticle }>();

const activeChapterId = ref<string | null>(props.article.chapters[0]?.id ?? null);
</script>

<template>
  <div class="cerita-reader pb-16" data-test="cerita-article">
    <CeritaHero
      :title="article.title"
      :headline="article.headline"
      :byline="article.byline"
      :chapter-count="article.chapters.length"
    />

    <div>
      <ChapterToc
        v-if="article.chapters.length > 1"
        variant="sheet"
        :chapters="article.chapters"
        :active-chapter-id="activeChapterId"
        @navigate="activeChapterId = $event"
      />

      <div :class="READER_GRID">
        <ChapterToc
          v-if="article.chapters.length > 1"
          variant="rail"
          :chapters="article.chapters"
          :active-chapter-id="activeChapterId"
          @navigate="activeChapterId = $event"
        />

        <div :class="[READER_MAIN, 'cerita-reader-content divide-border divide-y']">
          <section
            v-for="chapter in article.chapters"
            :id="chapter.slug"
            :key="chapter.id"
            class="scroll-mt-[calc(var(--public-header-height)+4.5rem)] space-y-4 py-10 lg:scroll-mt-[calc(var(--public-header-height)+1.5rem)]"
            data-test="article-chapter"
          >
            <h2 class="text-brand-navy flex items-baseline gap-3 text-lg font-semibold">
              <span v-if="chapter.number" class="text-text-muted text-base tabular-nums">{{
                chapter.number
              }}</span>
              {{ chapter.title }}
            </h2>
            <ArticleBlocks :blocks="chapter.blocks" />
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
