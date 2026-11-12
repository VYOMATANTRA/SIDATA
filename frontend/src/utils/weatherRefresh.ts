/**
 * Friendly refresh choices for the weather forecast (SPEC §7). The protected operational API
 * (`/api/settings/weather-config`) stores the interval in milliseconds as `cacheTtlMs`; Admins
 * only ever see these named choices, never the number.
 */

export type WeatherRefreshPresetId = '30m' | '1h' | '2h';

export interface WeatherRefreshPreset {
  id: WeatherRefreshPresetId;
  label: string;
  /** Value stored as `cacheTtlMs`. */
  cacheTtlMs: number;
}

const MINUTE_MS = 60_000;

export const WEATHER_REFRESH_PRESETS: readonly WeatherRefreshPreset[] = [
  { id: '30m', label: 'Setiap 30 menit', cacheTtlMs: 30 * MINUTE_MS },
  { id: '1h', label: 'Setiap 1 jam (standar)', cacheTtlMs: 60 * MINUTE_MS },
  { id: '2h', label: 'Setiap 2 jam', cacheTtlMs: 120 * MINUTE_MS },
];

/** The preset a stored value corresponds to, or null for any other (custom) value. */
export function presetForCacheTtl(
  cacheTtlMs: number | null | undefined,
): WeatherRefreshPreset | null {
  if (typeof cacheTtlMs !== 'number') return null;
  return WEATHER_REFRESH_PRESETS.find((preset) => preset.cacheTtlMs === cacheTtlMs) ?? null;
}

/** "45", "1,5" or "1.440": whole minutes when possible, otherwise one decimal, id-ID style. */
export function formatMinutes(cacheTtlMs: number): string {
  const minutes = cacheTtlMs / MINUTE_MS;
  return minutes.toLocaleString('id-ID', { maximumFractionDigits: 1 });
}

/** Label for a stored value that matches no preset: "Pengaturan khusus (45 menit)". */
export function customRefreshLabel(cacheTtlMs: number): string {
  return `Pengaturan khusus (${formatMinutes(cacheTtlMs)} menit)`;
}
