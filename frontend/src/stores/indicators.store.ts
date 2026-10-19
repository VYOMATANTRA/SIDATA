import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface PublicIndicator {
  id: string;
  sectionId: string | null;
  slug: string;
  label: string;
  unit: string | null;
  valueCurrent: string;
  valuePrevious: string | null;
  periodCurrent: string;
  periodPrevious?: string | null;
  isComputedComparison?: boolean;
  isStale: boolean;
  source?: string | null;
  hedgeNote?: string | null;
  comparison?: string | null;
}

export const useIndicatorsStore = defineStore('indicators', () => {
  const indicators = ref<PublicIndicator[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const inFlightBySlug = new Map<string, Promise<PublicIndicator | null>>();

  async function fetchBySlug(slug: string): Promise<PublicIndicator | null> {
    const existing = findBySlug(slug);
    if (existing) return existing;

    const existingPromise = inFlightBySlug.get(slug);
    if (existingPromise) return existingPromise;

    isLoading.value = true;
    error.value = null;

    const promise = (async () => {
      try {
        const response = await fetch(`/api/indicators/${encodeURIComponent(slug)}`);
        if (!response.ok) {
          throw new Error(`Gagal memuat indikator (status ${response.status})`);
        }
        const data = (await response.json()) as { indicator?: PublicIndicator };
        if (
          data.indicator &&
          typeof data.indicator === 'object' &&
          typeof data.indicator.slug === 'string'
        ) {
          const index = indicators.value.findIndex((item) => item.slug === data.indicator!.slug);
          if (index !== -1) {
            indicators.value[index] = data.indicator;
          } else {
            indicators.value.push(data.indicator);
          }
          return data.indicator;
        }
        throw new Error('Format data indikator tidak valid');
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Terjadi kesalahan jaringan';
        return null;
      } finally {
        isLoading.value = false;
        inFlightBySlug.delete(slug);
      }
    })();

    inFlightBySlug.set(slug, promise);
    return promise;
  }

  function findBySlug(slug: string): PublicIndicator | null {
    return indicators.value.find((item) => item.slug === slug) ?? null;
  }

  return {
    indicators,
    isLoading,
    error,
    fetchBySlug,
    findBySlug,
  };
});
