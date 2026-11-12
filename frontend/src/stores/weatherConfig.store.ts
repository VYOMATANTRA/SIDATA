import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { apiRequestJson } from '../utils/apiClient';
import { toUserMessage } from '../utils/userMessages';

/**
 * Admin-only operational weather settings (SPEC §7). The API carries four values; the Admin
 * screen edits exactly one of them, the refresh interval (`cacheTtlMs`), through named presets
 * (`utils/weatherRefresh.ts`). The other three (BMKG address, retry wait, request timeout) stay
 * server-side: they are held here only to describe the stored state, never sent back, never shown.
 */
export interface WeatherConfig {
  bmkgBaseUrl: string;
  cacheTtlMs: number;
  staleRetryMs: number;
  fetchTimeoutMs: number;
}

/** Approved wording when the server refuses a value: its own sentence quotes "Cache TTL" and ms. */
export const WEATHER_SAVE_REFUSED_MESSAGE =
  'Gagal menyimpan pengaturan cuaca. Pilihan ini tidak dapat diterapkan. Muat ulang halaman lalu coba lagi.';

function parseConfig(raw: unknown): WeatherConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const candidate = raw as Record<string, unknown>;
  const { bmkgBaseUrl, cacheTtlMs, staleRetryMs, fetchTimeoutMs } = candidate;
  const isMs = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;
  if (typeof bmkgBaseUrl !== 'string' || !isMs(cacheTtlMs)) return null;
  if (!isMs(staleRetryMs) || !isMs(fetchTimeoutMs)) return null;
  return { bmkgBaseUrl, cacheTtlMs, staleRetryMs, fetchTimeoutMs };
}

export const useWeatherConfigStore = defineStore('weatherConfig', () => {
  const config = ref<WeatherConfig | null>(null);
  const isLoading = ref(false);
  const isSaving = ref(false);
  const error = ref<string | null>(null);
  const saveError = ref<string | null>(null);

  const isLoaded = computed(() => config.value !== null);
  const cacheTtlMs = computed(() => config.value?.cacheTtlMs ?? null);

  async function fetchConfig(): Promise<boolean> {
    isLoading.value = true;
    error.value = null;
    try {
      const data = await apiRequestJson<{ settings?: unknown }>('/api/settings/weather-config', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const parsed = parseConfig(data?.settings);
      if (!parsed) {
        error.value = 'Pengaturan cuaca dari server tidak dapat dibaca. Coba muat ulang halaman.';
        return false;
      }
      config.value = parsed;
      return true;
    } catch (err) {
      error.value = toUserMessage(err, 'memuat pengaturan cuaca', 'GET').message;
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Saves a new refresh interval. Sends `cacheTtlMs` and nothing else: the server keeps the
   * values this screen does not edit, and an Admin never overwrites them by accident.
   */
  async function saveRefreshInterval(nextCacheTtlMs: number): Promise<boolean> {
    isSaving.value = true;
    saveError.value = null;
    try {
      const data = await apiRequestJson<{ settings?: unknown }>('/api/settings/weather-config', {
        method: 'PATCH',
        body: JSON.stringify({ cacheTtlMs: nextCacheTtlMs }),
      });
      const parsed = parseConfig(data?.settings);
      if (parsed) {
        config.value = parsed;
      } else if (config.value) {
        config.value = { ...config.value, cacheTtlMs: nextCacheTtlMs };
      }
      return true;
    } catch (err) {
      const mapped = toUserMessage(err, 'menyimpan pengaturan cuaca');
      saveError.value =
        mapped.kind === 'validation' ? WEATHER_SAVE_REFUSED_MESSAGE : mapped.message;
      return false;
    } finally {
      isSaving.value = false;
    }
  }

  function clearSaveError(): void {
    saveError.value = null;
  }

  return {
    config,
    isLoading,
    isSaving,
    isLoaded,
    error,
    saveError,
    cacheTtlMs,
    fetchConfig,
    saveRefreshInterval,
    clearSaveError,
  };
});
