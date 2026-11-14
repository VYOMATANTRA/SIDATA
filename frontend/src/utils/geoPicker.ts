/**
 * Pure geometry helpers for `LocationPicker.vue`. Kept free of Leaflet so the keyboard and
 * button movement rules can be unit-tested without a map.
 */

export type PickerDirection = 'north' | 'south' | 'east' | 'west';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/** Screen distance a pin (or the viewport centre) moves per arrow key or direction button. */
export const STEP_PIXELS = 16;
/** Screen distance with the Shift modifier held. */
export const LARGE_STEP_PIXELS = 80;

/** Coordinates are rounded to 6 decimals (about 0.1 m): enough precision, tidy payloads. */
const COORDINATE_PRECISION = 1e6;

function round(value: number): number {
  return Math.round(value * COORDINATE_PRECISION) / COORDINATE_PRECISION;
}

/**
 * Brings a location into the valid world range: latitude is clamped to -90..90 and longitude is
 * wrapped into -180..180 (Leaflet reports longitudes beyond 180 once the map is dragged across
 * the date line). Returns `null` when either value is not a finite number.
 */
export function normalizeLocation(location: GeoPoint): GeoPoint | null {
  const { latitude, longitude } = location;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const clampedLatitude = Math.min(90, Math.max(-90, latitude));
  // `(x + 180) mod 360 - 180` maps +180 to -180; an explicit 180 stays 180.
  const wrappedLongitude =
    longitude === 180 ? 180 : ((((longitude + 180) % 360) + 360) % 360) - 180;
  return { latitude: round(clampedLatitude), longitude: round(wrappedLongitude) };
}

export function clampZoom(zoom: number, min: number, max: number): number {
  if (!Number.isFinite(zoom)) return min;
  return Math.min(max, Math.max(min, Math.round(zoom)));
}

/** Tolerance for coordinate comparisons (about 0.1 m). */
export const COORDINATE_EPSILON = 1e-6;

/** True when two locations are within rounding distance of each other. */
export function sameLocation(a: GeoPoint | null, b: GeoPoint | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    Math.abs(a.latitude - b.latitude) < COORDINATE_EPSILON &&
    Math.abs(a.longitude - b.longitude) < COORDINATE_EPSILON
  );
}

/** Screen offset `[x, y]` in pixels for one step (y grows downwards, so north is negative). */
export function directionOffset(direction: PickerDirection, large = false): [number, number] {
  const pixels = large ? LARGE_STEP_PIXELS : STEP_PIXELS;
  if (direction === 'north') return [0, -pixels];
  if (direction === 'south') return [0, pixels];
  if (direction === 'east') return [pixels, 0];
  return [-pixels, 0];
}

export const DIRECTION_LABELS: Readonly<Record<PickerDirection, string>> = {
  north: 'utara',
  south: 'selatan',
  east: 'timur',
  west: 'barat',
};
