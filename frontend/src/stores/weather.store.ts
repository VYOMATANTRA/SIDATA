import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface WeatherForecastEntry {
  datetime: string;
  temperatureCelsius: number | null;
  humidityPercent: number | null;
  description: string;
  windSpeedKmh: number | null;
  windDirection: string;
}

export interface WeatherLocation {
  desa: string;
  lat: number;
  lon: number;
}

export interface WeatherData {
  location: WeatherLocation;
  forecast: WeatherForecastEntry[];
  fetchedAt: string;
  stale: boolean;
}

export const WIND_DIRECTION_MAP: Record<string, string> = {
  N: 'Utara',
  NNE: 'Utara Timur Laut',
  NE: 'Timur Laut',
  ENE: 'Timur Timur Laut',
  E: 'Timur',
  ESE: 'Timur Menenggara',
  SE: 'Tenggara',
  SSE: 'Selatan Menenggara',
  S: 'Selatan',
  SSW: 'Selatan Barat Daya',
  SW: 'Barat Daya',
  WSW: 'Barat Barat Daya',
  W: 'Barat',
  WNW: 'Barat Barat Laut',
  NW: 'Barat Laut',
  NNW: 'Utara Barat Laut',
  VARIABLE: 'Berubah-ubah',
  CALM: 'Tenang',
};

/**
 * Localizes wind direction compass codes into standard Indonesian terms.
 */
export function localizeWindDirection(direction?: string | null): string {
  if (!direction || typeof direction !== 'string') return '-';
  const trimmed = direction.trim();
  if (!trimmed) return '-';
  const upper = trimmed.toUpperCase();
  if (WIND_DIRECTION_MAP[upper]) {
    return WIND_DIRECTION_MAP[upper];
  }
  return trimmed;
}

/**
 * Parses forecast datetime strings into Unix timestamp milliseconds.
 * If timezone is not present, assumes WITA (UTC+8) for Kelurahan Manggar.
 */
export function parseForecastDatetime(datetime: string): number {
  if (!datetime || typeof datetime !== 'string') return 0;
  const trimmed = datetime.trim();
  if (!trimmed) return 0;

  // If already contains timezone offset (+08:00, Z, etc.), parse directly
  if (/[+-]\d{2}:?\d{2}$|Z$/i.test(trimmed)) {
    const parsed = Date.parse(trimmed);
    return isNaN(parsed) ? 0 : parsed;
  }

  // BMKG forecast datetimes for Kelurahan Manggar are local time WITA (UTC+8).
  const isoFormatted = trimmed.replace(' ', 'T') + '+08:00';
  const parsed = Date.parse(isoFormatted);
  if (!isNaN(parsed)) {
    return parsed;
  }

  const fallback = Date.parse(trimmed);
  return isNaN(fallback) ? 0 : fallback;
}

/**
 * Determines the active or nearest forecast slot index from a chronological list.
 */
export function findCurrentForecastIndex(
  forecast: WeatherForecastEntry[],
  now: Date = new Date(),
): number {
  if (!forecast || forecast.length === 0) return -1;
  const nowMs = now.getTime();

  let activeIndex = -1;
  for (let i = 0; i < forecast.length; i++) {
    const entryMs = parseForecastDatetime(forecast[i]!.datetime);
    if (entryMs > 0 && entryMs <= nowMs) {
      activeIndex = i;
    } else if (entryMs > nowMs) {
      break;
    }
  }

  // If at least one entry has started, return the latest active entry
  if (activeIndex !== -1) {
    return activeIndex;
  }

  // If all entries are in the future, pick the first one (closest future)
  return 0;
}

export const WEATHER_CLIENT_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes client cache TTL

export const useWeatherStore = defineStore('weather', () => {
  const data = ref<WeatherData | null>(null);
  const isLoading = ref(false);
  const isLoaded = ref(false);
  const error = ref<string | null>(null);
  const lastFetchedAt = ref<Date | null>(null);
  const referenceTime = ref<Date | null>(null);

  let inFlight: Promise<WeatherData | null> | null = null;

  const isStale = computed(() => Boolean(data.value?.stale));
  const location = computed(() => data.value?.location ?? null);
  const locationName = computed(() => data.value?.location.desa || 'Manggar');
  const fetchedAt = computed(() => data.value?.fetchedAt ?? null);

  const sortedForecast = computed<WeatherForecastEntry[]>(() => {
    if (!data.value?.forecast || data.value.forecast.length === 0) return [];
    const sorted = [...data.value.forecast].sort(
      (a, b) => parseForecastDatetime(a.datetime) - parseForecastDatetime(b.datetime),
    );
    // Deduplicate any consecutive entries with identical datetime timestamps
    return sorted.filter((entry, idx, arr) => {
      if (idx === 0) return true;
      return entry.datetime !== arr[idx - 1]?.datetime;
    });
  });

  const currentEntryIndex = computed(() => {
    return findCurrentForecastIndex(sortedForecast.value, referenceTime.value ?? new Date());
  });

  const currentEntry = computed<WeatherForecastEntry | null>(() => {
    const list = sortedForecast.value;
    const idx = currentEntryIndex.value;
    if (idx < 0 || idx >= list.length) return null;
    return list[idx] ?? null;
  });

  const upcomingEntries = computed<WeatherForecastEntry[]>(() => {
    const list = sortedForecast.value;
    const idx = currentEntryIndex.value;
    if (idx < 0) return [];
    return list.slice(idx + 1, idx + 3);
  });

  const windDirectionLocalized = computed(() => {
    return currentEntry.value?.windDirection
      ? localizeWindDirection(currentEntry.value.windDirection)
      : '-';
  });

  async function fetchWeather(force = false): Promise<WeatherData | null> {
    const isCacheFresh =
      isLoaded.value &&
      data.value &&
      lastFetchedAt.value &&
      Date.now() - lastFetchedAt.value.getTime() < WEATHER_CLIENT_CACHE_TTL_MS;

    if (!force && isCacheFresh) {
      return data.value;
    }

    if (inFlight) {
      return inFlight;
    }

    isLoading.value = true;
    error.value = null;

    inFlight = (async () => {
      try {
        const res = await fetch('/api/weather', {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          const detail =
            errJson && typeof errJson === 'object' && typeof errJson.error === 'string'
              ? `: ${errJson.error}`
              : '';
          throw new Error(`Gagal memuat data cuaca (HTTP ${res.status})${detail}`);
        }

        const json = await res.json();
        if (!json || typeof json !== 'object' || !Array.isArray(json.forecast)) {
          throw new Error('Format respons data cuaca tidak valid');
        }

        data.value = {
          location: {
            desa:
              json.location && typeof json.location.desa === 'string'
                ? json.location.desa
                : 'Manggar',
            lat:
              json.location && typeof json.location.lat === 'number' ? json.location.lat : -1.2251,
            lon:
              json.location && typeof json.location.lon === 'number' ? json.location.lon : 116.9438,
          },
          forecast: json.forecast.map((entry: Partial<WeatherForecastEntry>) => ({
            datetime: typeof entry?.datetime === 'string' ? entry.datetime : '',
            temperatureCelsius:
              typeof entry?.temperatureCelsius === 'number' &&
              Number.isFinite(entry.temperatureCelsius)
                ? entry.temperatureCelsius
                : null,
            humidityPercent:
              typeof entry?.humidityPercent === 'number' && Number.isFinite(entry.humidityPercent)
                ? entry.humidityPercent
                : null,
            description: typeof entry?.description === 'string' ? entry.description : '',
            windSpeedKmh:
              typeof entry?.windSpeedKmh === 'number' && Number.isFinite(entry.windSpeedKmh)
                ? entry.windSpeedKmh
                : null,
            windDirection: typeof entry?.windDirection === 'string' ? entry.windDirection : '',
          })),
          fetchedAt: typeof json.fetchedAt === 'string' ? json.fetchedAt : new Date().toISOString(),
          stale: Boolean(json.stale),
        };

        lastFetchedAt.value = new Date();
        isLoaded.value = true;
        return data.value;
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Gagal memuat data cuaca';
        return data.value;
      } finally {
        isLoading.value = false;
        inFlight = null;
      }
    })();

    return inFlight;
  }

  function setReferenceTime(time: Date | null) {
    referenceTime.value = time;
  }

  function resetState() {
    data.value = null;
    isLoading.value = false;
    isLoaded.value = false;
    error.value = null;
    lastFetchedAt.value = null;
    referenceTime.value = null;
    inFlight = null;
  }

  return {
    data,
    isLoading,
    isLoaded,
    error,
    lastFetchedAt,
    isStale,
    location,
    locationName,
    fetchedAt,
    sortedForecast,
    currentEntry,
    upcomingEntries,
    windDirectionLocalized,
    fetchWeather,
    setReferenceTime,
    resetState,
  };
});
