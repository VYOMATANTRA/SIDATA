export type SpatialPointType = 'ketua_rt' | 'bank_sampah' | 'fasilitas_umum';

export interface SpatialPointDTO {
  id: string;
  name: string;
  type: SpatialPointType;
  latitude: number;
  longitude: number;
  metadata: Record<string, unknown> | null;
  rts: number[];
  rtLeader?: {
    rtNumber: number;
    name: string;
    phone: string;
    phoneIsWhatsapp: boolean;
    alamat: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface GeoJsonPointGeometry {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

export interface GeoJsonFeature {
  type: 'Feature';
  geometry: GeoJsonPointGeometry;
  properties: Omit<SpatialPointDTO, 'latitude' | 'longitude'>;
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

export interface RtLeaderDTO {
  rtNumber: number;
  name: string;
  phone: string;
  phoneIsWhatsapp: boolean;
  alamat: string | null;
  coordinates: {
    latitude: number;
    longitude: number;
    pointId: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface MapSummaryDTO {
  totalPoints: number;
  pointsByType: {
    ketua_rt: number;
    bank_sampah: number;
    fasilitas_umum: number;
    [key: string]: number;
  };
  totalRtLeaders: number;
  rtLeadersWithCoordinates: number;
  rtLeadersWithoutCoordinates: number;
}

export interface SpatialPointFilter {
  type?: SpatialPointType;
  rt?: number;
  format?: 'geojson';
}

export interface RtLeaderFilter {
  search?: string;
  rt?: number;
  limit?: number;
  offset?: number;
  page?: number;
}
