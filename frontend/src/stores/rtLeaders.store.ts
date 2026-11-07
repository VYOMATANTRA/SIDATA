import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiErrorFromResponse } from '../utils/apiClient';
import { toUserMessage } from '../utils/userMessages';

export interface RtLeader {
  rtNumber: number;
  name: string;
  phone: string;
  phoneIsWhatsapp: boolean;
  alamat: string | null;
  coordinates: {
    latitude: number;
    longitude: number;
    pointId: string;
  } | null;
  /** Present only when the read path detects a data-integrity violation. */
  integrityWarning?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * The roster is bounded at 100 rows by a DB CHECK (`rt_number BETWEEN 1 AND 100`),
 * so one request is enough for the page's client-side filtering. The explicit
 * `limit` is load-bearing: the endpoint's DEFAULT_PAGE_SIZE is 10, which would
 * silently return only the first 10 RTs.
 */
const RT_LEADERS_ENDPOINT = '/api/maps/rt-leaders?limit=100';
export const RT_LEADERS_CACHE_TTL_MS = 60_000;

/**
 * A row without a usable number, name, or phone cannot be rendered or searched,
 * so it is dropped rather than allowed to break the table.
 */
function isRtLeader(value: unknown): value is RtLeader {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<RtLeader>;
  return (
    typeof candidate.rtNumber === 'number' &&
    Number.isFinite(candidate.rtNumber) &&
    typeof candidate.name === 'string' &&
    typeof candidate.phone === 'string' &&
    typeof candidate.phoneIsWhatsapp === 'boolean'
  );
}

export const useRtLeadersStore = defineStore('rtLeaders', () => {
  const rtLeaders = ref<RtLeader[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  /** True once a fetch has settled (success or failure), so the page can tell "not loaded" from "empty". */
  const hasSettled = ref(false);
  /** Rows the API returned that could not be rendered. */
  const rejectedCount = ref(0);
  /** From system_settings via the list API — not inferred from phone placeholders. */
  const isSampleRoster = ref(false);

  let inFlight: Promise<void> | null = null;
  let activeRequestId = 0;
  let lastFetchedAt = 0;

  async function fetchRtLeaders(force = false): Promise<void> {
    if (!force && inFlight) return inFlight;
    if (
      !force &&
      hasSettled.value &&
      Date.now() - lastFetchedAt < RT_LEADERS_CACHE_TTL_MS - 1_000
    ) {
      return;
    }

    // Keep the previously loaded roster visible until a forced refetch succeeds,
    // so a failed retry does not blank the page.
    const currentRequestId = ++activeRequestId;
    const isBackground = !force && hasSettled.value;
    if (!isBackground) {
      isLoading.value = true;
    }
    error.value = null;

    inFlight = (async () => {
      try {
        const response = await fetch(RT_LEADERS_ENDPOINT);
        if (currentRequestId !== activeRequestId) return;
        if (!response.ok) {
          throw await apiErrorFromResponse(response, RT_LEADERS_ENDPOINT, 'GET');
        }

        const data = (await response.json()) as {
          leaders?: unknown;
          isSampleRoster?: unknown;
        };
        const rows = Array.isArray(data.leaders) ? data.leaders : [];
        const valid = rows.filter(isRtLeader);
        if (currentRequestId !== activeRequestId) return;
        rejectedCount.value = rows.length - valid.length;
        rtLeaders.value = [...valid].sort((a, b) => a.rtNumber - b.rtNumber);
        isSampleRoster.value = data.isSampleRoster === true;
        lastFetchedAt = Date.now();
      } catch (err) {
        if (currentRequestId !== activeRequestId) return;
        error.value = toUserMessage(err, 'memuat data Ketua RT', 'GET').message;
      } finally {
        if (currentRequestId === activeRequestId) {
          isLoading.value = false;
          hasSettled.value = true;
          inFlight = null;
        }
      }
    })();

    return inFlight;
  }

  return {
    rtLeaders,
    isLoading,
    error,
    hasSettled,
    hasFetched: hasSettled,
    rejectedCount,
    isSampleRoster,
    fetchRtLeaders,
  };
});
