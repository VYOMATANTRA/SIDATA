<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { usePagesStore } from '../stores/pages.store';
import { useIndicatorsStore, type IndicatorDto } from '../stores/indicators.store';
import { useIndicatorTablesStore, type IndicatorTableDetailDto } from '../stores/indicatorTables.store';
import { useContentBlocksStore } from '../stores/contentBlocks.store';
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

const proseBySectionId = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {};
  for (const block of Object.values(contentBlocksStore.blocks)) {
    if (block.type === 'prose' && block.sectionId) {
      map[block.sectionId] = block.body;
    }
  }
  return map;
});

const indicatorsBySectionId = computed<Record<string, IndicatorDto[]>>(
  () => indicatorsStore.bySectionId,
);
const tablesBySectionId = computed<Record<string, IndicatorTableDetailDto[]>>(
  () => indicatorTablesStore.bySectionId,
);

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
  if (typeof IntersectionObserver === 'undefined' || !page.value) return;

  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting);
      if (visible.length === 0) return;
      const topMost = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
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

  if (!activeChapterId.value && page.value.chapters.length > 0) {
    activeChapterId.value = page.value.chapters[0]!.id;
  }
}

function handleNavigate(chapterId: string) {
  activeChapterId.value = chapterId;
}

function retryLoad() {
  loadPage();
}

async function loadPage() {
  isLoading.value = true;
  observer?.disconnect();

  const [loadedPage] = await Promise.all([
    pagesStore.fetchPageBySlug(slug.value),
    contentBlocksStore.fetchBlocks(),
  ]);

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

  isLoading.value = false;
  await nextTick();
  setupScrollSpy();
}

onMounted(loadPage);
watch(slug, loadPage);
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div class="flex min-h-screen flex-col bg-white">
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-xl focus:bg-brand-navy focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
    >
      Lewati ke konten utama
    </a>

    <main id="main-content" class="grow pb-24 lg:pb-12">
      <div v-if="isLoading" class="mx-auto max-w-3xl px-4 py-16 sm:px-6" data-test="cerita-loading">
        <div class="h-8 w-2/3 animate-pulse rounded-md bg-slate-200" />
        <div class="mt-4 h-4 w-full animate-pulse rounded-md bg-slate-100" />
      </div>

      <div
        v-else-if="notFound"
        class="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6"
        data-test="cerita-not-found"
      >
        <h1 class="text-lg font-semibold text-slate-900">Halaman tidak ditemukan</h1>
        <p class="mt-2 text-sm text-slate-600">
          Halaman yang Anda cari tidak tersedia. Periksa kembali tautan yang Anda gunakan.
        </p>
      </div>

      <div
        v-else-if="pagesStore.error"
        class="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6"
        data-test="cerita-error"
      >
        <h1 class="text-lg font-semibold text-slate-900">Gagal memuat halaman</h1>
        <p class="mt-2 text-sm text-slate-600">
          Terjadi kesalahan saat memuat data. Periksa koneksi Anda dan coba lagi.
        </p>
        <button
          type="button"
          class="bg-brand-navy mt-5 rounded-btn px-4 py-2 text-sm font-semibold text-white"
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

          <div class="min-w-0 flex-1 divide-y divide-slate-100">
            <ChapterSection
              v-for="chapter in page.chapters"
              :key="chapter.id"
              :chapter="chapter"
              :prose-by-section-id="proseBySectionId"
              :indicators-by-section-id="indicatorsBySectionId"
              :tables-by-section-id="tablesBySectionId"
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
    </main>
  </div>
</template>
