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

function mapPointToDTO(
  point: {
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
    }>;
  },
  leaderLookup?: Map<
    number,
    {
      rtNumber: number;
      name: string;
      phone: string;
      phoneIsWhatsapp: boolean;
      alamat: string | null;
    }
  >,
): SpatialPointDTO {
  const rts = point.rtCoverages.map((cov) => cov.rtNumber).sort((a, b) => a - b);
  // Per SPEC.md §7: Only 'ketua_rt' points are 1:1 with an RT leader.
  // Multi-RT points (e.g. Bank Sampah) cover multiple RTs and do not have a single leader contact.
  let rtLeader: SpatialPointDTO['rtLeader'] = null;
  if (point.type === 'ketua_rt' && rts.length > 0 && rts[0] !== undefined) {
    const leader = leaderLookup?.get(rts[0]);
    if (leader) {
      rtLeader = {
        rtNumber: leader.rtNumber,
        name: leader.name,
        phone: leader.phone,
        phoneIsWhatsapp: leader.phoneIsWhatsapp,
        alamat: leader.alamat,
      };
    }
  }

  return {
    id: point.id,
    name: point.name,
    type: point.type,
    latitude: point.latitude,
    longitude: point.longitude,
    metadata: (point.metadata as Record<string, unknown>) ?? null,
    rts,
    rtLeader,
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
        orderBy: { rtNumber: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });

  const ketuaRtNumbers = points
    .filter((p) => p.type === 'ketua_rt')
    .flatMap((p) => p.rtCoverages.map((cov) => cov.rtNumber));

  const leaders =
    ketuaRtNumbers.length > 0
      ? await prisma.rtLeader.findMany({
          where: { rtNumber: { in: ketuaRtNumbers } },
        })
      : [];

  const leaderMap = new Map<number, (typeof leaders)[number]>();
  for (const leader of leaders) {
    leaderMap.set(leader.rtNumber, leader);
  }

  return points.map((p) => mapPointToDTO(p, leaderMap));
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
        orderBy: { rtNumber: 'asc' },
      },
    },
  });

  if (!point) {
    return null;
  }

  const rts = point.rtCoverages.map((cov) => cov.rtNumber).sort((a, b) => a - b);
  const leaderMap = new Map<
    number,
    {
      rtNumber: number;
      name: string;
      phone: string;
      phoneIsWhatsapp: boolean;
      alamat: string | null;
    }
  >();

  if (point.type === 'ketua_rt' && rts.length > 0 && rts[0] !== undefined) {
    const leader = await prisma.rtLeader.findUnique({
      where: { rtNumber: rts[0] },
    });
    if (leader) {
      leaderMap.set(leader.rtNumber, leader);
    }
  }

  return mapPointToDTO(point, leaderMap);
}

export async function getRtLeaders(query?: RtLeaderQuery): Promise<{
  leaders: RtLeaderDTO[];
  total: number;
}> {
  const where: {
    rtNumber?: number;
    OR?: Array<{
      rtNumber?: number;
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
    const isPureInteger = !Number.isNaN(parsedRt) && String(parsedRt) === term;

    if (isPureInteger && typeof query?.rtNumber !== 'number') {
      where.OR = [
        { rtNumber: parsedRt },
        { name: { contains: term } },
        { alamat: { contains: term } },
      ];
    } else {
      where.OR = [{ name: { contains: term } }, { alamat: { contains: term } }];
    }
  }

  const [total, leaders] = await Promise.all([
    prisma.rtLeader.count({ where }),
    prisma.rtLeader.findMany({
      where,
      orderBy: { rtNumber: 'asc' },
      ...(typeof query?.limit === 'number' ? { take: query.limit } : {}),
      ...(typeof query?.offset === 'number' ? { skip: query.offset } : {}),
    }),
  ]);

  const rtNumbers = leaders.map((l) => l.rtNumber);
  const ketuaRtCoverages =
    rtNumbers.length > 0
      ? await prisma.spatialPointRt.findMany({
          where: {
            rtNumber: { in: rtNumbers },
            point: { type: 'ketua_rt' },
          },
          include: {
            point: true,
          },
        })
      : [];

  const coordinatesMap = new Map<
    number,
    { latitude: number; longitude: number; pointId: string }
  >();
  for (const cov of ketuaRtCoverages) {
    coordinatesMap.set(cov.rtNumber, {
      latitude: cov.point.latitude,
      longitude: cov.point.longitude,
      pointId: cov.point.id,
    });
  }

  const mappedLeaders: RtLeaderDTO[] = leaders.map((leader) => ({
    rtNumber: leader.rtNumber,
    name: leader.name,
    phone: leader.phone,
    phoneIsWhatsapp: leader.phoneIsWhatsapp,
    alamat: leader.alamat,
    coordinates: coordinatesMap.get(leader.rtNumber) ?? null,
    createdAt: leader.createdAt.toISOString(),
    updatedAt: leader.updatedAt.toISOString(),
  }));

  return {
    leaders: mappedLeaders,
    total,
  };
}

export async function getRtLeaderByRtNumber(rtNumber: number): Promise<RtLeaderDTO | null> {
  const leader = await prisma.rtLeader.findUnique({
    where: { rtNumber },
  });

  if (!leader) {
    return null;
  }

  const ketuaRtCoverage = await prisma.spatialPointRt.findFirst({
    where: {
      rtNumber,
      point: { type: 'ketua_rt' },
    },
    include: {
      point: true,
    },
  });

  return {
    rtNumber: leader.rtNumber,
    name: leader.name,
    phone: leader.phone,
    phoneIsWhatsapp: leader.phoneIsWhatsapp,
    alamat: leader.alamat,
    coordinates: ketuaRtCoverage
      ? {
          latitude: ketuaRtCoverage.point.latitude,
          longitude: ketuaRtCoverage.point.longitude,
          pointId: ketuaRtCoverage.point.id,
        }
      : null,
    createdAt: leader.createdAt.toISOString(),
    updatedAt: leader.updatedAt.toISOString(),
  };
}

export async function getMapSummary(): Promise<MapSummaryDTO> {
  const [totalPoints, pointsGrouped, totalRtLeaders, ketuaRtCoverages] = await Promise.all([
    prisma.spatialPoint.count(),
    prisma.spatialPoint.groupBy({
      by: ['type'],
      _count: {
        _all: true,
      },
    }),
    prisma.rtLeader.count(),
    prisma.spatialPointRt.findMany({
      where: {
        point: { type: 'ketua_rt' },
      },
      select: { rtNumber: true },
    }),
  ]);

  const pointsByType: Record<string, number> = {};
  for (const group of pointsGrouped) {
    pointsByType[group.type] = group._count._all;
  }

  const uniqueRtNumbersWithCoordinates = Array.from(
    new Set(ketuaRtCoverages.map((cov) => cov.rtNumber)),
  );

  let rtLeadersWithCoordinates = 0;
  if (uniqueRtNumbersWithCoordinates.length > 0) {
    rtLeadersWithCoordinates = await prisma.rtLeader.count({
      where: {
        rtNumber: { in: uniqueRtNumbersWithCoordinates },
      },
    });
  }

  return {
    totalPoints,
    pointsByType,
    totalRtLeaders,
    rtLeadersWithCoordinates,
    rtLeadersWithoutCoordinates: totalRtLeaders - rtLeadersWithCoordinates,
  };
}
