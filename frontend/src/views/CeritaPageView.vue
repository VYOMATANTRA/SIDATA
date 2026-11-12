<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { usePagesStore } from '../stores/pages.store';
import { useIndicatorsStore, type IndicatorDto } from '../stores/indicators.store';
import {
  useIndicatorTablesStore,
  type IndicatorTableDetailDto,
} from '../stores/indicatorTables.store';
import { useContentBlocksStore, type ContentBlock } from '../stores/contentBlocks.store';
import BaseButton from '../components/common/BaseButton.vue';
import ChapterToc, { type TocChapter } from '../components/cerita/ChapterToc.vue';
import ChapterSection from '../components/cerita/ChapterSection.vue';
import CeritaHero from '../components/cerita/CeritaHero.vue';
import CeritaLoadingState from '../components/cerita/CeritaLoadingState.vue';
import CeritaStatePanel from '../components/cerita/CeritaStatePanel.vue';
import { READER_GRID, READER_MAIN } from '../components/cerita/readerLayout';

/**
 * Public reader of one Cerita topic (SPEC §8, "Cerita reader"). PublicLayout supplies the skip
 * link, header, `<main id="main-content">` and footer; this view renders only the page content and
 * is always in exactly one of four states: loading, not found, failed (retry) or ready.
 */
const route = useRoute();
const pagesStore = usePagesStore();
const indicatorsStore = useIndicatorsStore();
const indicatorTablesStore = useIndicatorTablesStore();
const contentBlocksStore = useContentBlocksStore();

type ReaderState = 'loading' | 'ready' | 'not-found' | 'error';

const state = ref<ReaderState>('loading');
// The slug `state` was resolved for. A route change moves `slug` first, so for that moment the
// view reports `loading` instead of showing the previous topic's page, error or "not found".
const resolvedSlug = ref<string | null>(null);
const activeChapterId = ref<string | null>(null);
const isRetryingProse = ref(false);

const slug = computed(() => String(route.params['slug'] ?? ''));
const viewState = computed<ReaderState>(() =>
  resolvedSlug.value === slug.value ? state.value : 'loading',
);
const page = computed(() =>
  viewState.value === 'ready' ? (pagesStore.pagesBySlug[slug.value] ?? null) : null,
);
const errorMessage = computed(
  () =>
    pagesStore.errorsBySlug[slug.value] ??
    'Terjadi kendala saat memuat halaman. Periksa koneksi Anda lalu coba lagi.',
);

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

// The prose blocks come from one request for the whole site. If it failed, a section without
// figures is "unknown", not "empty", so the page says so once and the sections stay quiet.
const proseUnavailable = computed(
  () => Boolean(contentBlocksStore.error) && !contentBlocksStore.isLoaded,
);

const tocChapters = computed<TocChapter[]>(
  () =>
    page.value?.chapters?.map((chapter) => ({
      id: chapter.id,
      slug: chapter.slug,
      number: chapter.number,
      title: chapter.title,
    })) ?? [],
);

const hasAnyContent = computed(() =>
  (page.value?.chapters ?? []).some((chapter) =>
    (chapter.sections ?? []).some(
      (section) =>
        (proseBySectionId.value[section.id]?.length ?? 0) > 0 ||
        (indicatorsBySectionId.value[section.id]?.length ?? 0) > 0 ||
        (tablesBySectionId.value[section.id]?.length ?? 0) > 0 ||
        Boolean(sectionErrorsBySectionId.value[section.id]),
    ),
  ),
);
const showPageEmptyNotice = computed(() => !hasAnyContent.value && !proseUnavailable.value);

// ---- Scroll spy -------------------------------------------------------------------------------

/** Space between the header (and the mobile selector under it) and the first readable line. */
const SPY_TOP_GAP_PX = 16;
const SPY_MIN_BAND_PX = 48;

const tocSheetRef = ref<InstanceType<typeof ChapterToc> | null>(null);
let observer: IntersectionObserver | null = null;
let resizeTimer: ReturnType<typeof setTimeout> | null = null;

function readHeaderHeightPx(): number {
  if (typeof document === 'undefined') return 0;
  const root = document.documentElement;
  const raw = getComputedStyle(root).getPropertyValue('--public-header-height').trim();
  const value = parseFloat(raw);
  if (Number.isFinite(value)) {
    if (raw.endsWith('rem')) return value * (parseFloat(getComputedStyle(root).fontSize) || 16);
    return value;
  }
  return document.querySelector('header')?.getBoundingClientRect().height ?? 0;
}

/**
 * rootMargin for the spy, in px so it follows the real header and the mobile selector (which is
 * display:none, so 0px, from `lg` up). The active band starts right under the sticky UI and is at
 * least SPY_MIN_BAND_PX tall even on a short landscape viewport; a zero-height band would never
 * intersect anything.
 */
function spyRootMargin(): string {
  const viewport = typeof window === 'undefined' ? 0 : window.innerHeight;
  const selectorEl = tocSheetRef.value?.$el as HTMLElement | undefined;
  const selectorHeight = selectorEl?.getBoundingClientRect?.().height ?? 0;
  const top = Math.round(readHeaderHeightPx() + selectorHeight + SPY_TOP_GAP_PX);
  const bandBottom = Math.max(top + SPY_MIN_BAND_PX, viewport * 0.4);
  const bottom = Math.max(0, Math.round(viewport - bandBottom));
  return `-${top}px 0px -${bottom}px 0px`;
}

function setupScrollSpy() {
  observer?.disconnect();
  observer = null;
  const current = page.value;
  if (!current) return;

  // Runs unconditionally (ahead of the IntersectionObserver feature check below) so the
  // first/current chapter is still highlighted in environments without IntersectionObserver
  // support, not only once the user scrolls.
  if (!activeChapterId.value && current.chapters.length > 0) {
    activeChapterId.value = current.chapters[0]!.id;
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
    { rootMargin: spyRootMargin() },
  );

  for (const chapter of current.chapters) {
    const el = document.getElementById(chapter.slug);
    if (el) {
      el.setAttribute('data-chapter-id', chapter.id);
      observer.observe(el);
    }
  }
}

// The band depends on the viewport (rotation, browser toolbars), so rebuild it after a resize.
function handleResize() {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resizeTimer = null;
    if (viewState.value === 'ready') setupScrollSpy();
  }, 150);
}

function handleNavigate(chapterId: string) {
  activeChapterId.value = chapterId;
}

// ---- Loading ----------------------------------------------------------------------------------

// Bumped by every load. Each load compares its own number after every await, so a response that
// settles after the reader moved on (another topic, or the same one reloaded) is discarded
// instead of clobbering the state of the page actually in view.
let loadToken = 0;

function retryLoad() {
  void loadPage();
}

async function loadPage() {
  const token = ++loadToken;
  const requestedSlug = slug.value;
  const isCurrent = () => token === loadToken && slug.value === requestedSlug;

  state.value = 'loading';
  // Reset here, not just left to setupScrollSpy's fallback: that fallback only fires when
  // activeChapterId is still falsy, so without this a stale id from the previous Cerita page
  // would survive the navigation and never get highlighted in the new page's chapter list.
  activeChapterId.value = null;
  observer?.disconnect();

  const [loadedPage] = await Promise.all([
    pagesStore.fetchPageBySlug(requestedSlug),
    contentBlocksStore.fetchBlocks(),
  ]);

  if (!isCurrent()) return;

  if (!loadedPage) {
    // A 200 without a page is as unusable as a failure; never fall through to a blank view.
    resolvedSlug.value = requestedSlug;
    state.value = pagesStore.notFoundBySlug[requestedSlug] ? 'not-found' : 'error';
    return;
  }

  await Promise.allSettled(
    (loadedPage.chapters ?? []).flatMap((chapter) =>
      (chapter.sections ?? []).flatMap((section) => [
        indicatorsStore.fetchBySectionId(section.id),
        indicatorTablesStore.fetchBySectionId(section.id),
      ]),
    ),
  );

  if (!isCurrent()) return;

  resolvedSlug.value = requestedSlug;
  state.value = 'ready';
  await nextTick();
  if (!isCurrent()) return;
  setupScrollSpy();
  scrollToHashTarget();
}

async function retrySection(sectionId: string) {
  await Promise.allSettled([
    indicatorsStore.fetchBySectionId(sectionId, true),
    indicatorTablesStore.fetchBySectionId(sectionId, true),
  ]);
}

async function retryProse() {
  if (isRetryingProse.value) return;
  isRetryingProse.value = true;
  try {
    await contentBlocksStore.fetchBlocks(true);
  } finally {
    isRetryingProse.value = false;
  }
}

// Remembers the last slug+hash scrolled to so retry/reload of the same anchor does not snap the
// user back to the anchor once they have scrolled elsewhere.
let lastScrolledSlugHash: string | null = null;

// A `/cerita/x#bab` deep link resolves before the chapters exist (the page is still a skeleton
// when the router scrolls), so the router finds no target. Once the chapters render, honour the
// hash here. Uses native scrollIntoView so the element's own `scroll-margin-top` clears the header
// and, below `lg`, the chapter selector.
function scrollToHashTarget(): boolean {
  if (!route.hash) return false;
  const currentPair = `${slug.value}${route.hash}`;
  if (lastScrolledSlugHash === currentPair) return false;
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
    // Highlight the chapter the link points at right away rather than waiting for the observer.
    const target = page.value?.chapters.find((chapter) => chapter.slug === id);
    if (target) activeChapterId.value = target.id;
    return true;
  }
  return false;
}

onMounted(() => {
  window.addEventListener('resize', handleResize, { passive: true });
  void loadPage();
});
watch(slug, () => {
  lastScrolledSlugHash = null;
  void loadPage();
});
watch(
  () => route.hash,
  () => {
    scrollToHashTarget();
  },
);
onBeforeUnmount(() => {
  loadToken += 1;
  observer?.disconnect();
  window.removeEventListener('resize', handleResize);
  if (resizeTimer) clearTimeout(resizeTimer);
});

defineExpose({ retryLoad, loadPage });
</script>

<template>
  <!-- PublicLayout supplies the skip link, header, <main id="main-content"> and footer. -->
  <div class="cerita-reader pb-16">
    <CeritaLoadingState v-if="viewState === 'loading'" />

    <CeritaStatePanel
      v-else-if="viewState === 'not-found'"
      title="Halaman tidak ditemukan"
      message="Halaman yang Anda cari tidak tersedia. Periksa kembali tautan yang Anda gunakan."
      data-test="cerita-not-found"
    >
      <RouterLink
        to="/"
        class="rounded-btn border-brand-navy text-brand-navy hover:bg-brand-navy focus-visible:ring-focus-ring focus-visible:ring-offset-surface inline-flex items-center justify-center border-2 px-4 py-2 text-sm font-medium transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        data-test="cerita-home-link"
      >
        Kembali ke Beranda
      </RouterLink>
    </CeritaStatePanel>

    <CeritaStatePanel
      v-else-if="viewState === 'error'"
      title="Gagal memuat halaman"
      :message="errorMessage"
      alert
      data-test="cerita-error"
    >
      <BaseButton size="md" data-test="cerita-retry" @click="retryLoad">Coba lagi</BaseButton>
    </CeritaStatePanel>

    <template v-else-if="page">
      <CeritaHero :title="page.title" :chapter-count="page.chapters.length" />

      <div v-if="proseUnavailable || showPageEmptyNotice" :class="[READER_GRID, 'pt-8']">
        <div :class="READER_MAIN">
          <div
            v-if="proseUnavailable"
            class="rounded-card border-status-error-border bg-status-error-surface text-status-error flex flex-wrap items-center justify-between gap-3 border px-4 py-3 text-sm"
            role="alert"
            data-test="cerita-prose-error"
          >
            <p>Teks pada halaman ini belum dapat dimuat.</p>
            <button
              type="button"
              class="rounded-btn border-status-error focus-visible:outline-focus-ring min-h-9 border bg-white px-3 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed"
              :disabled="isRetryingProse"
              data-test="cerita-prose-retry"
              @click="retryProse"
            >
              Coba lagi
            </button>
          </div>
          <p
            v-else
            class="rounded-card border-border bg-surface-muted text-text-muted border px-4 py-3 text-base"
            data-test="cerita-page-empty"
          >
            Belum ada konten yang dapat ditampilkan pada halaman ini.
          </p>
        </div>
      </div>

      <!-- The sticky mobile selector lives in this wrapper so it can never reach the footer. -->
      <div>
        <ChapterToc
          v-if="tocChapters.length > 0"
          ref="tocSheetRef"
          variant="sheet"
          :chapters="tocChapters"
          :active-chapter-id="activeChapterId"
          @navigate="handleNavigate"
        />

        <div :class="READER_GRID">
          <ChapterToc
            v-if="tocChapters.length > 0"
            variant="rail"
            :chapters="tocChapters"
            :active-chapter-id="activeChapterId"
            @navigate="handleNavigate"
          />

          <div :class="[READER_MAIN, 'cerita-reader-content divide-border divide-y']">
            <ChapterSection
              v-for="chapter in page.chapters"
              :key="chapter.id"
              :chapter="chapter"
              :prose-by-section-id="proseBySectionId"
              :indicators-by-section-id="indicatorsBySectionId"
              :tables-by-section-id="tablesBySectionId"
              :section-errors-by-section-id="sectionErrorsBySectionId"
              :prose-unavailable="proseUnavailable"
              @retry-section="retrySection"
            />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style>
/*
 * Below `lg` the chapter selector sticks under the header, so a control that keyboard focus
 * scrolls into view must stop below both. Scoped to the chapter content (not the selector, which
 * is itself stuck) and low-specificity so an element's own scroll-margin still wins.
 */
@media (max-width: 63.999rem) {
  .cerita-reader-content :where(a[href], button, summary, [tabindex]) {
    scroll-margin-top: calc(var(--public-header-height) + 4.5rem);
  }
}
</style>
