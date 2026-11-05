import type { SpatialPointDTO, MapSummaryDTO, SpatialPointFilter } from '../types/maps';

const BASE_URL = '/api/maps';

export async function fetchSpatialPoints(filter?: SpatialPointFilter): Promise<SpatialPointDTO[]> {
  const params = new URLSearchParams();
  if (filter?.type) params.set('type', filter.type);
  if (typeof filter?.rt === 'number') params.set('rt', String(filter.rt));

  const url = `${BASE_URL}/points${params.toString() ? `?${params.toString()}` : ''}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Gagal memuat titik spasial (status ${res.status})`);
  }
  const data = (await res.json()) as { points: SpatialPointDTO[]; total: number };
  return data.points;
}

export async function fetchMapSummary(): Promise<MapSummaryDTO> {
  const res = await fetch(`${BASE_URL}/summary`, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Gagal memuat ringkasan peta (status ${res.status})`);
  }
  return res.json() as Promise<MapSummaryDTO>;
}
