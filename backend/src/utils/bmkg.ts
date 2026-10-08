import { z } from 'zod';
import { BMKG_BASE_URL, WEATHER_FETCH_TIMEOUT_MS } from '../configs/index.js';

const forecastEntrySchema = z.object({
  local_datetime: z.string(),
  t: z.number(),
  hu: z.number(),
  weather_desc: z.string(),
  ws: z.number(),
  wd: z.string(),
});

const bmkgResponseSchema = z.object({
  lokasi: z.object({
    desa: z.string(),
    lat: z.number(),
    lon: z.number(),
  }),
  data: z.array(
    z.object({
      cuaca: z.array(z.array(forecastEntrySchema)),
    }),
  ),
});

export type BmkgForecastEntry = z.infer<typeof forecastEntrySchema>;
export type BmkgResponse = z.infer<typeof bmkgResponseSchema>;

export interface BmkgFetchOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

export async function fetchBmkgForecast(
  adm4: string,
  options?: BmkgFetchOptions,
): Promise<BmkgResponse> {
  const baseUrl = options?.baseUrl?.trim() || BMKG_BASE_URL;
  const timeoutMs =
    typeof options?.timeoutMs === 'number' && options.timeoutMs > 0
      ? options.timeoutMs
      : WEATHER_FETCH_TIMEOUT_MS;

  const url = `${baseUrl}?adm4=${encodeURIComponent(adm4)}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error',
  });

  if (!response.ok) {
    throw new Error(`BMKG API merespons dengan status ${response.status}`);
  }

  const json = await response.json();
  return bmkgResponseSchema.parse(json);
}

export async function validateBmkgAdm4(adm4: string, options?: BmkgFetchOptions): Promise<void> {
  const response = await fetchBmkgForecast(adm4, options);
  if (!response.data || response.data.length === 0) {
    throw new Error('Kode adm4 BMKG tidak memiliki data prakiraan cuaca');
  }
}
