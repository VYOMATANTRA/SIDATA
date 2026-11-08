import {
  MANGGAR_MAP_ORIGIN,
  MANGGAR_MAP_CENTER,
  MANGGAR_MAP_DEFAULT_ZOOM,
} from './mapOrigin';

/**
 * Shared map bounds and zoom limits for the frontend.
 * Source of truth: backend coordinatesSchema / settings.service.ts
 * (lat [-90, 90], lon [-180, 180], zoom [1, 20]).
 */
export const MIN_MAP_ZOOM = 1;
export const MAX_MAP_ZOOM = 20;

export { MANGGAR_MAP_ORIGIN, MANGGAR_MAP_CENTER, MANGGAR_MAP_DEFAULT_ZOOM };
