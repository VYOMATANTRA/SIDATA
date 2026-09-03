import prisma from '../utils/prisma.js';
import type { SpatialPointType } from '../../generated/prisma/client.js';

export const ALL_SPATIAL_POINT_TYPES: readonly SpatialPointType[] = [
  'ketua_rt',
  'bank_sampah',
  'fasilitas_umum',
] as const;

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
  /**
   * Present only when a data-integrity violation is detected at read time.
   * A `ketua_rt` point must cover exactly one RT (SPEC.md §7), but MySQL
   * cannot enforce this with a partial unique index. When the invariant is
   * broken, `rtLeader` is set to null and this field describes the anomaly.
   */
  integrityWarning?: string;
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
  /**
   * Present only when a data-integrity violation is detected at read time.
   * Mirrors SpatialPointDTO.integrityWarning (see there) — same underlying
   * anomaly, viewed from the leader side: `coordinates` is null and this
   * field describes why.
   */
  integrityWarning?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MapSummaryDTO {
  totalPoints: number;
  pointsByType: Record<string, number>;
  totalRtLeaders: number;
  rtLeadersWithCoordinates: number;
  rtLeadersWithoutCoordinates: number;
  /**
   * Subset of rtLeadersWithoutCoordinates: RTs where a ketua_rt data-integrity
   * violation (not merely absent coverage) is why no coordinates are served.
   * See mapPointToDTO/resolveRtCoverage for the shared resolution rule.
   */
  rtLeadersWithIntegrityConflicts: number;
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

/**
 * Shared read-time resolution rule for the ketua_rt <-> RT invariant (SPEC.md §7):
 * an RT resolves to a single ketua_rt point's coordinates only if exactly one
 * ketua_rt point covers it AND that point covers exactly one RT. MySQL cannot
 * enforce this with a partial unique index, so both the points-side (rtLeader)
 * and leader-side (coordinates) read paths call this instead of each
 * reimplementing (or skipping) the check.
 */
interface KetuaRtCoverageRow {
  pointId: string;
  rtNumber: number;
  totalRtCoverage: number;
}

interface RtCoverageResolution {
  pointId: string | null;
  conflict: 'multiple-points' | 'multi-rt-point' | null;
  warning?: string;
}

function resolveRtCoverage(
  rtNumber: number,
  covering: Array<{ pointId: string; totalRtCoverage: number }>,
): RtCoverageResolution {
  if (covering.length === 0) {
    return { pointId: null, conflict: null };
  }

  if (covering.length > 1) {
    console.error(
      `[maps.service] Integrity violation: multiple ketua_rt points are assigned to RT ${rtNumber.toString()} ` +
        `(points: ${covering.map((c) => c.pointId).join(', ')}). Expected exactly 1 ketua_rt point per RT.`,
    );
    return {
      pointId: null,
      conflict: 'multiple-points',
      warning: `Multiple ketua_rt points are assigned to RT ${rtNumber.toString()}; coordinates omitted pending data correction`,
    };
  }

  const [only] = covering;
  if (only && only.totalRtCoverage > 1) {
    console.error(
      `[maps.service] Integrity violation: ketua_rt point "${only.pointId}" is linked to ` +
        `${only.totalRtCoverage.toString()} RT coverages, including RT ${rtNumber.toString()}. Expected exactly 1.`,
    );
    return {
      pointId: null,
      conflict: 'multi-rt-point',
      warning:
        `ketua_rt point "${only.pointId}" is linked to ${only.totalRtCoverage.toString()} RT coverages; ` +
        `coordinates for RT ${rtNumber.toString()} omitted pending data correction`,
    };
  }

  return { pointId: only ? only.pointId : null, conflict: null };
}

function resolveRtCoverageMap(rows: KetuaRtCoverageRow[]): Map<number, RtCoverageResolution> {
  const byRt = new Map<number, Array<{ pointId: string; totalRtCoverage: number }>>();
  for (const row of rows) {
    const existing = byRt.get(row.rtNumber) ?? [];
    existing.push({ pointId: row.pointId, totalRtCoverage: row.totalRtCoverage });
    byRt.set(row.rtNumber, existing);
  }

  const resolutions = new Map<number, RtCoverageResolution>();
  for (const [rtNumber, covering] of byRt.entries()) {
    resolutions.set(rtNumber, resolveRtCoverage(rtNumber, covering));
  }
  return resolutions;
}

/**
 * Derives each row's totalRtCoverage by counting rows per pointId. Only valid
 * when `rows` is a globally-complete set of ketua_rt coverages (i.e. not
 * filtered down to a page of RT numbers) — otherwise a point covering RTs
 * outside the filtered set would be undercounted.
 */
function withDerivedCoverageCounts(
  rows: Array<{ pointId: string; rtNumber: number }>,
): KetuaRtCoverageRow[] {
  const countsByPoint = new Map<string, number>();
  for (const row of rows) {
    countsByPoint.set(row.pointId, (countsByPoint.get(row.pointId) ?? 0) + 1);
  }
  return rows.map((row) => ({
    pointId: row.pointId,
    rtNumber: row.rtNumber,
    totalRtCoverage: countsByPoint.get(row.pointId) ?? 1,
  }));
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
  duplicateKetuaRtNumbers?: Set<number>,
): SpatialPointDTO {
  const rts = point.rtCoverages.map((cov) => cov.rtNumber).sort((a, b) => a - b);
  // Per SPEC.md §7: Only 'ketua_rt' points are 1:1 with an RT leader.
  // Multi-RT points (e.g. Bank Sampah) cover multiple RTs and do not have a single leader contact.
  let rtLeader: SpatialPointDTO['rtLeader'] = null;
  let integrityWarning: string | undefined;

  if (point.type === 'ketua_rt') {
    if (rts.length === 1 && rts[0] !== undefined) {
      if (duplicateKetuaRtNumbers?.has(rts[0])) {
        // Cross-point integrity violation: Multiple ketua_rt points are assigned to the same RT number.
        console.error(
          `[maps.service] Integrity violation: multiple ketua_rt points are assigned to RT ${rts[0].toString()} ` +
            `(found on point "${point.id}"). Expected exactly 1 ketua_rt point per RT. rtLeader will be null until corrected.`,
        );
        integrityWarning = `Multiple ketua_rt points are assigned to RT ${rts[0].toString()}; leader contact omitted pending data correction`;
      } else {
        // Correct: exactly one RT coverage with no cross-point duplicates, look up the leader.
        const leader = leaderLookup?.get(rts[0]);
        if (leader) {
          rtLeader = {
            rtNumber: leader.rtNumber,
            name: leader.name,
            phone: leader.phone,
            phoneIsWhatsapp: leader.phoneIsWhatsapp,
            alamat: leader.alamat,
          };
        } else if (leaderLookup !== undefined) {
          // Orphaned RT coverage: point references an RT with no corresponding row in rt_leaders.
          integrityWarning = `No Ketua RT leader record found for RT ${rts[0].toString()}; leader contact omitted pending data correction`;
        }
      }
    } else if (rts.length > 1) {
      // Data-integrity violation: SPEC.md §7 requires exactly one RT per ketua_rt point,
      // but MySQL cannot enforce this with a partial unique index. Log and surface the anomaly
      // rather than silently returning only the lowest-numbered RT's leader contact.
      console.error(
        `[maps.service] Integrity violation: ketua_rt point "${point.id}" is linked to ` +
          `${rts.length.toString()} RT coverages (${rts.join(', ')}). ` +
          `Expected exactly 1. rtLeader will be null until corrected.`,
      );
      integrityWarning =
        `ketua_rt point linked to ${rts.length.toString()} RT coverages ` +
        `(RT ${rts.join(', ')}); leader contact omitted pending data correction`;
    }
    // rts.length === 0: no coverage yet, rtLeader stays null — not an error.
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
    ...(integrityWarning !== undefined ? { integrityWarning } : {}),
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

  const [points, allKetuaRtCoverages] = await Promise.all([
    prisma.spatialPoint.findMany({
      where,
      include: {
        rtCoverages: {
          orderBy: { rtNumber: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.spatialPointRt.findMany({
      where: {
        point: { type: 'ketua_rt' },
      },
      select: {
        pointId: true,
        rtNumber: true,
      },
    }),
  ]);

  const coverageResolutions = resolveRtCoverageMap(withDerivedCoverageCounts(allKetuaRtCoverages));

  const duplicateKetuaRtNumbers = new Set<number>();
  for (const [rtNumber, resolution] of coverageResolutions.entries()) {
    if (resolution.conflict === 'multiple-points') {
      duplicateKetuaRtNumbers.add(rtNumber);
    }
  }

  const validKetuaRtNumbers = points
    .filter((p) => p.type === 'ketua_rt' && p.rtCoverages.length === 1)
    .flatMap((p) => p.rtCoverages.map((cov) => cov.rtNumber))
    .filter((rtNumber) => !duplicateKetuaRtNumbers.has(rtNumber));

  const leaders =
    validKetuaRtNumbers.length > 0
      ? await prisma.rtLeader.findMany({
          where: { rtNumber: { in: validKetuaRtNumbers } },
        })
      : [];

  const leaderMap = new Map<number, (typeof leaders)[number]>();
  for (const leader of leaders) {
    leaderMap.set(leader.rtNumber, leader);
  }

  return points.map((p) => mapPointToDTO(p, leaderMap, duplicateKetuaRtNumbers));
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
  const duplicateKetuaRtNumbers = new Set<number>();

  if (point.type === 'ketua_rt' && rts.length === 1 && rts[0] !== undefined) {
    const otherCoverages = await prisma.spatialPointRt.findMany({
      where: {
        rtNumber: rts[0],
        point: { type: 'ketua_rt' },
        pointId: { not: point.id },
      },
      select: {
        pointId: true,
        point: { select: { id: true, _count: { select: { rtCoverages: true } } } },
      },
    });

    const covering = [
      { pointId: point.id, totalRtCoverage: rts.length },
      ...otherCoverages.map((c) => ({
        pointId: c.point.id,
        totalRtCoverage: c.point._count.rtCoverages,
      })),
    ];

    // Shared resolution rule (see resolveRtCoverage above mapPointToDTO) instead of
    // reimplementing the ketua_rt <-> RT conflict check inline.
    const resolution = resolveRtCoverage(rts[0], covering);

    if (resolution.conflict === 'multiple-points') {
      duplicateKetuaRtNumbers.add(rts[0]);
    } else if (resolution.pointId === point.id) {
      const leader = await prisma.rtLeader.findUnique({
        where: { rtNumber: rts[0] },
      });
      if (leader) {
        leaderMap.set(leader.rtNumber, leader);
      }
    }
    // Any other conflict (e.g. 'multi-rt-point') leaves leaderMap empty, so
    // rtLeader stays null without a bespoke branch here.
  }

  return mapPointToDTO(point, leaderMap, duplicateKetuaRtNumbers);
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
    // Accept zero-padded input ("007") the same way parseBoundedInt in
    // maps.controller.ts does for the `rt`/`:rtNumber` params — a strict
    // String(parsedRt) === term round-trip would otherwise reject it and
    // silently fall back to name/alamat-only search.
    const parsedRt = parseInt(term, 10);
    const isPureInteger =
      /^\d+$/.test(term) && !Number.isNaN(parsedRt) && parsedRt > 0 && parsedRt <= 2_147_483_647;

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
  // Note: `_count.rtCoverages` is the point's TOTAL coverage count, not just
  // its coverage within `rtNumbers` — required so resolveRtCoverage can tell
  // a genuinely single-RT point from one that also covers RTs outside this page.
  const ketuaRtCoverages =
    rtNumbers.length > 0
      ? await prisma.spatialPointRt.findMany({
          where: {
            rtNumber: { in: rtNumbers },
            point: { type: 'ketua_rt' },
          },
          select: {
            rtNumber: true,
            pointId: true,
            point: {
              select: {
                id: true,
                latitude: true,
                longitude: true,
                _count: { select: { rtCoverages: true } },
              },
            },
          },
          orderBy: [{ rtNumber: 'asc' }, { pointId: 'asc' }],
        })
      : [];

  const coordinatesByPoint = new Map<string, { latitude: number; longitude: number }>();
  for (const cov of ketuaRtCoverages) {
    coordinatesByPoint.set(cov.point.id, {
      latitude: cov.point.latitude,
      longitude: cov.point.longitude,
    });
  }

  const coverageResolutions = resolveRtCoverageMap(
    ketuaRtCoverages.map((cov) => ({
      pointId: cov.point.id,
      rtNumber: cov.rtNumber,
      totalRtCoverage: cov.point._count.rtCoverages,
    })),
  );

  const mappedLeaders: RtLeaderDTO[] = leaders.map((leader) => {
    const resolution = coverageResolutions.get(leader.rtNumber);
    const resolvedPointId = resolution?.pointId ?? null;
    const coords = resolvedPointId ? coordinatesByPoint.get(resolvedPointId) : undefined;

    return {
      rtNumber: leader.rtNumber,
      name: leader.name,
      phone: leader.phone,
      phoneIsWhatsapp: leader.phoneIsWhatsapp,
      alamat: leader.alamat,
      coordinates: coords && resolvedPointId ? { ...coords, pointId: resolvedPointId } : null,
      ...(resolution?.warning !== undefined ? { integrityWarning: resolution.warning } : {}),
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
  const [leader, ketuaRtCoverages] = await Promise.all([
    prisma.rtLeader.findUnique({
      where: { rtNumber },
    }),
    // findMany (not findFirst) + resolveRtCoverage: a single arbitrary,
    // unordered pick here could silently disagree with getRtLeaders for the
    // same RT — see the shared resolution rule above mapPointToDTO.
    prisma.spatialPointRt.findMany({
      where: {
        rtNumber,
        point: { type: 'ketua_rt' },
      },
      select: {
        rtNumber: true,
        pointId: true,
        point: {
          select: {
            id: true,
            latitude: true,
            longitude: true,
            _count: { select: { rtCoverages: true } },
          },
        },
      },
      orderBy: { pointId: 'asc' },
    }),
  ]);

  if (!leader) {
    return null;
  }

  const resolution = resolveRtCoverage(
    rtNumber,
    ketuaRtCoverages.map((cov) => ({
      pointId: cov.point.id,
      totalRtCoverage: cov.point._count.rtCoverages,
    })),
  );
  const resolvedPoint = resolution.pointId
    ? ketuaRtCoverages.find((cov) => cov.point.id === resolution.pointId)?.point
    : undefined;

  return {
    rtNumber: leader.rtNumber,
    name: leader.name,
    phone: leader.phone,
    phoneIsWhatsapp: leader.phoneIsWhatsapp,
    alamat: leader.alamat,
    coordinates: resolvedPoint
      ? {
          latitude: resolvedPoint.latitude,
          longitude: resolvedPoint.longitude,
          pointId: resolvedPoint.id,
        }
      : null,
    ...(resolution.warning !== undefined ? { integrityWarning: resolution.warning } : {}),
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
    // Global (unfiltered) coverage set, so withDerivedCoverageCounts can
    // correctly derive each point's total RT coverage.
    prisma.spatialPointRt.findMany({
      where: {
        point: { type: 'ketua_rt' },
      },
      select: { rtNumber: true, pointId: true },
    }),
  ]);

  const pointsByType: Record<string, number> = Object.fromEntries(
    ALL_SPATIAL_POINT_TYPES.map((type) => [type, 0]),
  );
  for (const group of pointsGrouped) {
    pointsByType[group.type] = group._count._all;
  }

  const coverageResolutions = resolveRtCoverageMap(withDerivedCoverageCounts(ketuaRtCoverages));

  const resolvedRtNumbers: number[] = [];
  const conflictedRtNumbers: number[] = [];
  for (const [rtNumber, resolution] of coverageResolutions.entries()) {
    if (resolution.pointId) {
      resolvedRtNumbers.push(rtNumber);
    } else if (resolution.conflict) {
      conflictedRtNumbers.push(rtNumber);
    }
  }

  const [rtLeadersWithCoordinates, rtLeadersWithIntegrityConflicts] = await Promise.all([
    resolvedRtNumbers.length > 0
      ? prisma.rtLeader.count({ where: { rtNumber: { in: resolvedRtNumbers } } })
      : Promise.resolve(0),
    conflictedRtNumbers.length > 0
      ? prisma.rtLeader.count({ where: { rtNumber: { in: conflictedRtNumbers } } })
      : Promise.resolve(0),
  ]);

  return {
    totalPoints,
    pointsByType,
    totalRtLeaders,
    rtLeadersWithCoordinates,
    rtLeadersWithoutCoordinates: totalRtLeaders - rtLeadersWithCoordinates,
    rtLeadersWithIntegrityConflicts,
  };
}
