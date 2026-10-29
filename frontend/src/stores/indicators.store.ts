import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { StatItem } from '../components/common/StatCard.vue';
import { ApiError, apiRequestJson } from '../utils/apiClient';

/**
 * Scalar indicator figures (SPEC §7). Read is public; writes need an editor/admin token.
 *
 * Two consumers, one store:
 * - The Cerita page reads indicators per section (`fetchBySectionId`, `bySectionId`), tracking
 *   loading/error per section so one failed section cannot blank out or clobber a sibling.
 * - The CMS pulls the whole list in one page (`fetchIndicators`) and edits a row in place
 *   (`updateIndicator`). The backend caps `pageSize` at 200 and the kelurahan publishes dozens of
 *   figures, so the CMS filters client-side, the same choice the Ketua RT page makes for its 100
 *   rows (SPEC §8).
 */

export const INDICATORS_PAGE_SIZE = 200;

export type ComparisonTrend = 'naik' | 'turun' | 'tetap';

export interface RenderedComparison {
  trend: ComparisonTrend;
  text: string;
}

export interface Indicator {
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
  /** Rendered server-side from the attached tier-1 template; null when there is nothing to say. */
  comparison?: RenderedComparison | null;
  createdAt?: string;
  updatedAt?: string;
  pageSlug?: string | null;
}

/** The public Cerita read names the same shapes `…Dto`; keep both import paths working. */
export type IndicatorDto = Indicator;
export type IndicatorComparison = RenderedComparison;
export type IndicatorItem = IndicatorDto;

export function resolveIconForIndicator(
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

/** Only the fields the CMS form can change; the API rejects unknown keys (`.strict()`). */
export interface IndicatorPatch {
  label?: string;
  unit?: string | null;
  valueCurrent?: string;
  valuePrevious?: string | null;
  periodCurrent?: string;
  periodPrevious?: string | null;
  /**
   * Only sent when the flag has to be cleared — the pair was removed and the stored row was
   * flagged computed (the service rejects `is_computed_comparison` with an empty pair). Enabling
   * a pair does not set it; tier-1 is limited to specific indicators (SPEC §5).
   */
  isComputedComparison?: boolean;
  isStale?: boolean;
  source?: string | null;
  hedgeNote?: string | null;
  /**
   * Cleared (null) when the form un-checks the previous-year pair on an indicator that has a
   * tier-1 template attached — SPEC §5 forbids clearing the pair while a template remains.
   */
  comparisonTemplateId?: string | null;
}

export const useIndicatorsStore = defineStore('indicators', () => {
  // CMS & Public indicators state
  const indicators = ref<Indicator[]>([]);
  const total = ref(0);
  const isLoading = ref(false);
  const isLoaded = ref(false);
  const error = ref<string | null>(null);

  let inFlight: Promise<void> | null = null;

  // --- Public Cerita: reads grouped per section ---
  const bySectionId = ref<Record<string, Indicator[]>>({});
  // Keyed per sectionId so one section's failure can't be masked by, or clobber,
  // the loading/error state of a sibling section's concurrent request.
  const loadingBySectionId = ref<Record<string, boolean>>({});
  const errorsBySectionId = ref<Record<string, string | null>>({});

  const sectionInFlight: Record<string, Promise<Indicator[]> | undefined> = {};

  const staleCount = computed(() => indicators.value.filter((item) => item.isStale).length);

  /**
   * Drops the Cerita view's cached copy of a section. `indicators` and `bySectionId` are two
   * caches over the same rows; leaving the per-section one in place after a write would make
   * /cerita serve the pre-edit value until a full reload.
   */
  function invalidateSectionCache(sectionId: string): void {
    if (bySectionId.value[sectionId] === undefined) return;
    const next = { ...bySectionId.value };
    delete next[sectionId];
    bySectionId.value = next;
  }

  function replaceIndicator(updated: Indicator): void {
    if (updated.sectionId) {
      invalidateSectionCache(updated.sectionId);
    }
    const index = indicators.value.findIndex((item) => item.id === updated.id);
    if (index === -1) {
      indicators.value = [...indicators.value, updated];
      total.value += 1;
      return;
    }
    const next = [...indicators.value];
    next[index] = updated;
    indicators.value = next;
  }

  async function fetchIndicators(force = false): Promise<void> {
    if (isLoaded.value && !force) return;
    if (inFlight) return inFlight;

    isLoading.value = true;
    error.value = null;

    inFlight = (async () => {
      try {
        const data = await apiRequestJson<{ indicators?: Indicator[]; total?: number }>(
          `/api/indicators?pageSize=${INDICATORS_PAGE_SIZE}`,
        );
        indicators.value = Array.isArray(data.indicators) ? data.indicators : [];
        total.value = typeof data.total === 'number' ? data.total : indicators.value.length;
        isLoaded.value = true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          indicators.value = [];
          total.value = 0;
          isLoaded.value = true;
          error.value = null;
          return;
        }
        error.value = err instanceof Error ? err.message : 'Gagal memuat daftar indikator.';
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

  async function updateIndicator(id: string, patch: IndicatorPatch): Promise<Indicator> {
    const previousSectionId = indicators.value.find((item) => item.id === id)?.sectionId;
    const data = await apiRequestJson<{ indicator: Indicator }>(
      `/api/indicators/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
    replaceIndicator(data.indicator);
    if (previousSectionId && previousSectionId !== data.indicator.sectionId) {
      invalidateSectionCache(previousSectionId);
    }
    return data.indicator;
  }

  async function fetchBySectionId(sectionId: string, force = false): Promise<Indicator[]> {
    if (!force && bySectionId.value[sectionId]) {
      return bySectionId.value[sectionId]!;
    }
    if (sectionInFlight[sectionId]) {
      return sectionInFlight[sectionId]!;
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

        const data = (await response.json()) as { indicators: Indicator[] };
        const list = Array.isArray(data.indicators) ? data.indicators : [];
        bySectionId.value = { ...bySectionId.value, [sectionId]: list };
        return list;
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
        delete sectionInFlight[sectionId];
      }
    })();

    sectionInFlight[sectionId] = task;
    return task;
  }

  return {
    indicators,
    total,
    isLoading,
    isLoaded,
    error,
    staleCount,
    fetchIndicators,
    getStatsForPage,
    updateIndicator,
    replaceIndicator,
    bySectionId,
    loadingBySectionId,
    errorsBySectionId,
    fetchBySectionId,
  };
});
