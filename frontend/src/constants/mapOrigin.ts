/**
 * Fallback Manggar map centre when CMS `public.default_coordinates` is unavailable.
 *
 * Values match `DEFAULT_PUBLIC_SETTINGS.defaultCoordinates` in
 * `stores/settings.store.ts` and `backend/src/services/settings.service.ts`
 * (lat -1.2251, lon 116.9438, zoom 13). Keep these in sync when the seeded
 * default changes.
 *
 * Earlier hard-codes used -1.2235 / 116.9521 @ zoom 14; those are superseded
 * by the settings defaults so the offline fallback matches the CMS seed.
 */
export const MANGGAR_MAP_ORIGIN = {
  latitude: -1.2251,
  longitude: 116.9438,
} as const;

/** Leaflet `[lat, lon]` form of {@link MANGGAR_MAP_ORIGIN}. */
export const MANGGAR_MAP_CENTER: [number, number] = [
  MANGGAR_MAP_ORIGIN.latitude,
  MANGGAR_MAP_ORIGIN.longitude,
];

export const MANGGAR_MAP_DEFAULT_ZOOM = 13;
