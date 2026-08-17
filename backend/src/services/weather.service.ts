import { fetchBmkgForecast, type BmkgForecastEntry } from '../utils/bmkg.js';
import { WEATHER_ADM4, WEATHER_CACHE_TTL_MS, WEATHER_STALE_RETRY_MS } from '../configs/index.js';

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

let cache: { result: WeatherForecastResult; expiresAt: number } | null = null;
let inFlight: Promise<WeatherForecastResult> | null = null;

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

async function fetchFresh(): Promise<WeatherForecastResult> {
  const bmkgResponse = await fetchBmkgForecast(WEATHER_ADM4);
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

async function refresh(): Promise<WeatherForecastResult> {
  try {
    const result = await fetchFresh();
    cache = { result, expiresAt: Date.now() + WEATHER_CACHE_TTL_MS };
    return result;
  } catch (error) {
    if (cache) {
      const staleResult = { ...cache.result, stale: true };
      cache = { result: staleResult, expiresAt: Date.now() + WEATHER_STALE_RETRY_MS };
      return staleResult;
    }
    throw error;
  }
}

export async function getManggarForecast(): Promise<WeatherForecastResult> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.result;
  }

  // Concurrent callers on a cold/expired cache share this single in-flight refresh instead of each triggering their own BMKG fetch.
  if (!inFlight) {
    inFlight = refresh().finally(() => {
      inFlight = null;
    });
  }

  return inFlight;
}

// Exposed for tests only, resets the module-level cache between cases.
export function resetWeatherCache(): void {
  cache = null;
  inFlight = null;
}

// Exposed for tests only, forces the next call to treat the cache as expired without discarding it, so the stale-fallback path can be exercised.
export function expireWeatherCacheForTests(): void {
  if (cache) {
    cache.expiresAt = 0;
  }
}
