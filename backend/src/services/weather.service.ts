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

const weatherCacheMap = new Map<string, { result: WeatherForecastResult; expiresAt: number }>();
const inFlightMap = new Map<string, Promise<WeatherForecastResult>>();

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

async function fetchFresh(adm4: string = WEATHER_ADM4): Promise<WeatherForecastResult> {
  const bmkgResponse = await fetchBmkgForecast(adm4);
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

async function refresh(adm4: string = WEATHER_ADM4): Promise<WeatherForecastResult> {
  try {
    const result = await fetchFresh(adm4);
    weatherCacheMap.set(adm4, { result, expiresAt: Date.now() + WEATHER_CACHE_TTL_MS });
    return result;
  } catch (error) {
    const existing = weatherCacheMap.get(adm4);
    if (existing) {
      const staleResult = { ...existing.result, stale: true };
      weatherCacheMap.set(adm4, {
        result: staleResult,
        expiresAt: Date.now() + WEATHER_STALE_RETRY_MS,
      });
      return staleResult;
    }
    throw error;
  }
}

export async function getManggarForecast(
  adm4: string = WEATHER_ADM4,
): Promise<WeatherForecastResult> {
  const cached = weatherCacheMap.get(adm4);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  // Concurrent callers for the same adm4 share a single in-flight refresh.
  let pending = inFlightMap.get(adm4);
  if (!pending) {
    pending = refresh(adm4).finally(() => {
      inFlightMap.delete(adm4);
    });
    inFlightMap.set(adm4, pending);
  }

  return pending;
}

// Exposed for tests only, resets the module-level cache between cases.
export function resetWeatherCache(): void {
  weatherCacheMap.clear();
  inFlightMap.clear();
}

// Exposed for tests only, forces the next call to treat the cache as expired without discarding it, so the stale-fallback path can be exercised.
export function expireWeatherCacheForTests(adm4?: string): void {
  if (adm4) {
    const entry = weatherCacheMap.get(adm4);
    if (entry) {
      entry.expiresAt = 0;
    }
  } else {
    for (const entry of weatherCacheMap.values()) {
      entry.expiresAt = 0;
    }
  }
}
