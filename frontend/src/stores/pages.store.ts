import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { apiRequestJson } from '../utils/apiClient';

/**
 * Reads the public page → chapter → section hierarchy (SPEC §2). The CMS forms need the
 * reverse lookup: given an `indicator.sectionId`, which page/chapter does it belong to
 * (for the card kicker and the modal breadcrumb)? Sections are the attachment point for
 * indicators and indicator tables, so this is the only place that knowledge lives on the
 * frontend.
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
}

export interface ChapterDetail {
  id: string;
  slug: string;
  number: string | null;
  title: string;
  sortOrder: number;
  sections: SectionSummary[];
}

export interface PageDetail {
  id: string;
  slug: string;
  title: string;
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

const NOT_AVAILABLE = 'Tanpa bagian';

export const usePagesStore = defineStore('pages', () => {
  const pages = ref<PageSummary[]>([]);
  const sections = ref<SectionOption[]>([]);
  const isLoading = ref(false);
  const isLoaded = ref(false);
  const error = ref<string | null>(null);

  let inFlight: Promise<void> | null = null;

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
    if (inFlight) return inFlight;

    isLoading.value = true;
    error.value = null;

    inFlight = (async () => {
      try {
        const listed = await apiRequestJson<{ pages?: PageSummary[] }>('/api/pages');
        const summaries = Array.isArray(listed.pages) ? listed.pages : [];

        const details = await Promise.all(
          summaries.map(async (summary) => {
            try {
              const data = await apiRequestJson<{ page?: PageDetail }>(
                `/api/pages/${encodeURIComponent(summary.slug)}`,
              );
              return data.page ?? null;
            } catch {
              // One unreadable page must not blank out the whole hierarchy — the section
              // list degrades to "page not labelled" rather than failing the view.
              return null;
            }
          }),
        );

        const flattened: SectionOption[] = [];
        for (const detail of details) {
          if (!detail) continue;
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

        pages.value = summaries;
        sections.value = flattened;
        isLoaded.value = true;
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Gagal memuat struktur halaman.';
      } finally {
        isLoading.value = false;
        inFlight = null;
      }
    })();

    return inFlight;
  }

  return {
    pages,
    sections,
    isLoading,
    isLoaded,
    error,
    sectionById,
    breadcrumbParts,
    pageTitleFor,
    labelFor,
    fetchHierarchy,
  };
});
