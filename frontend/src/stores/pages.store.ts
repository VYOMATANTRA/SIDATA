import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface SectionDto {
  id: string;
  slug: string;
  title: string | null;
  sortOrder: number;
}

export interface ChapterDto {
  id: string;
  slug: string;
  number: string | null;
  title: string;
  sortOrder: number;
  sections: SectionDto[];
}

export interface PageDetailDto {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
  chapters: ChapterDto[];
  createdAt: string;
  updatedAt: string;
}

export const usePagesStore = defineStore('pages', () => {
  const pagesBySlug = ref<Record<string, PageDetailDto>>({});
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const notFound = ref(false);

  const inFlight: Record<string, Promise<PageDetailDto | null> | undefined> = {};

  async function fetchPageBySlug(
    slug: string,
    force = false,
  ): Promise<PageDetailDto | null> {
    if (!force && pagesBySlug.value[slug]) {
      return pagesBySlug.value[slug];
    }
    if (inFlight[slug]) {
      return inFlight[slug]!;
    }

    isLoading.value = true;
    error.value = null;
    notFound.value = false;

    const task = (async () => {
      try {
        const response = await fetch(`/api/pages/${encodeURIComponent(slug)}`);
        if (response.status === 404) {
          notFound.value = true;
          return null;
        }
        if (!response.ok) {
          throw new Error(`Gagal memuat halaman (status ${response.status})`);
        }

        const data = (await response.json()) as { page: PageDetailDto };
        pagesBySlug.value = { ...pagesBySlug.value, [slug]: data.page };
        return data.page;
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Terjadi kesalahan jaringan';
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
    pagesBySlug,
    isLoading,
    error,
    notFound,
    fetchPageBySlug,
  };
});
