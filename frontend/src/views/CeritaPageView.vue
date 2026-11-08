<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { usePagesStore } from '../stores/pages.store';
import { useIndicatorsStore, type IndicatorDto } from '../stores/indicators.store';
import {
  useIndicatorTablesStore,
  type IndicatorTableDetailDto,
} from '../stores/indicatorTables.store';
import { useContentBlocksStore, type ContentBlock } from '../stores/contentBlocks.store';
import ChapterToc, { type TocChapter } from '../components/cerita/ChapterToc.vue';
import ChapterSection from '../components/cerita/ChapterSection.vue';

const route = useRoute();
const pagesStore = usePagesStore();
const indicatorsStore = useIndicatorsStore();
const indicatorTablesStore = useIndicatorTablesStore();
const contentBlocksStore = useContentBlocksStore();

const isLoading = ref(true);
const activeChapterId = ref<string | null>(null);

const slug = computed(() => String(route.params['slug'] ?? ''));
const page = computed(() => pagesStore.pagesBySlug[slug.value] ?? null);
const notFound = computed(() => pagesStore.notFound && !page.value);
// pagesStore.error is a single shared flag, not keyed per slug — fetchPageBySlug's cache-hit
// path returns before it's ever cleared, so a failed load on one slug can otherwise leave a
// stale error visible after navigating to a different, already-cached slug that loaded fine.
// Guarding on `!page.value` (same pattern as notFound above) means a resolved page always wins.
const hasError = computed(() => Boolean(pagesStore.error) && !page.value);

// Grouped (not last-write-wins) and sorted by sortOrder, since a section can carry more than
// one prose block and editors rely on sort_order to control reading order.
const proseBySectionId = computed<Record<string, ContentBlock[]>>(() => {
  const map: Record<string, ContentBlock[]> = {};
  for (const block of Object.values(contentBlocksStore.blocks)) {
    if (block.type === 'prose' && block.sectionId) {
      (map[block.sectionId] ??= []).push(block);
    }
  }
  for (const blocks of Object.values(map)) {
    blocks.sort((a, b) => {
      const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
      return orderA !== orderB ? orderA - orderB : a.id.localeCompare(b.id);
    });
  }
  return map;
});

const indicatorsBySectionId = computed<Record<string, IndicatorDto[]>>(
  () => indicatorsStore.bySectionId,
);
const tablesBySectionId = computed<Record<string, IndicatorTableDetailDto[]>>(
  () => indicatorTablesStore.bySectionId,
);

const sectionErrorsBySectionId = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {};
  const sectionIds = new Set([
    ...Object.keys(indicatorsStore.errorsBySectionId),
    ...Object.keys(indicatorTablesStore.errorsBySectionId),
  ]);
  for (const sectionId of sectionIds) {
    const messages = [
      indicatorsStore.errorsBySectionId[sectionId],
      indicatorTablesStore.errorsBySectionId[sectionId],
    ].filter((message): message is string => Boolean(message));
    if (messages.length > 0) {
      map[sectionId] = messages.join(' ');
    }
  }
  return map;
});

const tocChapters = computed<TocChapter[]>(
  () =>
    page.value?.chapters.map((chapter) => ({
      id: chapter.id,
      slug: chapter.slug,
      number: chapter.number,
      title: chapter.title,
    })) ?? [],
);

let observer: IntersectionObserver | null = null;

function setupScrollSpy() {
  observer?.disconnect();
  if (!page.value) return;

  // Runs unconditionally (ahead of the IntersectionObserver feature check below) so the
  // first/current chapter is still highlighted in environments without IntersectionObserver
  // support, not only once the user scrolls.
  if (!activeChapterId.value && page.value.chapters.length > 0) {
    activeChapterId.value = page.value.chapters[0]!.id;
  }

  if (typeof IntersectionObserver === 'undefined') return;

  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting);
      if (visible.length === 0) return;
      const topMost = visible.reduce((a, b) =>
        a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
      );
      const id = topMost.target.getAttribute('data-chapter-id');
      if (id) activeChapterId.value = id;
    },
    { rootMargin: '-10% 0px -70% 0px' },
  );

  for (const chapter of page.value.chapters) {
    const el = document.getElementById(chapter.slug);
    if (el) {
      el.setAttribute('data-chapter-id', chapter.id);
      observer.observe(el);
    }
  }
}

function handleNavigate(chapterId: string) {
  activeChapterId.value = chapterId;
}

function retryLoad() {
  loadPage();
}

async function loadPage() {
  // Captured once, compared against the live slug after every await below: if the route moves
  // on to a different Cerita page before this call's requests resolve, its results are stale and
  // must be discarded rather than clobbering isLoading/scroll-spy state for the page actually
  // showing now (e.g. a slow A finishing after a faster B when navigating A -> B quickly).
  const requestedSlug = slug.value;

  isLoading.value = true;
  // Reset here, not just left to setupScrollSpy's fallback: that fallback only fires when
  // activeChapterId is still falsy, so without this a stale id from the previous Cerita page
  // would survive the navigation and never get highlighted in the new page's chapter list.
  activeChapterId.value = null;
  observer?.disconnect();

  const [loadedPage] = await Promise.all([
    pagesStore.fetchPageBySlug(requestedSlug),
    contentBlocksStore.fetchBlocks(),
  ]);

  if (slug.value !== requestedSlug) return;

  if (loadedPage) {
    await Promise.allSettled(
      loadedPage.chapters.flatMap((chapter) =>
        chapter.sections.flatMap((section) => [
          indicatorsStore.fetchBySectionId(section.id),
          indicatorTablesStore.fetchBySectionId(section.id),
        ]),
      ),
    );
  }

  if (slug.value !== requestedSlug) return;

  isLoading.value = false;
  await nextTick();
  setupScrollSpy();
  scrollToHashTarget();
}

// Remembers the last slug+hash scrolled to so retry/reload of the same anchor does not snap the
// user back to the anchor once they have scrolled elsewhere.
let lastScrolledSlugHash: string | null = null;

// A `/cerita/x#bab` deep link resolves before the chapters exist (the page is still a skeleton
// when the router scrolls), so the router finds no target. Once the chapters render, honour the
// hash here. Uses native scrollIntoView so the element's own `scroll-margin-top` clears the header.
function scrollToHashTarget() {
  if (!route.hash) return;
  const currentPair = `${slug.value}${route.hash}`;
  if (lastScrolledSlugHash === currentPair) return;
  let id = route.hash.slice(1);
  try {
    id = decodeURIComponent(id);
  } catch {
    // keep the raw id
  }
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'instant', block: 'start' });
    lastScrolledSlugHash = currentPair;
  }
}

onMounted(loadPage);
watch(slug, () => {
  lastScrolledSlugHash = null;
  loadPage();
});
watch(
  () => route.hash,
  () => {
    scrollToHashTarget();
  },
);
onBeforeUnmount(() => observer?.disconnect());

defineExpose({ retryLoad, loadPage });
</script>

<template>
  <!-- PublicLayout supplies the skip link, header, <main id="main-content"> and footer. -->
  <div class="pb-24 lg:pb-12">
    <div v-if="isLoading" class="mx-auto max-w-3xl px-4 py-16 sm:px-6" data-test="cerita-loading">
      <div class="bg-surface-hover h-8 w-2/3 animate-pulse rounded-md" />
      <div class="bg-surface-muted mt-4 h-4 w-full animate-pulse rounded-md" />
    </div>

    <div
      v-else-if="notFound"
      class="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6"
      data-test="cerita-not-found"
    >
      <h1 class="text-brand-navy text-lg font-semibold">Halaman tidak ditemukan</h1>
      <p class="text-text-muted mt-2 text-sm">
        Halaman yang Anda cari tidak tersedia. Periksa kembali tautan yang Anda gunakan.
      </p>
    </div>

    <div
      v-else-if="hasError"
      class="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6"
      data-test="cerita-error"
    >
      <h1 class="text-brand-navy text-lg font-semibold">Gagal memuat halaman</h1>
      <p class="text-text-muted mt-2 text-sm">
        Terjadi kesalahan saat memuat data. Periksa koneksi Anda dan coba lagi.
      </p>
      <button
        type="button"
        class="bg-brand-navy rounded-btn mt-5 px-4 py-2 text-sm font-semibold text-white"
        data-test="cerita-retry"
        @click="retryLoad"
      >
        Coba lagi
      </button>
    </div>

    <template v-else-if="page">
      <div class="mx-auto max-w-3xl px-4 pt-12 sm:px-6" data-test="cerita-hero">
        <h1 class="text-brand-navy text-xl leading-tight font-bold tracking-tight">
          {{ page.title }}
        </h1>
      </div>

      <div class="mx-auto flex max-w-5xl gap-10 px-4 sm:px-6">
        <ChapterToc
          variant="rail"
          :chapters="tocChapters"
          :active-chapter-id="activeChapterId"
          @navigate="handleNavigate"
        />

        <div class="divide-border min-w-0 flex-1 divide-y">
          <ChapterSection
            v-for="chapter in page.chapters"
            :key="chapter.id"
            :chapter="chapter"
            :prose-by-section-id="proseBySectionId"
            :indicators-by-section-id="indicatorsBySectionId"
            :tables-by-section-id="tablesBySectionId"
            :section-errors-by-section-id="sectionErrorsBySectionId"
          />
        </div>
      </div>

      <ChapterToc
        variant="sheet"
        :chapters="tocChapters"
        :active-chapter-id="activeChapterId"
        @navigate="handleNavigate"
      />
    </template>
  </div>
</template>
