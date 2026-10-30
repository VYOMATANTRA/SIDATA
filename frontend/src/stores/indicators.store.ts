import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { apiFetch, apiRequestJson } from '../utils/apiClient';

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
  comparisonTemplateId: string | null;
  /** Rendered server-side from the attached tier-1 template; null when there is nothing to say. */
  comparison: RenderedComparison | null;
  createdAt: string;
  updatedAt: string;
}

/** The public Cerita read names the same shapes `…Dto`; keep both import paths working. */
export type IndicatorDto = Indicator;
export type IndicatorComparison = RenderedComparison;

/** Public hero figures: short TTL so SPA sessions do not keep deleted/edited values forever. */
export const BY_SLUG_TTL_MS = 60_000;

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
  // --- CMS: full list + edits ---
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

  /** Drop every bySlug entry for this indicator id and/or slug key. */
  function evictSlugCacheForIndicator(id: string, slug?: string | null): void {
    const slugKey = typeof slug === 'string' ? slug.trim().toLowerCase() : null;
    const next = { ...bySlug.value };
    const nextAt = { ...bySlugFetchedAt.value };
    let changed = false;
    for (const [k, v] of Object.entries(next)) {
      if (v.id === id || (slugKey !== null && k === slugKey)) {
        delete next[k];
        delete nextAt[k];
        changed = true;
      }
    }
    if (changed) {
      bySlug.value = next;
      bySlugFetchedAt.value = nextAt;
    }
  }

  function bumpSlugFetchGeneration(...keys: Array<string | null | undefined>): void {
    for (const key of keys) {
      if (typeof key !== 'string') continue;
      const normalized = key.trim().toLowerCase();
      if (!normalized) continue;
      fetchGenBySlug[normalized] = (fetchGenBySlug[normalized] ?? 0) + 1;
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
    invalidateSectionCache(updated.sectionId);

    const newSlugKey = updated.slug.trim().toLowerCase();
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
        error.value = err instanceof Error ? err.message : 'Gagal memuat daftar indikator.';
      } finally {
        isLoading.value = false;
        inFlight = null;
      }
    })();

    return inFlight;
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

  async function deleteIndicator(id: string): Promise<void> {
    const existing =
      indicators.value.find((item) => item.id === id) ??
      Object.values(bySlug.value).find((item) => item.id === id) ??
      null;
    await apiRequestJson(`/api/indicators/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (existing?.slug) bumpSlugFetchGeneration(existing.slug);
    for (const [k, v] of Object.entries(bySlug.value)) {
      if (v.id === id) bumpSlugFetchGeneration(k);
    }
    evictSlugCacheForIndicator(id, existing?.slug ?? null);
    if (existing) invalidateSectionCache(existing.sectionId);
    const next = indicators.value.filter((item) => item.id !== id);
    if (next.length !== indicators.value.length) {
      indicators.value = next;
      total.value = Math.max(0, total.value - 1);
    }
  }

  async function fetchBySlug(slug: string, force = false): Promise<IndicatorDto | null> {
    const normalized = slug.trim().toLowerCase();

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
          if (response.status === 404 || force) {
            const next = { ...bySlug.value };
            const nextAt = { ...bySlugFetchedAt.value };
            delete next[normalized];
            delete nextAt[normalized];
            bySlug.value = next;
            bySlugFetchedAt.value = nextAt;
          }
          throw new Error(`Gagal memuat indikator (status ${response.status})`);
        }
        const data = (await response.json()) as { indicator?: IndicatorDto };
        if (!isCurrent()) {
          return bySlug.value[normalized] ?? null;
        }
        if (
          data.indicator &&
          typeof data.indicator === 'object' &&
          typeof data.indicator.slug === 'string'
        ) {
          stampSlugCache(normalized, data.indicator);
          return data.indicator;
        }
        // Valid empty / unpublished / invalid format: clear any stale hit.
        const next = { ...bySlug.value };
        const nextAt = { ...bySlugFetchedAt.value };
        delete next[normalized];
        delete nextAt[normalized];
        bySlug.value = next;
        bySlugFetchedAt.value = nextAt;
        throw new Error('Format data indikator tidak valid');
      } catch (err) {
        if (!isCurrent()) {
          return bySlug.value[normalized] ?? null;
        }
        errorsBySlug.value = {
          ...errorsBySlug.value,
          [normalized]: err instanceof Error ? err.message : 'Terjadi kesalahan jaringan',
        };
        return null;
      } finally {
        // Only the current request may clear tracking / loading for this slug.
        if (inFlightBySlug[normalized] === flight.task) {
          delete inFlightBySlug[normalized];
        }
        if (isCurrent()) {
          loadingBySlug.value = { ...loadingBySlug.value, [normalized]: false };
        }
      }
    })();

    inFlightBySlug[normalized] = flight.task;
    return flight.task;
  }

  function findBySlug(slug: string): IndicatorDto | null {
    const normalized = slug.trim().toLowerCase();
    return bySlug.value[normalized] ?? null;
  }

  return {
    indicators,
    total,
    isLoading,
    isLoaded,
    error,
    staleCount,
    bySectionId,
    loadingBySectionId,
    errorsBySectionId,
    fetchIndicators,
    updateIndicator,
    deleteIndicator,
    replaceIndicator,
    fetchBySectionId,
    bySlug,
    bySlugFetchedAt,
    loadingBySlug,
    errorsBySlug,
    fetchBySlug,
    findBySlug,
    evictSlugCacheForIndicator,
  };
});
