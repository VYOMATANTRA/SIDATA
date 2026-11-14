import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { apiErrorFromResponse, apiRequestJson } from '../utils/apiClient';
import { toUserMessage, type FailureKind } from '../utils/userMessages';

/**
 * Reads the public page → chapter → section hierarchy (SPEC §2).
 *
 * Two consumers, one store:
 * - The Cerita page fetches a single page by slug (`fetchPageBySlug`, `pagesBySlug`) and renders
 *   it. It tracks its own `isLoading` / `error` / `notFound`.
 * - The CMS forms need the reverse lookup: given an `indicator.sectionId`, which page/chapter does
 *   it belong to (for the card kicker and the modal breadcrumb)? `fetchHierarchy` flattens every
 *   page into a section index and keeps its loading/error state separate so the two flows cannot
 *   clobber each other. Sections are the attachment point for indicators and indicator tables, so
 *   this is the only place that knowledge lives on the frontend.
 */

export interface PageSummary {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
  chapterCount: number;
}

export interface SectionSummary {
  id: string;
  slug: string;
  title: string | null;
  sortOrder: number;
  /** The concurrency token for authoring. Carried by every hierarchy read. */
  updatedAt?: string;
}

export interface ChapterDetail {
  id: string;
  slug: string;
  number: string | null;
  title: string;
  sortOrder: number;
  updatedAt?: string;
  sections: SectionSummary[];
}

/**
 * The hierarchy as the CMS needs it: every level carries the `updatedAt` token that a rename,
 * delete or reorder must send. Only the `?include=sections` fetch fills it, and only from pages
 * whose every level has the token, so the admin screen never works from the public per-slug cache.
 */
export interface HierarchySection {
  id: string;
  slug: string;
  title: string | null;
  sortOrder: number;
  updatedAt: string;
}

export interface HierarchyChapter {
  id: string;
  slug: string;
  number: string | null;
  title: string;
  sortOrder: number;
  updatedAt: string;
  sections: HierarchySection[];
}

export interface HierarchyPage {
  id: string;
  slug: string;
  title: string;
  /** Optional editorial headline and byline (SPEC §8); null while not approved. */
  headline: string | null;
  bylineAuthor: string | null;
  bylineAffiliation: string | null;
  sortOrder: number;
  updatedAt: string;
  chapters: HierarchyChapter[];
}

/** Copies a page into the authoring shape, or returns null when any level lacks its token. */
function toHierarchyPage(detail: PageDetail): HierarchyPage | null {
  if (typeof detail.updatedAt !== 'string') return null;
  const chapters: HierarchyChapter[] = [];
  for (const chapter of detail.chapters ?? []) {
    if (typeof chapter.updatedAt !== 'string') return null;
    const sections: HierarchySection[] = [];
    for (const section of chapter.sections ?? []) {
      if (typeof section.updatedAt !== 'string') return null;
      sections.push({
        id: section.id,
        slug: section.slug,
        title: section.title,
        sortOrder: section.sortOrder,
        updatedAt: section.updatedAt,
      });
    }
    chapters.push({
      id: chapter.id,
      slug: chapter.slug,
      number: chapter.number,
      title: chapter.title,
      sortOrder: chapter.sortOrder,
      updatedAt: chapter.updatedAt,
      sections,
    });
  }
  return {
    id: detail.id,
    slug: detail.slug,
    title: detail.title,
    headline: detail.headline ?? null,
    bylineAuthor: detail.bylineAuthor ?? null,
    bylineAffiliation: detail.bylineAffiliation ?? null,
    sortOrder: detail.sortOrder,
    updatedAt: detail.updatedAt,
    chapters,
  };
}

export interface PageDetail {
  id: string;
  slug: string;
  title: string;
  /** Optional editorial headline and byline; absent in older cached responses. */
  headline?: string | null;
  bylineAuthor?: string | null;
  bylineAffiliation?: string | null;
  sortOrder: number;
  chapters: ChapterDetail[];
  createdAt: string;
  updatedAt: string;
}

/** Flattened section with enough ancestry to label it without a second lookup. */
export interface SectionOption {
  sectionId: string;
  sectionTitle: string | null;
  chapterTitle: string;
  pageTitle: string;
  pageSlug: string;
}

/** The public Cerita read names the same shapes `…Dto`; keep both import paths working. */
export type SectionDto = SectionSummary;
export type ChapterDto = ChapterDetail;
export type PageDetailDto = PageDetail;

const NOT_AVAILABLE = 'Tanpa bagian';

export const usePagesStore = defineStore('pages', () => {
  // --- CMS: flattened hierarchy (all pages → sections) ---
  const pages = ref<PageSummary[]>([]);
  const sections = ref<SectionOption[]>([]);
  // The authoring copy of the tree (see `HierarchyPage`), in server order. Filled only by the
  // `?include=sections` fetch; `hierarchyIncomplete` is true when the server sent a page without
  // its tokens, which the admin screen must not work from (a reorder has to name every sibling).
  const hierarchyPages = ref<HierarchyPage[]>([]);
  const hierarchyIncomplete = ref(false);
  const isHierarchyLoading = ref(false);
  const isLoaded = ref(false);
  const hierarchyError = ref<string | null>(null);
  /** Failure class of `hierarchyError`, for AlertBanner; null while it is null. */
  const hierarchyErrorKind = ref<FailureKind | null>(null);

  let hierarchyInFlight: Promise<void> | null = null;
  let hierarchyFollowUp: Promise<void> | null = null;

  // --- Public Cerita: one page by slug ---
  const pagesBySlug = ref<Record<string, PageDetail>>({});
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const notFound = ref(false);
  // Outcome of the latest request per slug. `error` / `notFound` above are single shared flags that
  // the most recent request overwrites; a reader that has moved on to another topic must read its
  // own slug's outcome here instead, so one topic's failure never shows on another.
  const errorsBySlug = ref<Record<string, string>>({});
  const notFoundBySlug = ref<Record<string, boolean>>({});

  function clearSlugOutcome(slug: string): void {
    if (slug in errorsBySlug.value) {
      const next = { ...errorsBySlug.value };
      delete next[slug];
      errorsBySlug.value = next;
    }
    if (slug in notFoundBySlug.value) {
      const next = { ...notFoundBySlug.value };
      delete next[slug];
      notFoundBySlug.value = next;
    }
  }

  const inFlight: Record<string, Promise<PageDetail | null> | undefined> = {};

  const sectionById = computed(() => {
    const map = new Map<string, SectionOption>();
    for (const section of sections.value) {
      map.set(section.sectionId, section);
    }
    return map;
  });

  /**
   * Breadcrumb parts for a section, page title first. The chapter is the meaningful second
   * level in the mockups ("Kependudukan > Jumlah Penduduk"); a section title is only
   * appended when the section actually has one, since sections are allowed a null title.
   */
  function breadcrumbParts(sectionId: string | null | undefined): string[] {
    if (!sectionId) return [];
    const option = sectionById.value.get(sectionId);
    if (!option) return [];
    return [
      option.pageTitle,
      option.chapterTitle,
      ...(option.sectionTitle ? [option.sectionTitle] : []),
    ];
  }

  function pageTitleFor(sectionId: string | null | undefined): string | null {
    if (!sectionId) return null;
    return sectionById.value.get(sectionId)?.pageTitle ?? null;
  }

  function labelFor(sectionId: string | null | undefined): string {
    const parts = breadcrumbParts(sectionId);
    return parts.length > 0 ? parts.join(' > ') : NOT_AVAILABLE;
  }

  async function fetchHierarchy(force = false): Promise<void> {
    if (isLoaded.value && !force) return;
    // "Busy" also covers a queued follow-up: between the running request finishing and its
    // follow-up starting nothing is in flight, and a forced caller arriving then must join the
    // follow-up rather than start a second, parallel request that could answer last.
    if (hierarchyInFlight || hierarchyFollowUp) {
      if (!force) return hierarchyInFlight ?? hierarchyFollowUp!;
      // A forced reload is asked for because something was just saved, and the running request may
      // have started before that save: wait for it and fetch once more. Forced callers that arrive
      // meanwhile share that one follow-up.
      if (!hierarchyFollowUp) {
        hierarchyFollowUp = hierarchyInFlight!
          .catch(() => undefined)
          .then(() => {
            hierarchyFollowUp = null;
            return startHierarchyFetch();
          });
      }
      return hierarchyFollowUp;
    }
    return startHierarchyFetch();
  }

  function startHierarchyFetch(): Promise<void> {
    isHierarchyLoading.value = true;
    hierarchyError.value = null;
    hierarchyErrorKind.value = null;

    hierarchyInFlight = (async () => {
      try {
        // One request: the list already carries chapters and sections when asked, so a cold
        // load no longer fires one /api/pages/:slug request per page.
        const listed = await apiRequestJson<{ pages?: PageDetail[] }>(
          '/api/pages?include=sections',
        );
        const details = Array.isArray(listed.pages) ? listed.pages : [];

        const summaries: PageSummary[] = [];
        for (const detail of details) {
          // Seed the per-slug cache as well: a later Cerita visit renders from it without a
          // second fetch.
          pagesBySlug.value = { ...pagesBySlug.value, [detail.slug]: detail };
          summaries.push({
            id: detail.id,
            slug: detail.slug,
            title: detail.title,
            sortOrder: detail.sortOrder,
            chapterCount: detail.chapters?.length ?? 0,
          });
        }

        const flattened: SectionOption[] = [];
        for (const detail of details) {
          for (const chapter of detail.chapters ?? []) {
            for (const section of chapter.sections ?? []) {
              flattened.push({
                sectionId: section.id,
                sectionTitle: section.title,
                chapterTitle: chapter.title,
                pageTitle: detail.title,
                pageSlug: detail.slug,
              });
            }
          }
        }

        const stamped: HierarchyPage[] = [];
        let incomplete = false;
        for (const detail of details) {
          const page = toHierarchyPage(detail);
          if (page) stamped.push(page);
          else incomplete = true;
        }

        pages.value = summaries;
        sections.value = flattened;
        hierarchyPages.value = stamped;
        hierarchyIncomplete.value = incomplete;
        isLoaded.value = true;
      } catch (err) {
        const mapped = toUserMessage(err, 'memuat struktur halaman', 'GET');
        hierarchyError.value = mapped.message;
        hierarchyErrorKind.value = mapped.kind;
      } finally {
        // A queued follow-up keeps the loading flag on: it is about to start another request.
        if (!hierarchyFollowUp) isHierarchyLoading.value = false;
        hierarchyInFlight = null;
      }
    })();

    return hierarchyInFlight;
  }

  async function fetchPageBySlug(slug: string, force = false): Promise<PageDetail | null> {
    if (!force && pagesBySlug.value[slug]) {
      return pagesBySlug.value[slug];
    }
    if (inFlight[slug]) {
      return inFlight[slug]!;
    }

    isLoading.value = true;
    error.value = null;
    notFound.value = false;
    clearSlugOutcome(slug);

    const task = (async () => {
      try {
        const response = await fetch(`/api/pages/${encodeURIComponent(slug)}`);
        if (response.status === 404) {
          notFound.value = true;
          notFoundBySlug.value = { ...notFoundBySlug.value, [slug]: true };
          return null;
        }
        if (!response.ok) {
          throw await apiErrorFromResponse(response, '/api/pages/:slug', 'GET');
        }

        const data = (await response.json()) as { page: PageDetail };
        pagesBySlug.value = { ...pagesBySlug.value, [slug]: data.page };

        if (isLoaded.value && data.page) {
          const existing = pages.value.find((p) => p.slug === slug);
          if (existing) {
            const nextChapterCount = data.page.chapters?.length ?? 0;
            if (
              existing.title !== data.page.title ||
              existing.sortOrder !== data.page.sortOrder ||
              existing.chapterCount !== nextChapterCount
            ) {
              pages.value = pages.value.map((p) =>
                p.slug === slug
                  ? {
                      ...p,
                      title: data.page.title,
                      sortOrder: data.page.sortOrder,
                      chapterCount: nextChapterCount,
                    }
                  : p,
              );
            }
          }
        }

        return data.page;
      } catch (err) {
        const message = toUserMessage(err, 'memuat halaman', 'GET').message;
        error.value = message;
        errorsBySlug.value = { ...errorsBySlug.value, [slug]: message };
        return null;
      } finally {
        isLoading.value = false;
        delete inFlight[slug];
      }
    })();

    inFlight[slug] = task;
    return task;
  }

  return {
    pages,
    sections,
    hierarchyPages,
    hierarchyIncomplete,
    isHierarchyLoading,
    isLoaded,
    hierarchyError,
    hierarchyErrorKind,
    pagesBySlug,
    isLoading,
    error,
    notFound,
    errorsBySlug,
    notFoundBySlug,
    sectionById,
    breadcrumbParts,
    pageTitleFor,
    labelFor,
    fetchHierarchy,
    fetchPageBySlug,
  };
});
