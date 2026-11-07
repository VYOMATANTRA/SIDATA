import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { StatItem } from '../components/common/StatCard.vue';
import { apiErrorFromResponse, apiFetch, apiRequestJson } from '../utils/apiClient';
import { toUserMessage } from '../utils/userMessages';

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

/**
 * Format an indicator value using Indonesian conventions:
 * comma for decimal point ('2,5', '1,06'), dot for thousands ('53.098').
 * Drops a trailing fractional part that is exactly zero (e.g. "12480.0000" -> "12.480").
 * Preserves exact decimal digits without IEEE-754 precision loss.
 */
export function formatIndicatorValue(value: string | number, unit?: string | null): string {
  const strVal = String(value).trim();
  if (!strVal) return '';

  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(strVal);
  if (!match) {
    if (unit && unit.includes(':')) {
      return strVal.replace('.', ',');
    }
    return strVal;
  }

  const sign = match[1] ?? '';
  const integerPart = match[2] ?? '0';
  const fractionPart = match[3] ?? '';

  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const trimmedFraction = fractionPart.replace(/0+$/, '');

  // Avoid a "-0" display for values like "-0.0000" — there's no real negative figure here.
  const isZero = !/[1-9]/.test(integerPart + trimmedFraction);

  return `${isZero ? '' : sign}${groupedInteger}${trimmedFraction ? `,${trimmedFraction}` : ''}`;
}

export function resolveIconForIndicator(
  slug: string,
  label: string,
): 'person' | 'house' | 'density' | 'ratio' {
  const normalizedSlug = slug.replace(/^[a-z0-9]+(?:-[a-z0-9]+)*-(?=[a-z0-9]+$)/, '');
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

/** Public hero figures: short TTL so SPA sessions do not keep deleted/edited values forever. */
export const BY_SLUG_TTL_MS = 60_000;

/**
 * Canonical slug key for every bySlug get / set / invalidate path.
 * Same normalisation contract as the backend `normalizeIndicatorLookup` —
 * mixed-case reads must never fork or leave a stale entry.
 */
export function normalizeIndicatorSlug(slug: string): string {
  return slug.trim().toLowerCase();
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

  // Slug-keyed cache & fetch for single-indicator lookups (e.g. hero figures)
  const bySlug = ref<Record<string, IndicatorDto>>({});
  const bySlugFetchedAt = ref<Record<string, number>>({});
  const loadingBySlug = ref<Record<string, boolean>>({});
  const errorsBySlug = ref<Record<string, string | null>>({});

  const inFlightBySlug: Record<string, Promise<IndicatorDto | null> | undefined> = {};
  /** Bumped on each new slug fetch and on CMS write/delete so stale responses cannot write. */
  const fetchGenBySlug: Record<string, number> = {};

  function isSlugCacheFresh(normalized: string): boolean {
    const at = bySlugFetchedAt.value[normalized];
    return typeof at === 'number' && Date.now() - at < BY_SLUG_TTL_MS;
  }

  function stampSlugCache(normalized: string, item: IndicatorDto): void {
    bySlug.value = { ...bySlug.value, [normalized]: item };
    bySlugFetchedAt.value = { ...bySlugFetchedAt.value, [normalized]: Date.now() };
  }

  /** Drop every bySlug entry for this indicator id and/or slug key. Returns evicted slug keys. */
  function evictSlugCacheForIndicator(id: string, slug?: string | null): string[] {
    const slugKey = typeof slug === 'string' ? normalizeIndicatorSlug(slug) : null;
    const next = { ...bySlug.value };
    const nextAt = { ...bySlugFetchedAt.value };
    const evicted: string[] = [];
    let deleted = false;
    for (const [k, v] of Object.entries(next)) {
      if (v.id === id || (slugKey !== null && k === slugKey)) {
        delete next[k];
        delete nextAt[k];
        deleted = true;
        if (!evicted.includes(k)) evicted.push(k);
      }
    }
    if (deleted) {
      bySlug.value = next;
      bySlugFetchedAt.value = nextAt;
    }
    // Still report the slug so a delete bumps generation even when that key was not cached.
    if (slugKey !== null && !evicted.includes(slugKey)) evicted.push(slugKey);
    return evicted;
  }

  function bumpSlugFetchGeneration(...keys: Array<string | null | undefined>): void {
    let loadingChanged = false;
    const nextLoading = { ...loadingBySlug.value };
    for (const key of keys) {
      if (typeof key !== 'string') continue;
      const normalized = normalizeIndicatorSlug(key);
      if (!normalized) continue;
      fetchGenBySlug[normalized] = (fetchGenBySlug[normalized] ?? 0) + 1;
      // A bump supersedes any in-flight fetch for this slug; clear stuck loading so a
      // replace/delete that never starts a new fetch cannot leave the spinner on.
      if (nextLoading[normalized]) {
        nextLoading[normalized] = false;
        loadingChanged = true;
      }
    }
    if (loadingChanged) {
      loadingBySlug.value = nextLoading;
    }
  }

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

    const newSlugKey = normalizeIndicatorSlug(updated.slug);
    const nextBySlug = { ...bySlug.value };
    const nextAt = { ...bySlugFetchedAt.value };
    const keysToBump: string[] = [newSlugKey];

    for (const [k, v] of Object.entries(nextBySlug)) {
      if (v.id === updated.id && k !== newSlugKey) {
        keysToBump.push(k);
        delete nextBySlug[k];
        delete nextAt[k];
      }
    }
    bumpSlugFetchGeneration(...keysToBump);

    // Always upsert — even if this slug was never cached (Tentang may fetch later).
    nextBySlug[newSlugKey] = updated;
    nextAt[newSlugKey] = Date.now();
    bySlug.value = nextBySlug;
    bySlugFetchedAt.value = nextAt;

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
        error.value = toUserMessage(err, 'memuat daftar indikator', 'GET').message;
      } finally {
        isLoading.value = false;
        inFlight = null;
      }
    })();

    return inFlight;
  }

  function getStatsForPage(pageSlug: string): StatItem[] {
    const target = pageSlug.toLowerCase();
    const isWasteCategory =
      target === 'persampahan' || target === 'persampahan-dan-bank-sampah-unit';

    const matched = indicators.value.filter((item) => {
      const itemSlug = item.pageSlug?.toLowerCase();
      if (!itemSlug) return false;
      if (isWasteCategory) {
        return itemSlug === 'persampahan' || itemSlug === 'persampahan-dan-bank-sampah-unit';
      }
      return itemSlug === target;
    });

    return matched
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({
        icon: resolveIconForIndicator(item.slug, item.label),
        value: formatIndicatorValue(item.valueCurrent, item.unit),
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
        const response = await apiFetch(`/api/indicators?${params.toString()}`);
        if (!response.ok) {
          throw await apiErrorFromResponse(response, '/api/indicators', 'GET');
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
          [sectionId]: toUserMessage(err, 'memuat indikator', 'GET').message,
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

  async function deleteIndicator(id: string): Promise<void> {
    const existing =
      indicators.value.find((item) => item.id === id) ??
      Object.values(bySlug.value).find((item) => item.id === id) ??
      null;
    await apiRequestJson(`/api/indicators/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const evicted = evictSlugCacheForIndicator(id, existing?.slug ?? null);
    bumpSlugFetchGeneration(...evicted);
    if (existing) invalidateSectionCache(existing.sectionId);
    const next = indicators.value.filter((item) => item.id !== id);
    if (next.length !== indicators.value.length) {
      indicators.value = next;
      total.value = Math.max(0, total.value - 1);
    }
  }

  async function fetchBySlug(slug: string, force = false): Promise<IndicatorDto | null> {
    const normalized = normalizeIndicatorSlug(slug);

    if (!force && bySlug.value[normalized] && isSlugCacheFresh(normalized)) {
      return bySlug.value[normalized]!;
    }
    if (!force && inFlightBySlug[normalized]) {
      return inFlightBySlug[normalized]!;
    }

    // force=true starts a new request; generation bump makes any older in-flight response a no-op.
    const myGen = (fetchGenBySlug[normalized] = (fetchGenBySlug[normalized] ?? 0) + 1);

    loadingBySlug.value = { ...loadingBySlug.value, [normalized]: true };
    errorsBySlug.value = { ...errorsBySlug.value, [normalized]: null };

    const isCurrent = () => fetchGenBySlug[normalized] === myGen;

    // Box so the finally clause can compare promise identity without TS2454 / prefer-const.
    const flight: { task: Promise<IndicatorDto | null> | null } = { task: null };
    flight.task = (async () => {
      try {
        const response = await apiFetch(`/api/indicators/${encodeURIComponent(normalized)}`);
        if (!isCurrent()) {
          return bySlug.value[normalized] ?? null;
        }
        if (!response.ok) {
          // Evict only on 404 (gone). A forced retry that hits 5xx must keep the
          // last good cache so the hero does not flash "Data Belum Tersedia".
          if (response.status === 404) {
            const next = { ...bySlug.value };
            const nextAt = { ...bySlugFetchedAt.value };
            delete next[normalized];
            delete nextAt[normalized];
            bySlug.value = next;
            bySlugFetchedAt.value = nextAt;
            errorsBySlug.value = { ...errorsBySlug.value, [normalized]: null };
            return null;
          }
          throw await apiErrorFromResponse(response, '/api/indicators/:id', 'GET');
        }
        const data = (await response.json()) as { indicator?: IndicatorDto };
        if (!isCurrent()) {
          return bySlug.value[normalized] ?? null;
        }
        if (
          data &&
          typeof data === 'object' &&
          data.indicator &&
          typeof data.indicator === 'object' &&
          typeof data.indicator.slug === 'string'
        ) {
          stampSlugCache(normalized, data.indicator);
          return data.indicator;
        }
        // Malformed body on 200 OK: keep the previous cached value (same as 5xx), do not delete.
        throw new Error('Format data indikator dari server tidak valid');
      } catch (err) {
        if (!isCurrent()) {
          return bySlug.value[normalized] ?? null;
        }
        errorsBySlug.value = {
          ...errorsBySlug.value,
          [normalized]: toUserMessage(err, 'memuat indikator', 'GET').message,
        };
        return null;
      } finally {
        // Only this request may drop its own in-flight slot.
        if (inFlightBySlug[normalized] === flight.task) {
          delete inFlightBySlug[normalized];
        }
        if (isCurrent()) {
          loadingBySlug.value = { ...loadingBySlug.value, [normalized]: false };
        } else if (!inFlightBySlug[normalized] && loadingBySlug.value[normalized]) {
          // Superseded and nothing newer is tracked — clear a stuck spinner
          // (e.g. generation bumped by replace/delete without a new fetch).
          loadingBySlug.value = { ...loadingBySlug.value, [normalized]: false };
        }
      }
    })();

    inFlightBySlug[normalized] = flight.task;
    return flight.task;
  }

  function findBySlug(slug: string): IndicatorDto | null {
    const normalized = normalizeIndicatorSlug(slug);
    return bySlug.value[normalized] ?? null;
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
    deleteIndicator,
    replaceIndicator,
    bySectionId,
    loadingBySectionId,
    errorsBySectionId,
    fetchBySectionId,
    bySlug,
    bySlugFetchedAt,
    loadingBySlug,
    errorsBySlug,
    fetchBySlug,
    findBySlug,
  };
});
