import { fetchBmkgForecast, type BmkgForecastEntry } from '../utils/bmkg.js';
import { WEATHER_ADM4, WEATHER_CACHE_TTL_MS, WEATHER_STALE_RETRY_MS } from '../configs/index.js';
import { KeyedLruCache } from '../utils/keyedCache.js';
import { getFastWeatherConfigSettings, onWeatherConfigInvalidated } from './settings.service.js';

export interface WeatherForecastEntry {
  datetime: string;
  temperatureCelsius: number;
  humidityPercent: number;
  description: string;
  windSpeedKmh: number;
  windDirection: string;
}

export interface WeatherForecastResult {
  location: { desa: string; lat: number; lon: number };
  forecast: WeatherForecastEntry[];
  fetchedAt: string;
  stale: boolean;
}

export const MAX_WEATHER_CACHE_ENTRIES = 5;

let globalGeneration = 0;
const cacheGenerationMap = new Map<string, number>();

function getGeneration(key: string): number {
  return (cacheGenerationMap.get(key) ?? 0) + globalGeneration;
}

const weatherCacheMap = new KeyedLruCache<
  string,
  { result: WeatherForecastResult; expiresAt: number }
>(MAX_WEATHER_CACHE_ENTRIES);
const inFlightMap = new Map<string, Promise<WeatherForecastResult>>();

// Subscribe to settings changes to evict cache automatically without circular imports
onWeatherConfigInvalidated(() => {
  evictWeatherCache();
});

function mapEntry(entry: BmkgForecastEntry): WeatherForecastEntry {
  return {
    datetime: entry.local_datetime,
    temperatureCelsius: entry.t,
    humidityPercent: entry.hu,
    description: entry.weather_desc,
    windSpeedKmh: entry.ws,
    windDirection: entry.wd,
  };
}

async function fetchFresh(
  adm4: string = WEATHER_ADM4,
  options?: { baseUrl?: string; timeoutMs?: number },
): Promise<WeatherForecastResult> {
  const bmkgResponse = await fetchBmkgForecast(adm4, options);
  const firstLocation = bmkgResponse.data[0];

  if (!firstLocation) {
    throw new Error('Respons BMKG tidak berisi data prakiraan cuaca');
  }

  return {
    location: {
      desa: bmkgResponse.lokasi.desa,
      lat: bmkgResponse.lokasi.lat,
      lon: bmkgResponse.lokasi.lon,
    },
    forecast: firstLocation.cuaca.flat().map(mapEntry),
    fetchedAt: new Date().toISOString(),
    stale: false,
  };
}

async function refresh(
  adm4: string = WEATHER_ADM4,
  startGen: number = getGeneration(adm4),
): Promise<WeatherForecastResult> {
  let cacheTtlMs = WEATHER_CACHE_TTL_MS;
  let staleRetryMs = WEATHER_STALE_RETRY_MS;
  let baseUrl: string | undefined;
  let timeoutMs: number | undefined;

  try {
    const config = await getFastWeatherConfigSettings({ timeoutMs: 150 });
    cacheTtlMs = config.cacheTtlMs;
    staleRetryMs = config.staleRetryMs;
    baseUrl = config.bmkgBaseUrl;
    timeoutMs = config.fetchTimeoutMs;
  } catch {
    // Fall back safely to module defaults
  }

  try {
    const result = await fetchFresh(adm4, { baseUrl, timeoutMs });
    if (getGeneration(adm4) === startGen) {
      weatherCacheMap.set(adm4, { result, expiresAt: Date.now() + cacheTtlMs });
    }
    return result;
  } catch (error) {
    const existing = weatherCacheMap.get(adm4);
    if (existing && getGeneration(adm4) === startGen) {
      const staleResult = { ...existing.result, stale: true };
      weatherCacheMap.set(adm4, {
        result: staleResult,
        expiresAt: Date.now() + staleRetryMs,
      });
      return staleResult;
    }
    throw error;
  }
}

export async function getManggarForecast(
  adm4: string = WEATHER_ADM4,
): Promise<WeatherForecastResult> {
  const normalizedAdm4 = typeof adm4 === 'string' && adm4.trim() ? adm4.trim() : WEATHER_ADM4;
  const cached = weatherCacheMap.get(normalizedAdm4);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  // Concurrent callers for the same adm4 share a single in-flight refresh.
  let pending = inFlightMap.get(normalizedAdm4);
  if (!pending) {
    const currentGen = getGeneration(normalizedAdm4);
    const inFlightPromise = refresh(normalizedAdm4, currentGen).finally(() => {
      if (inFlightMap.get(normalizedAdm4) === inFlightPromise) {
        inFlightMap.delete(normalizedAdm4);
      }
    });
    inFlightMap.set(normalizedAdm4, inFlightPromise);
    pending = inFlightPromise;
  }

  return pending;
}

/**
 * Evicts cached weather forecasts and active in-flight tracking for a specific adm4 code,
 * or clears all entries if no adm4 is provided.
 */
export function evictWeatherCache(adm4?: string): void {
  const trimmed = typeof adm4 === 'string' ? adm4.trim() : '';
  if (trimmed) {
    cacheGenerationMap.set(trimmed, (cacheGenerationMap.get(trimmed) ?? 0) + 1);
    weatherCacheMap.delete(trimmed);
    inFlightMap.delete(trimmed);
  } else {
    globalGeneration++;
    cacheGenerationMap.clear();
    weatherCacheMap.clear();
    inFlightMap.clear();
  }
}

// Exposed for tests only, resets the module-level cache between cases.
export function resetWeatherCache(): void {
  evictWeatherCache();
}

// Exposed for tests only, returns current cached adm4 keys.
export function getWeatherCacheKeysForTests(): string[] {
  return Array.from(weatherCacheMap.keys());
}

// Exposed for tests only, forces the next call to treat the cache as expired without discarding it, so the stale-fallback path can be exercised.
export function expireWeatherCacheForTests(adm4?: string): void {
  const trimmed = typeof adm4 === 'string' ? adm4.trim() : '';
  if (trimmed) {
    const entry = weatherCacheMap.peek(trimmed);
    if (entry) {
      entry.expiresAt = 0;
    }
  } else {
    for (const entry of weatherCacheMap.values()) {
      entry.expiresAt = 0;
    }
  }
}
