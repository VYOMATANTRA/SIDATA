import type {
  SpatialPointDTO,
  GeoJsonFeatureCollection,
  RtLeaderDTO,
  MapSummaryDTO,
  SpatialPointFilter,
  RtLeaderFilter,
} from '../types/maps';

const BASE_URL = '/api/maps';

export async function fetchSpatialPoints(filter?: SpatialPointFilter): Promise<SpatialPointDTO[]> {
  const params = new URLSearchParams();
  if (filter?.type) params.set('type', filter.type);
  if (typeof filter?.rt === 'number') params.set('rt', String(filter.rt));

  const url = `${BASE_URL}/points${params.toString() ? `?${params.toString()}` : ''}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Failed to fetch spatial points: ${res.statusText}`);
  }
  const data = (await res.json()) as { points: SpatialPointDTO[]; total: number };
  return data.points;
}

export async function fetchSpatialPointsGeoJson(
  filter?: SpatialPointFilter,
): Promise<GeoJsonFeatureCollection> {
  const params = new URLSearchParams();
  params.set('format', 'geojson');
  if (filter?.type) params.set('type', filter.type);
  if (typeof filter?.rt === 'number') params.set('rt', String(filter.rt));

  const url = `${BASE_URL}/points?${params.toString()}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Failed to fetch GeoJSON points: ${res.statusText}`);
  }
  return res.json() as Promise<GeoJsonFeatureCollection>;
}

export async function fetchSpatialPointById(id: string): Promise<SpatialPointDTO | null> {
  const res = await fetch(`${BASE_URL}/points/${encodeURIComponent(id)}`, {
    credentials: 'include',
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to fetch spatial point ${id}: ${res.statusText}`);
  }
  const data = (await res.json()) as { point: SpatialPointDTO };
  return data.point;
}

export async function fetchRtLeaders(query?: RtLeaderFilter): Promise<{
  leaders: RtLeaderDTO[];
  total: number;
}> {
  const params = new URLSearchParams();
  if (query?.search) params.set('search', query.search);
  if (typeof query?.rt === 'number') params.set('rt', String(query.rt));
  if (typeof query?.limit === 'number') params.set('limit', String(query.limit));
  if (typeof query?.offset === 'number') params.set('offset', String(query.offset));
  if (typeof query?.page === 'number') params.set('page', String(query.page));

  const url = `${BASE_URL}/rt-leaders${params.toString() ? `?${params.toString()}` : ''}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Failed to fetch RT leaders: ${res.statusText}`);
  }
  return res.json() as Promise<{ leaders: RtLeaderDTO[]; total: number }>;
}

export async function fetchRtLeaderByRt(rtNumber: number): Promise<RtLeaderDTO | null> {
  const res = await fetch(`${BASE_URL}/rt-leaders/${rtNumber}`, { credentials: 'include' });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to fetch RT leader for RT ${rtNumber}: ${res.statusText}`);
  }
  const data = (await res.json()) as { leader: RtLeaderDTO };
  return data.leader;
}

export async function fetchMapSummary(): Promise<MapSummaryDTO> {
  const res = await fetch(`${BASE_URL}/summary`, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Failed to fetch map summary: ${res.statusText}`);
  }
  return res.json() as Promise<MapSummaryDTO>;
}
