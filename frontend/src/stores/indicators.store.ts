import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { StatItem } from '../components/common/StatCard.vue';

export interface IndicatorItem {
  id: string;
  sectionId?: string | null;
  slug: string;
  label: string;
  unit?: string | null;
  valueCurrent: string;
  valuePrevious?: string | null;
  periodCurrent?: string | null;
  periodPrevious?: string | null;
  isComputedComparison?: boolean;
  isStale?: boolean;
  source?: string | null;
  hedgeNote?: string | null;
  sortOrder?: number | null;
  pageSlug?: string | null;
}

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
  const indicators = ref<IndicatorItem[]>([]);
  const isLoading = ref(false);
  const isLoaded = ref(false);
  const error = ref<string | null>(null);

  let inFlight: Promise<void> | null = null;

  async function fetchIndicators(force = false): Promise<void> {
    if (isLoaded.value && !force) return;
    if (inFlight) return inFlight;

    isLoading.value = true;
    error.value = null;

    inFlight = (async () => {
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

        const data = (await response.json()) as { indicators?: IndicatorItem[] };
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
        inFlight = null;
      }
    })();

    return inFlight;
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

  return {
    indicators,
    isLoading,
    isLoaded,
    error,
    fetchIndicators,
    getStatsForPage,
  };
});
