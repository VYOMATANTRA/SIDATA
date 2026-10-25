import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface IndicatorComparison {
  trend: 'naik' | 'turun' | 'tetap';
  text: string;
}

export interface IndicatorDto {
  id: string;
  sectionId: string;
  slug: string;
  label: string;
  unit: string | null;
  valueCurrent: string;
  valuePrevious: string | null;
  periodCurrent: string;
  periodPrevious: string | null;
  isComputedComparison: boolean;
  isStale: boolean;
  source: string | null;
  hedgeNote: string | null;
  sortOrder: number;
  comparisonTemplateId: string | null;
  comparison: IndicatorComparison | null;
  createdAt: string;
  updatedAt: string;
}

export const useIndicatorsStore = defineStore('indicators', () => {
  const bySectionId = ref<Record<string, IndicatorDto[]>>({});
  // Keyed per sectionId so one section's failure can't be masked by, or clobber,
  // the loading/error state of a sibling section's concurrent request.
  const loadingBySectionId = ref<Record<string, boolean>>({});
  const errorsBySectionId = ref<Record<string, string | null>>({});

  const inFlight: Record<string, Promise<IndicatorDto[]> | undefined> = {};

  async function fetchBySectionId(sectionId: string, force = false): Promise<IndicatorDto[]> {
    if (!force && bySectionId.value[sectionId]) {
      return bySectionId.value[sectionId]!;
    }
    if (inFlight[sectionId]) {
      return inFlight[sectionId]!;
    }

    loadingBySectionId.value = { ...loadingBySectionId.value, [sectionId]: true };
    errorsBySectionId.value = { ...errorsBySectionId.value, [sectionId]: null };

    const task = (async () => {
      try {
        const params = new URLSearchParams({ sectionId, pageSize: '200' });
        const response = await fetch(`/api/indicators?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Gagal memuat indikator (status ${response.status})`);
        }

        const data = (await response.json()) as { indicators: IndicatorDto[] };
        const indicators = Array.isArray(data.indicators) ? data.indicators : [];
        bySectionId.value = { ...bySectionId.value, [sectionId]: indicators };
        return indicators;
      } catch (err) {
        // Deliberately does NOT write [] into bySectionId on failure: an empty array there
        // must mean "fetched, genuinely no indicators" — never "fetch failed". The failure is
        // recorded only in errorsBySectionId so a view can tell the two apart and show an
        // error for this section instead of rendering it as silently empty.
        errorsBySectionId.value = {
          ...errorsBySectionId.value,
          [sectionId]: err instanceof Error ? err.message : 'Terjadi kesalahan jaringan',
        };
        return [];
      } finally {
        loadingBySectionId.value = { ...loadingBySectionId.value, [sectionId]: false };
        delete inFlight[sectionId];
      }
    })();

    inFlight[sectionId] = task;
    return task;
  }

  return {
    bySectionId,
    loadingBySectionId,
    errorsBySectionId,
    fetchBySectionId,
  };
});
