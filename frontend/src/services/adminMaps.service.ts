import { apiRequestJson } from '../utils/apiClient';
import type { SpatialPointDTO, SpatialPointType } from '../types/maps';

/**
 * Editor/admin writes for map points (SPEC §7). The public reads stay in `maps.service.ts`;
 * this module only wraps the three write endpoints the `/admin/peta` screen uses. Every call goes
 * through `apiRequestJson`, so CSRF, the bearer token and one silent session refresh come with it.
 */

const BASE_URL = '/api/maps/points';

export interface PointWriteInput {
  name: string;
  type: SpatialPointType;
  latitude: number;
  longitude: number;
  rts: number[];
}

function pointUrl(id: string, expectedRtNumber?: number): string {
  const query = expectedRtNumber === undefined ? '' : `?expectedRtNumber=${expectedRtNumber}`;
  return `${BASE_URL}/${encodeURIComponent(id)}${query}`;
}

export async function createPoint(input: PointWriteInput): Promise<SpatialPointDTO> {
  const data = await apiRequestJson<{ point: SpatialPointDTO }>(BASE_URL, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.point;
}

/**
 * `expectedRtNumber` is the RT the editor believed the point owned when it was loaded. The
 * server answers 409 `STALE_WRITE` when ownership changed meanwhile and 404 when the point is
 * gone, so pass it for every Ketua RT point that currently owns exactly one RT.
 */
export async function updatePoint(
  id: string,
  patch: Partial<PointWriteInput>,
  expectedRtNumber?: number,
): Promise<SpatialPointDTO> {
  const data = await apiRequestJson<{ point: SpatialPointDTO }>(pointUrl(id, expectedRtNumber), {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return data.point;
}

export async function deletePoint(
  id: string,
  expectedRtNumber?: number,
): Promise<SpatialPointDTO | null> {
  const data = await apiRequestJson<{ point?: SpatialPointDTO }>(pointUrl(id, expectedRtNumber), {
    method: 'DELETE',
  });
  return data.point ?? null;
}
