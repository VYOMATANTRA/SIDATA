import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { StatItem } from '../components/common/StatCard.vue';
import { apiRequestJson } from '../utils/apiClient';

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
  /** Explicit icon name ('person' | 'house' | 'density' | 'ratio') */
  icon?: 'person' | 'house' | 'density' | 'ratio' | string | null;
  /** Explicit number formatting: 'decimal' | 'integer' | 'ratio' | 'raw' */
  format?: 'decimal' | 'integer' | 'ratio' | 'raw' | string | null;
}

/** The public Cerita read names the same shapes `…Dto`; keep both import paths working. */
export type IndicatorDto = Indicator;
export type IndicatorComparison = RenderedComparison;
export type IndicatorItem = IndicatorDto;

export interface IndicatorConfig {
  icon: 'person' | 'house' | 'density' | 'ratio';
  format: 'decimal' | 'integer' | 'ratio' | 'raw';
}

/**
 * Explicit per-indicator icons and formats to avoid guessing from ambiguous substrings.
 */
export const KNOWN_INDICATOR_CONFIGS: Record<string, IndicatorConfig> = {
  // Kependudukan
  penduduk: { icon: 'person', format: 'integer' },
  'kependudukan-penduduk': { icon: 'person', format: 'integer' },
  'jumlah-penduduk': { icon: 'person', format: 'integer' },
  'total-penduduk': { icon: 'person', format: 'integer' },
  'kependudukan-total': { icon: 'person', format: 'integer' },
  'rukun-tetangga': { icon: 'house', format: 'integer' },
  'kependudukan-rukun-tetangga': { icon: 'house', format: 'integer' },
  kepadatan: { icon: 'density', format: 'decimal' },
  'kependudukan-kepadatan': { icon: 'density', format: 'decimal' },
  'kepadatan-penduduk': { icon: 'density', format: 'decimal' },
  'rasio-kelamin': { icon: 'ratio', format: 'ratio' },
  'kependudukan-rasio-kelamin': { icon: 'ratio', format: 'ratio' },
  'rasio-jenis-kelamin': { icon: 'ratio', format: 'ratio' },

  // Pendidikan
  'rasio-guru-murid': { icon: 'ratio', format: 'ratio' },
  'pendidikan-rasio-guru-murid': { icon: 'ratio', format: 'ratio' },
  'angka-partisipasi-sekolah': { icon: 'ratio', format: 'decimal' },
  'pendidikan-angka-partisipasi-sekolah': { icon: 'ratio', format: 'decimal' },
  'jumlah-sekolah': { icon: 'house', format: 'integer' },
  'pendidikan-jumlah-sekolah': { icon: 'house', format: 'integer' },
  'tingkat-kelulusan': { icon: 'ratio', format: 'decimal' },
  'pendidikan-tingkat-kelulusan': { icon: 'ratio', format: 'decimal' },

  // Kesehatan
  'posyandu-aktif': { icon: 'house', format: 'integer' },
  'kesehatan-posyandu-aktif': { icon: 'house', format: 'integer' },
  'cakupan-imunisasi': { icon: 'ratio', format: 'decimal' },
  'kesehatan-cakupan-imunisasi': { icon: 'ratio', format: 'decimal' },
  'tenaga-medis': { icon: 'person', format: 'integer' },
  'kesehatan-tenaga-medis': { icon: 'person', format: 'integer' },
  'sarana-kesehatan': { icon: 'house', format: 'integer' },
  'kesehatan-sarana-kesehatan': { icon: 'house', format: 'integer' },

  // Ekonomi & Ketertiban
  'sentra-umkm': { icon: 'house', format: 'integer' },
  'ekonomi-dan-ketertiban-sentra-umkm': { icon: 'house', format: 'integer' },
  'tingkat-pengangguran': { icon: 'ratio', format: 'decimal' },
  'ekonomi-dan-ketertiban-tingkat-pengangguran': { icon: 'ratio', format: 'decimal' },
  'pos-keamanan': { icon: 'house', format: 'integer' },
  'ekonomi-dan-ketertiban-pos-keamanan': { icon: 'house', format: 'integer' },
  'keluarga-sejahtera': { icon: 'person', format: 'integer' },
  'ekonomi-dan-ketertiban-keluarga-sejahtera': { icon: 'person', format: 'integer' },

  // Pemerintahan & Kelembagaan
  'aparatur-kelurahan': { icon: 'person', format: 'integer' },
  'pemerintahan-dan-kelembagaan-aparatur-kelurahan': { icon: 'person', format: 'integer' },
  'jumlah-rt': { icon: 'house', format: 'integer' },
  'pemerintahan-dan-kelembagaan-jumlah-rt': { icon: 'house', format: 'integer' },
  'lembaga-kemasyarakatan': { icon: 'house', format: 'integer' },
  'pemerintahan-dan-kelembagaan-lembaga-kemasyarakatan': { icon: 'house', format: 'integer' },
  'pos-pelayanan': { icon: 'house', format: 'integer' },
  'pemerintahan-dan-kelembagaan-pos-pelayanan': { icon: 'house', format: 'integer' },

  // Geografis & Tata Ruang
  'luas-wilayah': { icon: 'density', format: 'decimal' },
  'geografis-dan-tata-ruang-luas-wilayah': { icon: 'density', format: 'decimal' },
  'ruang-terbuka-hijau': { icon: 'density', format: 'decimal' },
  'geografis-dan-tata-ruang-ruang-terbuka-hijau': { icon: 'density', format: 'decimal' },
  'panjang-pantai': { icon: 'density', format: 'decimal' },
  'geografis-dan-tata-ruang-panjang-pantai': { icon: 'density', format: 'decimal' },
  'kawasan-pemukiman': { icon: 'density', format: 'decimal' },
  'geografis-dan-tata-ruang-kawasan-pemukiman': { icon: 'density', format: 'decimal' },

  // Infrastruktur & Perumahan
  'cakupan-air-bersih': { icon: 'density', format: 'decimal' },
  'infrastruktur-dan-perumahan-cakupan-air-bersih': { icon: 'density', format: 'decimal' },
  'sanitasi-layak': { icon: 'density', format: 'decimal' },
  'infrastruktur-dan-perumahan-sanitasi-layak': { icon: 'density', format: 'decimal' },
  'panjang-jalan': { icon: 'density', format: 'decimal' },
  'infrastruktur-dan-perumahan-panjang-jalan': { icon: 'density', format: 'decimal' },
  'rumah-layak-huni': { icon: 'house', format: 'integer' },
  'infrastruktur-dan-perumahan-rumah-layak-huni': { icon: 'house', format: 'integer' },

  // Persampahan & Bank Sampah Unit
  'bank-sampah': { icon: 'house', format: 'integer' },
  'bank-sampah-unit': { icon: 'house', format: 'integer' },
  'persampahan-dan-bank-sampah-unit-bank-sampah': { icon: 'house', format: 'integer' },
  'sampah-terkelola': { icon: 'density', format: 'decimal' },
  'persampahan-dan-bank-sampah-unit-sampah-terkelola': { icon: 'density', format: 'decimal' },
  'nasabah-bank-sampah': { icon: 'person', format: 'integer' },
  'persampahan-dan-bank-sampah-unit-nasabah': { icon: 'person', format: 'integer' },
  'reduksi-sampah': { icon: 'density', format: 'decimal' },
  'persampahan-dan-bank-sampah-unit-reduksi-sampah': { icon: 'density', format: 'decimal' },
};

/**
 * Resolves the explicit or inferred formatting style for an indicator.
 */
export function resolveFormatForIndicator(
  slug: string,
  label: string,
  unit?: string | null,
): 'decimal' | 'integer' | 'ratio' | 'raw' {
  const normalizedSlug = slug.replace(/^[a-z0-9]+(?:-[a-z0-9]+)*-(?=[a-z0-9]+$)/, '');
  if (KNOWN_INDICATOR_CONFIGS[slug]?.format) {
    return KNOWN_INDICATOR_CONFIGS[slug]!.format;
  }
  if (KNOWN_INDICATOR_CONFIGS[normalizedSlug]?.format) {
    return KNOWN_INDICATOR_CONFIGS[normalizedSlug]!.format;
  }

  if (unit && unit.includes(':')) {
    return 'ratio';
  }

  const text = `${slug} ${label}`.toLowerCase();
  if (/\b(rasio|tingkat|indeks|angka|persentase)\b/i.test(text) || (unit && unit.includes('%'))) {
    return 'decimal';
  }
  if (
    /\b(kepadatan|luas|panjang|sampah-terkelola|reduksi-sampah)\b/i.test(text) ||
    (unit && /\b(km²|km|ton\/hari)\b/i.test(unit))
  ) {
    return 'decimal';
  }
  if (
    /\b(penduduk|warga|jiwa|siswa|peserta|balita|guru|medis|tenaga|nasabah|orang|kk|rt|rumah|posyandu|sekolah|unit|lembaga|pos)\b/i.test(
      text,
    ) ||
    (unit && /\b(jiwa|orang|kk|rt|unit|pos|lembaga)\b/i.test(unit))
  ) {
    return 'integer';
  }

  return 'raw';
}

/**
 * Format an indicator value using Indonesian conventions:
 * comma for decimal point ('2,5', '1,06'), dot for thousands ('53.098').
 */
export function formatIndicatorValue(
  value: string | number,
  format?: string | null,
  unit?: string | null,
): string {
  const strVal = String(value).trim();
  if (!strVal) return '';

  if (format === 'raw') return strVal;

  if (format === 'ratio' || (unit && unit.includes(':'))) {
    return strVal.replace('.', ',');
  }

  if (format === 'decimal') {
    return strVal.replace('.', ',');
  }

  if (format === 'integer') {
    // If strVal is already pre-formatted with Indonesian thousand dots, e.g. '53.098' or '53.120'
    if (/^\d{1,3}(\.\d{3})+$/.test(strVal)) {
      return strVal;
    }
    // Plain digits like '53098' or '100' -> format to Indonesian locale ('53.098')
    if (/^\d+$/.test(strVal)) {
      return Number(strVal).toLocaleString('id-ID');
    }
    // Stored as Decimal with .0000 -> extract integer part and format
    if (/^\d+\.0+$/.test(strVal)) {
      const intPart = strVal.split('.')[0]!;
      return Number(intPart).toLocaleString('id-ID');
    }
    return strVal;
  }

  // Fallback: If it already matches thousand-separated format, preserve it
  if (/^\d{1,3}(\.\d{3})+$/.test(strVal)) {
    return strVal;
  }

  // Consistent decimal comma fallback for decimal strings (e.g. '2.5' or '1.06')
  if (/^-?\d+\.\d+$/.test(strVal)) {
    return strVal.replace('.', ',');
  }

  return strVal;
}

export function resolveIconForIndicator(
  slug: string,
  label: string,
): 'person' | 'house' | 'density' | 'ratio' {
  // Check known configs first
  const normalizedSlug = slug.replace(/^[a-z0-9]+(?:-[a-z0-9]+)*-(?=[a-z0-9]+$)/, '');
  if (KNOWN_INDICATOR_CONFIGS[slug]?.icon) {
    return KNOWN_INDICATOR_CONFIGS[slug]!.icon;
  }
  if (KNOWN_INDICATOR_CONFIGS[normalizedSlug]?.icon) {
    return KNOWN_INDICATOR_CONFIGS[normalizedSlug]!.icon;
  }

  const text = `${normalizedSlug} ${label}`.toLowerCase();

  // Use word-boundary checks rather than substring matching
  if (/\b(rasio|tingkat|indeks|angka|cakupan|persentase)\b/i.test(text)) {
    return 'ratio';
  }
  if (
    /\b(kepadatan|luas|wilayah|panjang|sampah|jalan)\b/i.test(text) ||
    text.includes('%') ||
    /\b(km²|ton\/hari)\b/i.test(text)
  ) {
    return 'density';
  }
  if (
    /\b(rt|rukun tetangga|rumah|posyandu|sekolah|satuan|usaha|bank|unit|fasilitas|lembaga)\b/i.test(
      text,
    )
  ) {
    return 'house';
  }
  if (
    /\b(penduduk|warga|jiwa|siswa|peserta|balita|guru|medis|tenaga|nasabah|orang|kk)\b/i.test(text)
  ) {
    return 'person';
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
        // Do NOT treat 404 as loaded or empty — report error and keep existing data on failed refetch
        error.value = err instanceof Error ? err.message : 'Gagal memuat daftar indikator.';
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

    return matched.map((item) => {
      const explicitIcon = item.icon || resolveIconForIndicator(item.slug, item.label);
      const explicitFormat =
        item.format || resolveFormatForIndicator(item.slug, item.label, item.unit);
      const formattedValue = formatIndicatorValue(item.valueCurrent, explicitFormat, item.unit);
      return {
        icon: explicitIcon,
        value: formattedValue,
        label: item.label,
        unit: item.unit || undefined,
      };
    });
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
