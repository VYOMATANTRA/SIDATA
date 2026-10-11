import { defineStore } from 'pinia';
import { ref } from 'vue';

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

export const useRtLeadersStore = defineStore('rtLeaders', () => {
  const rtLeaders = ref<RtLeader[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  let inFlight: Promise<void> | null = null;

  async function fetchRtLeaders(force = false): Promise<void> {
    if (inFlight) return inFlight;
    if (!force && rtLeaders.value.length > 0) return;

    isLoading.value = true;
    error.value = null;

    inFlight = (async () => {
      try {
        const response = await fetch(RT_LEADERS_ENDPOINT);
        if (!response.ok) {
          throw new Error(`Gagal memuat data Ketua RT (status ${response.status})`);
        }

        const data = (await response.json()) as { leaders?: RtLeader[] };
        rtLeaders.value = Array.isArray(data.leaders)
          ? [...data.leaders].sort((a, b) => a.rtNumber - b.rtNumber)
          : [];
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Terjadi kesalahan jaringan';
      } finally {
        isLoading.value = false;
        inFlight = null;
      }
    })();

    return inFlight;
  }

  return {
    rtLeaders,
    isLoading,
    error,
    fetchRtLeaders,
  };
});
