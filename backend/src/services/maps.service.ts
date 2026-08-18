import prisma from '../utils/prisma.js';
import type { SpatialPointType } from '../../generated/prisma/client.js';

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
  coordinates: [number, number]; // [longitude, latitude] per RFC 7946
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
  pointsByType: Record<string, number>;
  totalRtLeaders: number;
  rtLeadersWithCoordinates: number;
  rtLeadersWithoutCoordinates: number;
}

export interface SpatialPointFilter {
  type?: SpatialPointType | undefined;
  rtNumber?: number | undefined;
}

export interface RtLeaderQuery {
  search?: string | undefined;
  rtNumber?: number | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

function mapPointToDTO(point: {
  id: string;
  name: string;
  type: SpatialPointType;
  latitude: number;
  longitude: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  rtCoverages: Array<{
    rtNumber: number;
    rtLeader: {
      rtNumber: number;
      name: string;
      phone: string;
      phoneIsWhatsapp: boolean;
      alamat: string | null;
    } | null;
  }>;
}): SpatialPointDTO {
  const rts = point.rtCoverages.map((cov) => cov.rtNumber).sort((a, b) => a - b);
  const primaryLeader = point.rtCoverages.find((cov) => cov.rtLeader !== null)?.rtLeader ?? null;

  return {
    id: point.id,
    name: point.name,
    type: point.type,
    latitude: point.latitude,
    longitude: point.longitude,
    metadata: (point.metadata as Record<string, unknown>) ?? null,
    rts,
    rtLeader: primaryLeader
      ? {
          rtNumber: primaryLeader.rtNumber,
          name: primaryLeader.name,
          phone: primaryLeader.phone,
          phoneIsWhatsapp: primaryLeader.phoneIsWhatsapp,
          alamat: primaryLeader.alamat,
        }
      : null,
    createdAt: point.createdAt.toISOString(),
    updatedAt: point.updatedAt.toISOString(),
  };
}

export async function getSpatialPoints(filter?: SpatialPointFilter): Promise<SpatialPointDTO[]> {
  const where: {
    type?: SpatialPointType;
    rtCoverages?: { some: { rtNumber: number } };
  } = {};

  if (filter?.type) {
    where.type = filter.type;
  }

  if (typeof filter?.rtNumber === 'number') {
    where.rtCoverages = {
      some: {
        rtNumber: filter.rtNumber,
      },
    };
  }

  const points = await prisma.spatialPoint.findMany({
    where,
    include: {
      rtCoverages: {
        include: {
          rtLeader: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  return points.map(mapPointToDTO);
}

export async function getSpatialPointsAsGeoJson(
  filter?: SpatialPointFilter,
): Promise<GeoJsonFeatureCollection> {
  const points = await getSpatialPoints(filter);

  const features: GeoJsonFeature[] = points.map((point) => {
    const { latitude, longitude, ...properties } = point;
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [longitude, latitude], // RFC 7946 GeoJSON standard: [lng, lat]
      },
      properties,
    };
  });

  return {
    type: 'FeatureCollection',
    features,
  };
}

export async function getSpatialPointById(id: string): Promise<SpatialPointDTO | null> {
  const point = await prisma.spatialPoint.findUnique({
    where: { id },
    include: {
      rtCoverages: {
        include: {
          rtLeader: true,
        },
      },
    },
  });

  if (!point) {
    return null;
  }

  return mapPointToDTO(point);
}

export async function getRtLeaders(query?: RtLeaderQuery): Promise<{
  leaders: RtLeaderDTO[];
  total: number;
}> {
  const where: {
    rtNumber?: number;
    OR?: Array<{
      name?: { contains: string };
      alamat?: { contains: string };
    }>;
  } = {};

  if (typeof query?.rtNumber === 'number') {
    where.rtNumber = query.rtNumber;
  }

  if (query?.search && query.search.trim() !== '') {
    const term = query.search.trim();
    const parsedRt = parseInt(term, 10);
    if (!Number.isNaN(parsedRt) && String(parsedRt) === term) {
      where.rtNumber = parsedRt;
    } else {
      where.OR = [{ name: { contains: term } }, { alamat: { contains: term } }];
    }
  }

  const [total, leaders] = await Promise.all([
    prisma.rtLeader.count({ where }),
    prisma.rtLeader.findMany({
      where,
      include: {
        spatialPoints: {
          include: {
            point: true,
          },
        },
      },
      orderBy: { rtNumber: 'asc' },
      ...(typeof query?.limit === 'number' ? { take: query.limit } : {}),
      ...(typeof query?.offset === 'number' ? { skip: query.offset } : {}),
    }),
  ]);

  const mappedLeaders: RtLeaderDTO[] = leaders.map((leader) => {
    // Per SPEC.md §7: Only match coordinates where spatial_points.type is 'ketua_rt'
    const ketuaRtPoint = leader.spatialPoints.find((sp) => sp.point.type === 'ketua_rt')?.point;

    return {
      rtNumber: leader.rtNumber,
      name: leader.name,
      phone: leader.phone,
      phoneIsWhatsapp: leader.phoneIsWhatsapp,
      alamat: leader.alamat,
      coordinates: ketuaRtPoint
        ? {
            latitude: ketuaRtPoint.latitude,
            longitude: ketuaRtPoint.longitude,
            pointId: ketuaRtPoint.id,
          }
        : null,
      createdAt: leader.createdAt.toISOString(),
      updatedAt: leader.updatedAt.toISOString(),
    };
  });

  return {
    leaders: mappedLeaders,
    total,
  };
}

export async function getRtLeaderByRtNumber(rtNumber: number): Promise<RtLeaderDTO | null> {
  const leader = await prisma.rtLeader.findUnique({
    where: { rtNumber },
    include: {
      spatialPoints: {
        include: {
          point: true,
        },
      },
    },
  });

  if (!leader) {
    return null;
  }

  // Per SPEC.md §7: Coordinate resolution joins only spatial_points.type = 'ketua_rt'
  const ketuaRtPoint = leader.spatialPoints.find((sp) => sp.point.type === 'ketua_rt')?.point;

  return {
    rtNumber: leader.rtNumber,
    name: leader.name,
    phone: leader.phone,
    phoneIsWhatsapp: leader.phoneIsWhatsapp,
    alamat: leader.alamat,
    coordinates: ketuaRtPoint
      ? {
          latitude: ketuaRtPoint.latitude,
          longitude: ketuaRtPoint.longitude,
          pointId: ketuaRtPoint.id,
        }
      : null,
    createdAt: leader.createdAt.toISOString(),
    updatedAt: leader.updatedAt.toISOString(),
  };
}

export async function getMapSummary(): Promise<MapSummaryDTO> {
  const [totalPoints, pointsGrouped, totalRtLeaders, rtLeaders] = await Promise.all([
    prisma.spatialPoint.count(),
    prisma.spatialPoint.groupBy({
      by: ['type'],
      _count: {
        _all: true,
      },
    }),
    prisma.rtLeader.count(),
    prisma.rtLeader.findMany({
      include: {
        spatialPoints: {
          include: {
            point: true,
          },
        },
      },
    }),
  ]);

  const pointsByType: Record<string, number> = {};
  for (const group of pointsGrouped) {
    pointsByType[group.type] = group._count._all;
  }

  let rtLeadersWithCoordinates = 0;
  for (const leader of rtLeaders) {
    const hasKetuaRtPoint = leader.spatialPoints.some((sp) => sp.point.type === 'ketua_rt');
    if (hasKetuaRtPoint) {
      rtLeadersWithCoordinates++;
    }
  }

  return {
    totalPoints,
    pointsByType,
    totalRtLeaders,
    rtLeadersWithCoordinates,
    rtLeadersWithoutCoordinates: totalRtLeaders - rtLeadersWithCoordinates,
  };
}
