import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiRequestJson } from '../utils/apiClient';
import { mergeHighlightIds, statPageSlugs } from '../utils/statHighlights';
import { toUserMessage, type FailureKind } from '../utils/userMessages';

/**
 * The statistics a topic's landing card shows, as chosen in the Cerita editor (SPEC §8). Read from
 * the public `GET /api/pages/highlights`. With nothing chosen the server answers the first four
 * indicators in content order and `isFallback: true`.
 */

export interface PageHighlight {
  /** Display order, at most four indicator ids. */
  indicatorIds: string[];
  isFallback: boolean;
}

function parseHighlights(raw: unknown): Record<string, PageHighlight> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const parsed: Record<string, PageHighlight> = {};
  for (const [slug, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null) continue;
    const record = value as { indicatorIds?: unknown; isFallback?: unknown };
    if (!Array.isArray(record.indicatorIds)) continue;
    parsed[slug.toLowerCase()] = {
      indicatorIds: record.indicatorIds.filter((id): id is string => typeof id === 'string'),
      isFallback: record.isFallback === true,
    };
  }
  return parsed;
}

export const usePageHighlightsStore = defineStore('pageHighlights', () => {
  const highlightsBySlug = ref<Record<string, PageHighlight>>({});
  const isLoading = ref(false);
  const isLoaded = ref(false);
  const error = ref<string | null>(null);
  /** Failure class of `error`, for AlertBanner; null while `error` is null. */
  const errorKind = ref<FailureKind | null>(null);

  let inFlight: Promise<void> | null = null;
  /** Bumped per request so a slower, older response cannot overwrite a newer one. */
  let requestId = 0;

  async function fetchHighlights(force = false): Promise<void> {
    if (isLoaded.value && !force) return;
    if (!force && inFlight) return inFlight;

    const myRequest = ++requestId;
    isLoading.value = true;
    error.value = null;
    errorKind.value = null;

    const task = (async () => {
      try {
        const data = await apiRequestJson<{ highlights?: unknown }>('/api/pages/highlights');
        if (myRequest !== requestId) return;
        highlightsBySlug.value = parseHighlights(data.highlights);
        isLoaded.value = true;
      } catch (err) {
        // Keep the last good map: a failed refetch must not blank the landing cards.
        if (myRequest !== requestId) return;
        const mapped = toUserMessage(err, 'memuat statistik unggulan', 'GET');
        error.value = mapped.message;
        errorKind.value = mapped.kind;
      } finally {
        if (myRequest === requestId) {
          isLoading.value = false;
          inFlight = null;
        }
      }
    })();

    inFlight = task;
    return task;
  }

  /**
   * The chosen indicator ids for a topic, the waste topic's two slugs merged and capped at four.
   * Undefined when the map has no entry for the topic, so the caller falls back to content order.
   */
  function idsForPage(pageSlug: string): string[] | undefined {
    const lists = statPageSlugs(pageSlug)
      .map((slug) => highlightsBySlug.value[slug]?.indicatorIds)
      .filter((ids): ids is string[] => Array.isArray(ids));
    return lists.length > 0 ? mergeHighlightIds(lists) : undefined;
  }

  return {
    highlightsBySlug,
    isLoading,
    isLoaded,
    error,
    errorKind,
    fetchHighlights,
    idsForPage,
  };
});
