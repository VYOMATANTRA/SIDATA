import { DEFAULT_PUBLIC_SETTINGS } from '../stores/settings.store';

/**
 * Fallback Manggar map centre derived directly from `DEFAULT_PUBLIC_SETTINGS.defaultCoordinates`
 * in `stores/settings.store.ts` (lat -1.2251, lon 116.9438, zoom 13).
 */
export const MANGGAR_MAP_ORIGIN = {
  latitude: DEFAULT_PUBLIC_SETTINGS.defaultCoordinates.lat,
  longitude: DEFAULT_PUBLIC_SETTINGS.defaultCoordinates.lon,
} as const;

/** Leaflet `[lat, lon]` form of {@link MANGGAR_MAP_ORIGIN}. */
export const MANGGAR_MAP_CENTER: [number, number] = [
  MANGGAR_MAP_ORIGIN.latitude,
  MANGGAR_MAP_ORIGIN.longitude,
];

export const MANGGAR_MAP_DEFAULT_ZOOM = DEFAULT_PUBLIC_SETTINGS.defaultCoordinates.zoom;
