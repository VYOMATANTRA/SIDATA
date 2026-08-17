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

export async function fetchBmkgForecast(adm4: string): Promise<BmkgResponse> {
  const url = `${BMKG_BASE_URL}?adm4=${encodeURIComponent(adm4)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(WEATHER_FETCH_TIMEOUT_MS) });

  if (!response.ok) {
    throw new Error(`BMKG API merespons dengan status ${response.status}`);
  }

  const json = await response.json();
  return bmkgResponseSchema.parse(json);
}
