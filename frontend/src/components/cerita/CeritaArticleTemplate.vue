<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { CeritaArticle } from '../../types/ceritaArticle';
import CeritaHero from './CeritaHero.vue';
import ChapterToc from './ChapterToc.vue';
import ArticleFigure from './ArticleFigure.vue';
import SectionProse from './SectionProse.vue';
import { READER_GRID, READER_MAIN } from './readerLayout';

/**
 * The article layout of a Cerita page, driven only by a `CeritaArticle` (no stores, no requests):
 * a page holds chapters, a chapter holds sections, a section has one heading, its paragraphs and
 * optionally one figure. Navy title band, the article in the middle column, the chapter list on the
 * right (a bar at the bottom on phones), and a "Bab berikutnya" link at the end of each chapter.
 * It is fed mockup data in development only (`/cerita/contoh`); the live reader (`CeritaPageView`)
 * uses the same figure components but also shows indicators and tables.
 */
const props = defineProps<{ article: CeritaArticle }>();

const activeChapterId = ref<string | null>(props.article.chapters[0]?.id ?? null);

// Highlights the chapter being read: the last chapter to start inside the band under the header.
let observer: IntersectionObserver | null = null;
onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') return;
  const header =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--public-header-height'),
    ) *
      (getComputedStyle(document.documentElement)
        .getPropertyValue('--public-header-height')
        .trim()
        .endsWith('rem')
        ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
        : 1) || 80;
  const top = Math.round(header + 16);
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting);
      if (visible.length === 0) return;
      const first = visible.reduce((a, b) =>
        a.boundingClientRect.top > b.boundingClientRect.top ? a : b,
      );
      const id = first.target.getAttribute('data-chapter-id');
      if (id) activeChapterId.value = id;
    },
    { rootMargin: `-${top}px 0px -60% 0px` },
  );
  for (const chapter of props.article.chapters) {
    const el = document.getElementById(chapter.slug);
    if (el) {
      el.setAttribute('data-chapter-id', chapter.id);
      observer.observe(el);
    }
  }
});
onBeforeUnmount(() => observer?.disconnect());

function nextChapter(index: number) {
  return props.article.chapters[index + 1] ?? null;
}
</script>

<template>
  <div class="cerita-reader" data-test="cerita-article">
    <CeritaHero
      :title="article.title"
      :headline="article.headline"
      :byline="article.byline"
      :chapter-count="article.chapters.length"
    />

    <div>
      <div :class="[READER_GRID, 'pb-16']">
        <ChapterToc
          v-if="article.chapters.length > 1"
          variant="rail"
          :chapters="article.chapters"
          :active-chapter-id="activeChapterId"
          @navigate="activeChapterId = $event"
        />

        <div :class="[READER_MAIN, 'cerita-reader-content divide-border divide-y']">
          <section
            v-for="(chapter, chapterIndex) in article.chapters"
            :id="chapter.slug"
            :key="chapter.id"
            class="scroll-mt-[calc(var(--public-header-height)+1rem)] py-10 lg:scroll-mt-[calc(var(--public-header-height)+1.5rem)]"
            data-test="article-chapter"
          >
            <h2 class="text-brand-navy flex items-baseline gap-3 text-lg font-semibold">
              <span v-if="chapter.number" class="text-text-muted text-base tabular-nums">{{
                chapter.number
              }}</span>
              {{ chapter.title }}
            </h2>

            <div
              v-for="section in chapter.sections"
              :key="section.id"
              class="mt-8 space-y-4"
              data-test="article-section"
            >
              <h3 class="text-brand-navy text-base font-semibold">{{ section.heading }}</h3>
              <SectionProse
                v-for="(paragraph, i) in section.paragraphs"
                :key="i"
                :body="paragraph"
              />
              <ArticleFigure v-if="section.figure" :figure="section.figure" />
            </div>

            <p v-if="nextChapter(chapterIndex)" class="mt-10" data-test="article-next-chapter">
              <a
                :href="`#${nextChapter(chapterIndex)!.slug}`"
                class="text-brand-navy focus-visible:outline-focus-ring inline-flex items-center gap-2 text-base font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                @click="activeChapterId = nextChapter(chapterIndex)!.id"
              >
                Bab berikutnya: {{ nextChapter(chapterIndex)!.title }}
                <span aria-hidden="true">→</span>
              </a>
            </p>
          </section>
        </div>
      </div>

      <!-- Phones: the chapter bar sits at the bottom of the reader and ends with it, so it never
           lies over the footer. -->
      <ChapterToc
        v-if="article.chapters.length > 1"
        variant="sheet"
        placement="bottom"
        :chapters="article.chapters"
        :active-chapter-id="activeChapterId"
        @navigate="activeChapterId = $event"
      />
    </div>
  </div>
</template>
