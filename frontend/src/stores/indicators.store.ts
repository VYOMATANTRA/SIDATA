import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { StatItem } from '../components/common/StatCard.vue';

export interface IndicatorComparison {
  trend: 'naik' | 'turun' | 'tetap';
  text: string;
}

export interface IndicatorDto {
  id: string;
  sectionId?: string | null;
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
  comparisonTemplateId?: string | null;
  comparison?: IndicatorComparison | null;
  createdAt?: string;
  updatedAt?: string;
  pageSlug?: string | null;
}

export type IndicatorItem = IndicatorDto;

function resolveIconForIndicator(
  slug: string,
  label: string,
): 'person' | 'house' | 'density' | 'ratio' {
  const text = `${slug} ${label}`.toLowerCase();
  if (
    text.includes('penduduk') ||
    text.includes('warga') ||
    text.includes('jiwa') ||
    text.includes('siswa') ||
    text.includes('peserta') ||
    text.includes('balita') ||
    text.includes('guru') ||
    text.includes('medis') ||
    text.includes('tenaga') ||
    text.includes('nasabah')
  ) {
    return 'person';
  }
  if (
    text.includes('rt') ||
    text.includes('tetangga') ||
    text.includes('rumah') ||
    text.includes('posyandu') ||
    text.includes('sekolah') ||
    text.includes('satuan') ||
    text.includes('usaha') ||
    text.includes('bank') ||
    text.includes('unit') ||
    text.includes('fasilitas') ||
    text.includes('lembaga')
  ) {
    return 'house';
  }
  if (
    text.includes('kepadatan') ||
    text.includes('luas') ||
    text.includes('wilayah') ||
    text.includes('persen') ||
    text.includes('%') ||
    text.includes('panjang') ||
    text.includes('ton') ||
    text.includes('km') ||
    text.includes('sampah') ||
    text.includes('jalan')
  ) {
    return 'density';
  }
  if (
    text.includes('rasio') ||
    text.includes('tingkat') ||
    text.includes('indeks') ||
    text.includes('angka') ||
    text.includes('cakupan')
  ) {
    return 'ratio';
  }
  return 'person';
}

export const useIndicatorsStore = defineStore('indicators', () => {
  // Global / Landing page indicators state
  const indicators = ref<IndicatorDto[]>([]);
  const isLoading = ref(false);
  const isLoaded = ref(false);
  const error = ref<string | null>(null);

  let inFlightGlobal: Promise<void> | null = null;

  async function fetchIndicators(force = false): Promise<void> {
    if (isLoaded.value && !force) return;
    if (inFlightGlobal) return inFlightGlobal;

    isLoading.value = true;
    error.value = null;

    inFlightGlobal = (async () => {
      try {
        const response = await fetch('/api/indicators');
        // If indicators endpoint is not implemented yet (404), fail gracefully without noisy error
        if (response.status === 404) {
          indicators.value = [];
          isLoaded.value = true;
          return;
        }

        if (!response.ok) {
          throw new Error(`Gagal memuat indikator (status ${response.status})`);
        }

        const data = (await response.json()) as { indicators?: IndicatorDto[] };
        if (Array.isArray(data.indicators)) {
          indicators.value = data.indicators;
          isLoaded.value = true;
        } else {
          indicators.value = [];
        }
      } catch (err) {
        // Non-blocking fallback: public page should display empty state without crashing
        error.value = err instanceof Error ? err.message : 'Terjadi kesalahan jaringan';
        indicators.value = [];
      } finally {
        isLoading.value = false;
        inFlightGlobal = null;
      }
    })();

    return inFlightGlobal;
  }

  function getStatsForPage(pageSlug: string): StatItem[] {
    const matched = indicators.value.filter((item) => {
      if (item.pageSlug) {
        return item.pageSlug.toLowerCase() === pageSlug.toLowerCase();
      }
      return item.slug.toLowerCase().startsWith(pageSlug.toLowerCase());
    });

    return matched.map((item) => ({
      icon: resolveIconForIndicator(item.slug, item.label),
      value: item.valueCurrent,
      label: item.label,
      unit: item.unit || undefined,
    }));
  }

  // Section-keyed state for Cerita pages
  const bySectionId = ref<Record<string, IndicatorDto[]>>({});
  // Keyed per sectionId so one section's failure can't be masked by, or clobber,
  // the loading/error state of a sibling section's concurrent request.
  const loadingBySectionId = ref<Record<string, boolean>>({});
  const errorsBySectionId = ref<Record<string, string | null>>({});

  const inFlightBySection: Record<string, Promise<IndicatorDto[]> | undefined> = {};

  async function fetchBySectionId(sectionId: string, force = false): Promise<IndicatorDto[]> {
    if (!force && bySectionId.value[sectionId]) {
      return bySectionId.value[sectionId]!;
    }
    if (inFlightBySection[sectionId]) {
      return inFlightBySection[sectionId]!;
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
        const items = Array.isArray(data.indicators) ? data.indicators : [];
        bySectionId.value = { ...bySectionId.value, [sectionId]: items };
        return items;
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
        delete inFlightBySection[sectionId];
      }
    })();

    inFlightBySection[sectionId] = task;
    return task;
  }

  return {
    indicators,
    isLoading,
    isLoaded,
    error,
    fetchIndicators,
    getStatsForPage,

    bySectionId,
    loadingBySectionId,
    errorsBySectionId,
    fetchBySectionId,
  };
});
