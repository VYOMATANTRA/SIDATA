import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface PublicIndicator {
  id: string;
  sectionId: string | null;
  slug: string;
  label: string;
  unit: string | null;
  valueCurrent: number;
  valuePrevious: number | null;
  periodCurrent: string;
  isStale: boolean;
}

const INDICATORS_ENDPOINT = '/api/indicators?pageSize=200';

export const useIndicatorsStore = defineStore('indicators', () => {
  const indicators = ref<PublicIndicator[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  let inFlight: Promise<void> | null = null;

  async function fetchIndicators(force = false): Promise<void> {
    if (inFlight) return inFlight;
    if (!force && indicators.value.length > 0) return;

    isLoading.value = true;
    error.value = null;

    inFlight = (async () => {
      try {
        const response = await fetch(INDICATORS_ENDPOINT);
        if (!response.ok) {
          throw new Error(`Gagal memuat indikator (status ${response.status})`);
        }

        const data = (await response.json()) as { indicators?: PublicIndicator[] };
        if (Array.isArray(data.indicators)) {
          indicators.value = data.indicators;
        }
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Terjadi kesalahan jaringan';
      } finally {
        isLoading.value = false;
        inFlight = null;
      }
    })();

    return inFlight;
  }

  function findBySlug(slug: string): PublicIndicator | null {
    return indicators.value.find((item) => item.slug === slug) ?? null;
  }

  return {
    indicators,
    isLoading,
    error,
    fetchIndicators,
    findBySlug,
  };
});
