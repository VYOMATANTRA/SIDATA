import prisma from '../utils/prisma.js';
import type { SpatialPointType } from '../../generated/prisma/client.js';
import { Prisma } from '../../generated/prisma/client.js';
import { z } from 'zod';
import {
  buildAuditLog,
  AUDIT_ACTIONS,
  type AuditActor,
  type AuditRequestContext,
} from './audit.service.js';
import { executeLockedTransaction, withChangeResult } from '../utils/lockTransactionCache.js';
import { hasFieldChanged } from '../utils/comparator.js';

/** system_settings key: seed sets true; any editor save of an RT leader clears it. */
export const RT_LEADERS_SAMPLE_ROSTER_KEY = 'maps.rt_leaders_sample_roster';

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
  /** True while the roster is still the seeded placeholder set (not live kelurahan data). */
  isSampleRoster: boolean;
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

  const [total, leaders, sampleSetting] = await Promise.all([
    prisma.rtLeader.count({ where }),
    prisma.rtLeader.findMany({
      where,
      orderBy: { rtNumber: 'asc' },
      ...(typeof query?.limit === 'number' ? { take: query.limit } : {}),
      ...(typeof query?.offset === 'number' ? { skip: query.offset } : {}),
    }),
    prisma.systemSetting.findUnique({ where: { key: RT_LEADERS_SAMPLE_ROSTER_KEY } }),
  ]);
  const isSampleRoster = sampleSetting?.value === 'true';

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
    isSampleRoster,
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

// ---------------------------------------------------------------------------
// Write paths (SPEC.md §7) — editor/admin-only via routes, CSRF-protected, audited.
// Each mutation runs inside a locked transaction together with its audit row; a failed
// audit write surfaces as a failed request rather than a silent mutation (§3).
// ---------------------------------------------------------------------------

export class MapsServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'MapsServiceError';
    this.statusCode = statusCode;
  }
}

/** SPEC §7: RT numbers are strictly the 1–100 range (matches the seeded rt_leaders rows). */
export const MIN_RT_NUMBER = 1;
export const MAX_RT_NUMBER = 100;

export interface SpatialPointCoverageDTO {
  id: string;
  pointId: string;
  rtNumber: number;
  createdAt: string;
}

/**
 * RT leader write response. Mirrors RtLeaderDTO minus `coordinates`/`integrityWarning` — the
 * write path only owns the leader row; coordinate resolution is read-path territory and the
 * client can re-fetch `GET /api/maps/rt-leaders/:rtNumber` for the joined view.
 */
export interface RtLeaderWriteDTO {
  rtNumber: number;
  name: string;
  phone: string;
  phoneIsWhatsapp: boolean;
  alamat: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- Validation schemas (zod) -----------------------------------------------

const rtNumberField = z
  .number()
  .refine((v) => Number.isInteger(v), { message: 'Nomor RT harus berupa bilangan bulat' })
  .min(MIN_RT_NUMBER, { message: `Nomor RT harus antara ${MIN_RT_NUMBER} dan ${MAX_RT_NUMBER}` })
  .max(MAX_RT_NUMBER, { message: `Nomor RT harus antara ${MIN_RT_NUMBER} dan ${MAX_RT_NUMBER}` });

const spatialPointTypeField = z.enum(
  ALL_SPATIAL_POINT_TYPES as unknown as [SpatialPointType, ...SpatialPointType[]],
  { message: 'Tipe titik tidak valid' },
);

const nameField = z
  .string()
  .trim()
  .min(1, 'Nama wajib diisi')
  .max(191, 'Nama maksimal 191 karakter');

const latitudeField = z.number().refine((v) => v >= -90 && v <= 90, {
  message: 'Latitude harus antara -90 dan 90',
});
const longitudeField = z.number().refine((v) => v >= -180 && v <= 180, {
  message: 'Longitude harus antara -180 dan 180',
});

/**
 * `metadata` stores a JSON object (SPEC §7) or null — arrays/scalars are not point metadata.
 * Size fence: whatever an editor saves here is echoed back in every public points payload,
 * so an unbounded object would silently tax every map load (the request body limit alone is
 * far too loose to be the only guard).
 */
const MAX_METADATA_SERIALIZED_LENGTH = 8_000;
const metadataField = z
  .record(z.string(), z.unknown())
  .refine(
    (v) => JSON.stringify(v).length <= MAX_METADATA_SERIALIZED_LENGTH,
    `Metadata terlalu besar (maksimal ${MAX_METADATA_SERIALIZED_LENGTH} karakter setelah serialisasi JSON)`,
  )
  .nullable()
  .optional();

const coverageSetField = z
  .array(rtNumberField)
  .max(MAX_RT_NUMBER, `Maksimal ${MAX_RT_NUMBER} RT per titik`);

export const createPointSchema = z
  .object({
    name: nameField,
    type: spatialPointTypeField,
    latitude: latitudeField,
    longitude: longitudeField,
    metadata: metadataField,
    rts: coverageSetField.optional(),
  })
  .strict();

export const updatePointSchema = z
  .object({
    name: nameField.optional(),
    type: spatialPointTypeField.optional(),
    latitude: latitudeField.optional(),
    longitude: longitudeField.optional(),
    metadata: metadataField,
    rts: coverageSetField.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Setidaknya satu bidang harus disediakan untuk diperbarui',
  });

export const createCoverageSchema = z.object({ rtNumber: rtNumberField }).strict();

export const updateLeaderSchema = z
  .object({
    name: nameField.optional(),
    phone: z
      .string()
      .trim()
      .min(1, 'Nomor telepon wajib diisi')
      .max(191, 'Nomor telepon maksimal 191 karakter')
      .optional(),
    phoneIsWhatsapp: z.boolean().optional(),
    alamat: z.string().trim().max(2000, 'Alamat maksimal 2000 karakter').nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Setidaknya satu bidang harus disediakan untuk diperbarui',
  });

export type CreatePointInput = z.infer<typeof createPointSchema>;
export type UpdatePointInput = z.infer<typeof updatePointSchema>;
export type CreateCoverageInput = z.infer<typeof createCoverageSchema>;
export type UpdateLeaderInput = z.infer<typeof updateLeaderSchema>;

// --- Shared write helpers ----------------------------------------------------

interface SpatialPointWriteRow {
  id: string;
  name: string;
  type: SpatialPointType;
  latitude: number;
  longitude: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  rtCoverages: Array<{ rtNumber: number }>;
}

interface RtLeaderWriteRow {
  rtNumber: number;
  name: string;
  phone: string;
  phoneIsWhatsapp: boolean;
  alamat: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface SpatialWriteTxClient {
  spatialPoint: Pick<typeof prisma.spatialPoint, 'findUnique' | 'create' | 'update' | 'delete'>;
  spatialPointRt: Pick<
    typeof prisma.spatialPointRt,
    'findMany' | 'findUnique' | 'create' | 'createMany' | 'delete' | 'deleteMany'
  >;
  rtLeader: Pick<typeof prisma.rtLeader, 'findUnique' | 'update'>;
  systemSetting: Pick<typeof prisma.systemSetting, 'upsert'>;
  auditLog: Pick<typeof prisma.auditLog, 'create'>;
  $queryRaw: (query: Prisma.Sql) => Promise<unknown>;
}

/** Clear the seeded-sample flag once an editor saves real leader data. */
async function clearRtLeadersSampleRosterFlag(
  tx: Pick<SpatialWriteTxClient, 'systemSetting'>,
): Promise<void> {
  await tx.systemSetting.upsert({
    where: { key: RT_LEADERS_SAMPLE_ROSTER_KEY },
    create: { key: RT_LEADERS_SAMPLE_ROSTER_KEY, value: 'false' },
    update: { value: 'false' },
  });
}

function isPrismaKnownError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function parseWritePayload(rawInput: unknown): Record<string, unknown> {
  if (typeof rawInput !== 'object' || rawInput === null || Array.isArray(rawInput)) {
    throw new MapsServiceError('Payload harus berupa objek JSON.', 400);
  }
  return rawInput as Record<string, unknown>;
}

function parseZodErrorIssues(error: z.ZodError): MapsServiceError {
  return new MapsServiceError(error.issues.map((issue) => issue.message).join(', '), 400);
}

/**
 * Coverage payload normalisation: sorted ascending, duplicates rejected with a clear message —
 * the (point_id, rt_number) unique constraint alone would surface them as an opaque 409.
 */
function normalizeCoverageSet(raw: number[]): number[] {
  const seen = new Set<number>();
  for (const rt of raw) {
    if (seen.has(rt)) {
      throw new MapsServiceError(
        `Nomor RT ${rt.toString()} duplikat dalam payload — setiap RT hanya boleh muncul sekali.`,
        400,
      );
    }
    seen.add(rt);
  }
  return [...seen].sort((a, b) => a - b);
}

/** Empty/whitespace strings collapse to null, undefined stays undefined (pola selector nullable). */
function sanitizeNullableText(val: string | null | undefined): string | null {
  if (val === undefined || val === null || val.trim() === '') return null;
  return val.trim();
}

/**
 * Write-response formatter. Reuses the READ-side DTO builder (mapPointToDTO) so a point write
 * response cannot disagree with what the public read paths would serve for the same row.
 */
async function formatWrittenPoint(
  tx: SpatialWriteTxClient,
  point: SpatialPointWriteRow,
): Promise<SpatialPointDTO> {
  const rts = point.rtCoverages.map((cov) => cov.rtNumber);
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
  if (point.type === 'ketua_rt' && rts.length === 1 && rts[0] !== undefined) {
    const leader = (await tx.rtLeader.findUnique({
      where: { rtNumber: rts[0] },
    })) as RtLeaderWriteRow | null;
    if (leader) {
      leaderMap.set(leader.rtNumber, {
        rtNumber: leader.rtNumber,
        name: leader.name,
        phone: leader.phone,
        phoneIsWhatsapp: leader.phoneIsWhatsapp,
        alamat: leader.alamat,
      });
    }
  }
  return mapPointToDTO(point, leaderMap, new Set());
}

function formatWrittenLeader(row: RtLeaderWriteRow): RtLeaderWriteDTO {
  return {
    rtNumber: row.rtNumber,
    name: row.name,
    phone: row.phone,
    phoneIsWhatsapp: row.phoneIsWhatsapp,
    alamat: row.alamat,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function formatCoverage(row: {
  id: number;
  pointId: string;
  rtNumber: number;
  createdAt: Date;
}): SpatialPointCoverageDTO {
  return {
    id: String(row.id),
    pointId: row.pointId,
    rtNumber: row.rtNumber,
    createdAt: row.createdAt.toISOString(),
  };
}

interface PointWriteSummary {
  pointId: string;
  pointName: string;
  latitude: number;
  longitude: number;
  type: SpatialPointType;
  coverages: number[];
}

function pointWriteSummary(point: SpatialPointWriteRow): PointWriteSummary {
  return {
    pointId: point.id,
    pointName: point.name,
    latitude: point.latitude,
    longitude: point.longitude,
    type: point.type,
    coverages: point.rtCoverages.map((cov) => cov.rtNumber).sort((a, b) => a - b),
  };
}

/**
 * Locking read backing the write-path invariant assert (SPEC.md §7), scoped to the single RT
 * being written. Locking reads carry current-read semantics in InnoDB, unlike the
 * snapshot-backed ORM findMany that previously fed this check — the shared
 * "spatial_point_rt joined on ketua_rt spatial_points" row set is exactly what the read-side
 * rule consumes. Results are aliased to the shape the resolution rule expects.
 */
const KETUA_RT_COVERAGE_SHARE_READ = (rt: number) => Prisma.sql`
  SELECT spr.point_id AS pointId, spr.rt_number AS rtNumber
  FROM spatial_point_rt spr
  JOIN spatial_points sp ON sp.id = spr.point_id
  WHERE sp.type = 'ketua_rt' AND spr.rt_number = ${rt}
  FOR SHARE`;

/**
 * Write-path enforcement of the ketua_rt <-> RT invariant (SPEC.md §7), **reusing the shared
 * read-side resolution rule** (`withDerivedCoverageCounts` + `resolveRtCoverage`) so reads and
 * writes can never disagree about what a violation is:
 *
 * - the point's own post-write coverage must be exactly one RT (the rule's
 *   'multi-rt-point' branch → 400). MySQL cannot express this as a partial unique index.
 * - the assigned RT must not also be covered by any OTHER ketua_rt point (the rule's
 *   'multiple-points' branch → 409).
 *
 * The check is scoped to the point being written and only runs on writes that touch the
 * point's type or coverage — a pure field edit (name/coords/metadata) on a point whose stored
 * coverage already violates the invariant stays possible, so legacy violations are always
 * repairable; fixing them requires a coverage write, which is (re-)validated here. Violations
 * untouched by a given write remain read-side integrityWarning territory.
 */
async function assertKetuaRtWriteInvariant(
  tx: SpatialWriteTxClient,
  target: {
    pointId: string;
    resultingType: SpatialPointType;
    resultingCoverages: number[];
  },
): Promise<void> {
  if (target.resultingType !== 'ketua_rt') return;

  if (target.resultingCoverages.length !== 1) {
    throw new MapsServiceError(
      `Titik ketua_rt "${target.pointId}" harus mencakup tepat satu RT — ` +
        `posisi setelah perubahan mencakup ${target.resultingCoverages.length} RT ` +
        `(${target.resultingCoverages.join(', ') || 'kosong'}).`,
      400,
    );
  }
  const rt = target.resultingCoverages[0] as number;

  // The RT's ketua_rt coverage state, read as a LOCKING (FOR SHARE) read scoped to that RT
  // (map writes no longer serialize on every ketua_rt coverage row — only on rows serving the
  // RT being written). InnoDB locking reads are always current reads: they see every claim
  // another transaction has committed — even though this transaction's REPEATABLE READ
  // snapshot (established at its first consistent read, possibly before any rt_leaders lock
  // wait) no longer reflects reality — and they BLOCK while a sibling transaction still holds
  // uncommitted coverage rows for that RT. Two concurrent ketua_rt writes claiming the same
  // RT therefore can never both pass. This also closes the residual gap where an rt_leaders
  // FOR UPDATE lock no-ops for an RT lacking its seeded row and the (point_id, rt_number)
  // unique key does not span points.
  const stored = (await tx.$queryRaw(KETUA_RT_COVERAGE_SHARE_READ(rt))) as Array<{
    pointId: string;
    rtNumber: number;
  }>;
  // Scoping the read to `rt` intentionally omits other points' rows on other RTs, so a foreign
  // point's total coverage count is unknown here — and irrelevant: for THIS RT the only
  // conflict class beyond the target's own shape (gated above) is 'multiple-points', which
  // fires on any second point covering the same RT regardless of what else that point spans
  // (a ketua_rt point spanning several RTs is itself an invalid state the write path never
  // produces). Per-point totals are therefore pinned at 1 in this read window.
  const resolution = resolveRtCoverage(rt, [
    ...stored
      .filter((c) => c.pointId !== target.pointId)
      .map((c) => ({ pointId: c.pointId, totalRtCoverage: 1 })),
    { pointId: target.pointId, totalRtCoverage: 1 },
  ]);

  if (resolution.conflict === 'multiple-points') {
    const others = stored
      .filter((c) => c.pointId !== target.pointId)
      .map((c) => c.pointId)
      .join(', ');
    throw new MapsServiceError(
      `RT ${rt.toString()} sudah dicakup oleh titik ketua_rt lain (${others}) — ` +
        `satu RT hanya boleh dicakup tepat satu titik ketua_rt.`,
      409,
    );
  }
  // With this target-scoped read both totalRtCoverage values are pinned to 1, so
  // 'multi-rt-point' cannot surface here either — honor the shared rule defensively rather
  // than assume it.
  if (resolution.conflict === 'multi-rt-point') {
    throw new MapsServiceError(resolution.warning ?? 'Invariant ketua_rt/RT dilanggar.', 400);
  }
}

/**
 * Locks the rt_leaders rows of the RTs a ketua_rt write touches. serializeKetuaRt writes to
 * the same RT (two sessions claiming RT 5 for two different ketua_rt points would otherwise
 * both pass the cross-point check). The leader rows are seeded 1–100; a missing row degrades
 * the lock to best-effort, matching SPEC's "validate rt_number 1–100" (existence is NOT
 * required — orphaned coverage is a read-path integrityWarning, not a write reject).
 * Lock order is ascending RT so overlapping write sets never deadlock.
 */
function leaderLockQuery(rts: number[]): LockQueryFn | undefined {
  if (rts.length === 0) return undefined;
  const sorted = [...rts].sort((a, b) => a - b);
  return async (tx: unknown) => {
    const client = tx as SpatialWriteTxClient;
    await client.$queryRaw(
      Prisma.sql`SELECT rt_number FROM rt_leaders WHERE rt_number IN (${Prisma.join(sorted)}) FOR UPDATE`,
    );
  };
}

interface LockQueryFn {
  (tx: unknown): Promise<unknown>;
}

// --- Spatial point CRUD --------------------------------------------------------

export const createSpatialPoint = async (
  rawInput: unknown,
  actor: AuditActor,
  reqContext: AuditRequestContext,
  client = prisma,
): Promise<SpatialPointDTO> => {
  const parsed = createPointSchema.safeParse(parseWritePayload(rawInput));
  if (!parsed.success) {
    throw parseZodErrorIssues(parsed.error);
  }
  const input = parsed.data;
  const postCoverages = normalizeCoverageSet(input.rts ?? []);

  try {
    return await executeLockedTransaction({
      client,
      lockQuery: leaderLockQuery(input.type === 'ketua_rt' ? postCoverages : []),
      execute: async (txRaw) => {
        const tx = txRaw as SpatialWriteTxClient;
        const created = (await tx.spatialPoint.create({
          data: {
            name: input.name,
            type: input.type,
            latitude: input.latitude,
            longitude: input.longitude,
            ...(input.metadata !== undefined && input.metadata !== null
              ? { metadata: input.metadata as unknown as Prisma.InputJsonValue }
              : {}),
            ...(postCoverages.length > 0
              ? { rtCoverages: { create: postCoverages.map((rtNumber) => ({ rtNumber })) } }
              : {}),
          },
          include: { rtCoverages: { orderBy: { rtNumber: 'asc' } } },
        })) as unknown as SpatialPointWriteRow;

        await assertKetuaRtWriteInvariant(tx, {
          pointId: created.id,
          resultingType: created.type,
          resultingCoverages: postCoverages,
        });

        await buildAuditLog(
          {
            action: AUDIT_ACTIONS.SPATIAL_POINT_CREATED,
            actor,
            target: { type: 'spatial_point', id: created.id, label: created.name },
            metadata: {
              ...pointWriteSummary(created),
              coverages: postCoverages,
            },
            context: reqContext,
          },
          tx,
        );

        return formatWrittenPoint(tx, created);
      },
    });
  } catch (error) {
    if (error instanceof MapsServiceError) throw error;
    if (isPrismaKnownError(error, 'P2002')) {
      throw new MapsServiceError('Coverage RT sudah terdaftar pada titik ini.', 409);
    }
    throw error;
  }
};

export const updateSpatialPoint = async (
  id: unknown,
  rawInput: unknown,
  actor: AuditActor,
  reqContext: AuditRequestContext,
  client = prisma,
): Promise<SpatialPointDTO> => {
  if (typeof id !== 'string' || id.trim() === '' || id.length > 191) {
    throw new MapsServiceError('ID titik spasial tidak valid.', 400);
  }
  const normalizedId = id.trim();

  const parsed = updatePointSchema.safeParse(parseWritePayload(rawInput));
  if (!parsed.success) {
    throw parseZodErrorIssues(parsed.error);
  }
  const input = parsed.data as UpdatePointInput & Record<string, unknown>;

  try {
    return await executeLockedTransaction({
      client,
      // Point row first — every coverage write to this point goes through that lock — then,
      // ONLY for ketua_rt-side writes (the point is or becomes ketua_rt), the rt_leaders rows
      // of its PRE ∪ POST RT set, locked ascending, before this transaction writes anything:
      // same-RT writers queue on the leader rows regardless of which direction a race runs
      // (a PATCH moving 3→9 and a sibling moving 9→3 both grab {3,9} in the same order, so
      // neither can end up holding one RT while waiting for the other — exactly the deadlock
      // window that destination-only locking left behind, recoverable only by InnoDB
      // detection plus the P2034 retry). The pre set is read with a consistent read AFTER the
      // point row lock, which makes it stable: no sibling writer can touch this point's
      // coverage rows while the lock is held, and every ketua_rt coverage write elsewhere
      // goes through the same leaders-first ordering, so no cross-endpoint lock-ordering flip
      // exists either. A bank_sampah point is never exclusive on an RT, so leader locks would
      // be pure overhead there — same-point writers already serialize on the point row lock.
      // Field-only payloads (name/lat/lng/metadata) skip the RT locking entirely too.
      lockQuery: async (txRaw) => {
        const tx = txRaw as SpatialWriteTxClient;
        const pointRows = (await tx.$queryRaw(
          Prisma.sql`SELECT type FROM spatial_points WHERE id = ${normalizedId} FOR UPDATE`,
        )) as Array<{ type: string }>;
        if (input.type === undefined && input.rts === undefined) return;
        const isOrBecomesKetua =
          (input.type !== undefined && input.type === 'ketua_rt') ||
          (input.type === undefined && pointRows[0]?.type === 'ketua_rt');
        if (!isOrBecomesKetua) return;
        const preRtRows = (await tx.$queryRaw(
          Prisma.sql`SELECT rt_number AS rtNumber FROM spatial_point_rt WHERE point_id = ${normalizedId}`,
        )) as Array<{ rtNumber: number }>;
        const postRts = input.rts === undefined ? [] : normalizeCoverageSet(input.rts as number[]);
        await leaderLockQuery([
          ...new Set([...preRtRows.map((row) => row.rtNumber), ...postRts]),
        ])?.(tx);
      },
      execute: async (txRaw) => {
        const tx = txRaw as SpatialWriteTxClient;
        const existing = (await tx.spatialPoint.findUnique({
          where: { id: normalizedId },
          include: { rtCoverages: { orderBy: { rtNumber: 'asc' } } },
        })) as unknown as SpatialPointWriteRow | null;
        if (!existing) {
          throw new MapsServiceError('Titik spasial tidak ditemukan.', 404);
        }

        const typeChanged = input.type !== undefined && input.type !== existing.type;
        const rtsTouched = input.rts !== undefined;
        const resultingType = typeChanged ? (input.type as SpatialPointType) : existing.type;
        const preCoverages = normalizeCoverageSet(existing.rtCoverages.map((c) => c.rtNumber));
        const postCoverages = rtsTouched
          ? normalizeCoverageSet(input.rts as number[])
          : preCoverages;
        const addedCoverages = postCoverages.filter((rt) => !preCoverages.includes(rt));
        const removedCoverages = preCoverages.filter((rt) => !postCoverages.includes(rt));
        const coverageChanged = addedCoverages.length > 0 || removedCoverages.length > 0;

        const changes: Record<string, { before: unknown; after: unknown } | { redacted: true }> =
          {};
        const track = (field: string, before: unknown, after: unknown) => {
          if (hasFieldChanged(before, after)) {
            changes[field] = { before, after };
          }
        };
        if (input.name !== undefined) track('name', existing.name, input.name.trim());
        if (input.type !== undefined) track('type', existing.type, input.type);
        if (input.latitude !== undefined) track('latitude', existing.latitude, input.latitude);
        if (input.longitude !== undefined) track('longitude', existing.longitude, input.longitude);
        if (input.metadata !== undefined) {
          // Values redacted: metadata is free-form JSON that real data embeds personal details
          // in (e.g. a pengelola/manager name), and audit rows default to infinite retention —
          // consistent with the rt_leader.updated privacy fix, this audit entry records only
          // THAT the key changed, never its before/after values (SPEC.md §3).
          const sanitizedMetadata =
            input.metadata === null ? null : (input.metadata as Record<string, unknown>);
          if (hasFieldChanged(existing.metadata ?? null, sanitizedMetadata)) {
            changes.metadata = { redacted: true };
          }
        }
        if (coverageChanged) {
          changes.coverages = { before: preCoverages, after: postCoverages };
        }

        if (!coverageChanged && Object.keys(changes).length === 0) {
          // No-op PATCH: per SPEC.md §7 the invariant check only runs on type/coverage writes.
          return withChangeResult(await formatWrittenPoint(tx, existing), false);
        }

        if (coverageChanged) {
          if (removedCoverages.length > 0) {
            await tx.spatialPointRt.deleteMany({
              where: { pointId: normalizedId, rtNumber: { in: removedCoverages } },
            });
          }
          if (addedCoverages.length > 0) {
            await tx.spatialPointRt.createMany({
              data: addedCoverages.map((rtNumber) => ({ pointId: normalizedId, rtNumber })),
            });
          }
        }

        if (Object.keys(changes).some((key) => key !== 'coverages')) {
          await tx.spatialPoint.update({
            where: { id: normalizedId },
            data: {
              ...(input.name !== undefined ? { name: input.name.trim() } : {}),
              ...(input.type !== undefined ? { type: input.type } : {}),
              ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
              ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
              // MySQL Prisma Json handling: SQL NULL must go through DbNull on update, not JS null.
              ...(input.metadata !== undefined
                ? {
                    metadata:
                      input.metadata === null
                        ? Prisma.DbNull
                        : (input.metadata as unknown as Prisma.InputJsonValue),
                  }
                : {}),
            },
          });
        }

        const mustHoldInvariant = rtsTouched || typeChanged;
        if (mustHoldInvariant && resultingType === 'ketua_rt') {
          // All contention shaping happened up in lockQuery (point row + pre ∪ POST RT
          // leader locks). What remains here is pure correctness: the FOR SHARE current read
          // below cannot miss a sibling transaction's claim, whatever this transaction's
          // REPEATABLE READ snapshot says.
          await assertKetuaRtWriteInvariant(tx, {
            pointId: normalizedId,
            resultingType,
            resultingCoverages: postCoverages,
          });
        }

        const updated = (await tx.spatialPoint.findUnique({
          where: { id: normalizedId },
          include: { rtCoverages: { orderBy: { rtNumber: 'asc' } } },
        })) as unknown as SpatialPointWriteRow;

        await buildAuditLog(
          {
            action: AUDIT_ACTIONS.SPATIAL_POINT_UPDATED,
            actor,
            target: { type: 'spatial_point', id: existing.id, label: existing.name },
            metadata: {
              changes,
              ...(addedCoverages.length > 0 ? { coveragesAdded: addedCoverages } : {}),
              ...(removedCoverages.length > 0 ? { coveragesRemoved: removedCoverages } : {}),
              coverages: postCoverages,
            },
            context: reqContext,
          },
          tx,
        );

        return formatWrittenPoint(tx, updated);
      },
    });
  } catch (error) {
    if (error instanceof MapsServiceError) throw error;
    if (isPrismaKnownError(error, 'P2002')) {
      // Only possible race residue: a concurrent writer claimed the same RT after our leader
      // lock degraded to best-effort (missing rt_leaders row). Surface it as a conflict, not 500.
      throw new MapsServiceError('Coverage RT sudah terdaftar pada titik ini.', 409);
    }
    if (isPrismaKnownError(error, 'P2025')) {
      throw new MapsServiceError('Titik spasial tidak ditemukan.', 404);
    }
    throw error;
  }
};

export const deleteSpatialPoint = async (
  id: unknown,
  actor: AuditActor,
  reqContext: AuditRequestContext,
  client = prisma,
): Promise<SpatialPointDTO> => {
  if (typeof id !== 'string' || id.trim() === '' || id.length > 191) {
    throw new MapsServiceError('ID titik spasial tidak valid.', 400);
  }
  const normalizedId = id.trim();

  try {
    return await executeLockedTransaction({
      client,
      lockQuery: Prisma.sql`SELECT id FROM spatial_points WHERE id = ${normalizedId} FOR UPDATE`,
      execute: async (txRaw) => {
        const tx = txRaw as SpatialWriteTxClient;
        const existing = (await tx.spatialPoint.findUnique({
          where: { id: normalizedId },
          include: { rtCoverages: { orderBy: { rtNumber: 'asc' } } },
        })) as unknown as SpatialPointWriteRow | null;
        if (!existing) {
          throw new MapsServiceError('Titik spasial tidak ditemukan.', 404);
        }

        // Deleting a point only RELEASES RT coverages (they cascade) — it cannot create a
        // multiple-points or multi-rt-point state, so no ketua_rt invariant assert here (and
        // no rt_leaders locks: the frees are always legal).
        await tx.spatialPoint.delete({ where: { id: normalizedId } });

        const before = await formatWrittenPoint(tx, existing);
        await buildAuditLog(
          {
            action: AUDIT_ACTIONS.SPATIAL_POINT_DELETED,
            actor,
            target: { type: 'spatial_point', id: existing.id, label: existing.name },
            metadata: { before: pointWriteSummary(existing), changes: {} },
            context: reqContext,
          },
          tx,
        );

        return before;
      },
    });
  } catch (error) {
    if (error instanceof MapsServiceError) throw error;
    if (isPrismaKnownError(error, 'P2025')) {
      throw new MapsServiceError('Titik spasial tidak ditemukan.', 404);
    }
    throw error;
  }
};

// --- RT coverage subresource -----------------------------------------------------

export const createSpatialPointCoverage = async (
  id: unknown,
  rawInput: unknown,
  actor: AuditActor,
  reqContext: AuditRequestContext,
  client = prisma,
): Promise<SpatialPointCoverageDTO> => {
  if (typeof id !== 'string' || id.trim() === '' || id.length > 191) {
    throw new MapsServiceError('ID titik spasial tidak valid.', 400);
  }
  const normalizedId = id.trim();

  const parsed = createCoverageSchema.safeParse(parseWritePayload(rawInput));
  if (!parsed.success) {
    throw parseZodErrorIssues(parsed.error);
  }
  const rtNumber = parsed.data.rtNumber;

  const pointLock = Prisma.sql`SELECT id FROM spatial_points WHERE id = ${normalizedId} FOR UPDATE`;

  try {
    return await executeLockedTransaction({
      client,
      // Point lock first (consistent with PATCH/DELETE ordering), then the RT's rt_leaders row
      // so concurrent ketua_rt writes claiming this same RT serialize on one resource.
      lockQuery: async (txRaw) => {
        const tx = txRaw as SpatialWriteTxClient;
        await tx.$queryRaw(pointLock);
        await leaderLockQuery([rtNumber])?.(tx);
      },
      execute: async (txRaw) => {
        const tx = txRaw as SpatialWriteTxClient;
        const point = (await tx.spatialPoint.findUnique({
          where: { id: normalizedId },
          include: { rtCoverages: { orderBy: { rtNumber: 'asc' } } },
        })) as unknown as SpatialPointWriteRow | null;
        if (!point) {
          throw new MapsServiceError('Titik spasial tidak ditemukan.', 404);
        }

        const clash = point.rtCoverages.some((cov) => cov.rtNumber === rtNumber);
        if (clash) {
          throw new MapsServiceError(
            `RT ${rtNumber.toString()} sudah terdaftar pada titik ini.`,
            409,
          );
        }

        const created = (await tx.spatialPointRt.create({
          data: { pointId: normalizedId, rtNumber },
        })) as unknown as { id: number; pointId: string; rtNumber: number; createdAt: Date };

        const postCoverages = normalizeCoverageSet([
          ...point.rtCoverages.map((cov) => cov.rtNumber),
          rtNumber,
        ]);
        await assertKetuaRtWriteInvariant(tx, {
          pointId: normalizedId,
          resultingType: point.type,
          resultingCoverages: postCoverages,
        });

        await buildAuditLog(
          {
            action: AUDIT_ACTIONS.SPATIAL_POINT_RT_CREATED,
            actor,
            target: { type: 'spatial_point_rt', id: String(created.id), label: `RT ${rtNumber}` },
            metadata: { pointId: normalizedId, pointType: point.type, coverages: postCoverages },
            context: reqContext,
          },
          tx,
        );

        return formatCoverage(created);
      },
    });
  } catch (error) {
    if (error instanceof MapsServiceError) throw error;
    if (isPrismaKnownError(error, 'P2002')) {
      throw new MapsServiceError(`RT ${rtNumber.toString()} sudah terdaftar pada titik ini.`, 409);
    }
    throw error;
  }
};

export const deleteSpatialPointCoverage = async (
  id: unknown,
  rtNumber: number,
  actor: AuditActor,
  reqContext: AuditRequestContext,
  client = prisma,
): Promise<SpatialPointCoverageDTO> => {
  if (typeof id !== 'string' || id.trim() === '' || id.length > 191) {
    throw new MapsServiceError('ID titik spasial tidak valid.', 400);
  }
  if (!Number.isInteger(rtNumber) || rtNumber < MIN_RT_NUMBER || rtNumber > MAX_RT_NUMBER) {
    throw new MapsServiceError(
      `Nomor RT harus berupa bilangan bulat antara ${MIN_RT_NUMBER} dan ${MAX_RT_NUMBER}.`,
      400,
    );
  }
  const normalizedId = id.trim();

  const pointLock = Prisma.sql`SELECT id FROM spatial_points WHERE id = ${normalizedId} FOR UPDATE`;

  // No error mapping needed: both P2025 sources (missing point, missing coverage row) are
  // already handled by the explicit 404 findUnique checks below inside the same locked
  // transaction, so every failure this function can meaningfully map is a MapsServiceError
  // already; anything else (connectivity, unexpected constraint) must surface raw.
  return await executeLockedTransaction({
    client,
    // Same resource pair as the coverage add path (point row, then rt_leaders row) so an RT
    // being freed here and an RT claimed elsewhere cannot race past each other's assert.
    lockQuery: async (txRaw) => {
      const tx = txRaw as SpatialWriteTxClient;
      await tx.$queryRaw(pointLock);
      await leaderLockQuery([rtNumber])?.(tx);
    },
    execute: async (txRaw) => {
      const tx = txRaw as SpatialWriteTxClient;
      const point = (await tx.spatialPoint.findUnique({
        where: { id: normalizedId },
        include: { rtCoverages: { orderBy: { rtNumber: 'asc' } } },
      })) as unknown as SpatialPointWriteRow | null;
      if (!point) {
        throw new MapsServiceError('Titik spasial tidak ditemukan.', 404);
      }

      const existing = (await tx.spatialPointRt.findUnique({
        where: { pointId_rtNumber: { pointId: normalizedId, rtNumber } },
      })) as unknown as { id: number; pointId: string; rtNumber: number; createdAt: Date } | null;
      if (!existing) {
        throw new MapsServiceError(
          `RT ${rtNumber.toString()} tidak terdaftar pada titik ini.`,
          404,
        );
      }

      await tx.spatialPointRt.delete({
        where: { pointId_rtNumber: { pointId: normalizedId, rtNumber } },
      });

      const postCoverages = normalizeCoverageSet(
        point.rtCoverages.filter((cov) => cov.rtNumber !== rtNumber).map((cov) => cov.rtNumber),
      );
      await assertKetuaRtWriteInvariant(tx, {
        pointId: normalizedId,
        resultingType: point.type,
        resultingCoverages: postCoverages,
      });

      await buildAuditLog(
        {
          action: AUDIT_ACTIONS.SPATIAL_POINT_RT_DELETED,
          actor,
          target: { type: 'spatial_point_rt', id: String(existing.id), label: `RT ${rtNumber}` },
          metadata: {
            pointId: normalizedId,
            pointType: point.type,
            coveragesAfter: postCoverages,
          },
          context: reqContext,
        },
        tx,
      );

      return formatCoverage(existing);
    },
  });
};

// --- RT leader edit ---------------------------------------------------------------

export const updateRtLeader = async (
  rtNumber: number,
  rawInput: unknown,
  actor: AuditActor,
  reqContext: AuditRequestContext,
  client = prisma,
): Promise<RtLeaderWriteDTO> => {
  if (!Number.isInteger(rtNumber) || rtNumber < MIN_RT_NUMBER || rtNumber > MAX_RT_NUMBER) {
    throw new MapsServiceError(
      `Nomor RT harus berupa bilangan bulat antara ${MIN_RT_NUMBER} dan ${MAX_RT_NUMBER}.`,
      400,
    );
  }

  const parsed = updateLeaderSchema.safeParse(parseWritePayload(rawInput));
  if (!parsed.success) {
    throw parseZodErrorIssues(parsed.error);
  }
  const input = parsed.data as UpdateLeaderInput & Record<string, unknown>;

  try {
    return await executeLockedTransaction({
      client,
      lockQuery: Prisma.sql`SELECT rt_number FROM rt_leaders WHERE rt_number = ${rtNumber} FOR UPDATE`,
      execute: async (txRaw) => {
        const tx = txRaw as SpatialWriteTxClient;
        const existing = (await tx.rtLeader.findUnique({
          where: { rtNumber },
        })) as unknown as RtLeaderWriteRow | null;
        if (!existing) {
          throw new MapsServiceError('Ketua RT tidak ditemukan.', 404);
        }

        // Privacy (SPEC.md §3): record only WHICH fields changed. Phone/alamat are a
        // resident's personal details; storing before/after values would persist them
        // indefinitely through the audit trail long after the person's tenure ends.
        const sanitizedName = input.name !== undefined ? input.name.trim() : undefined;
        const sanitizedPhone = input.phone !== undefined ? input.phone.trim() : undefined;
        const sanitizedAlamat =
          input.alamat !== undefined ? sanitizeNullableText(input.alamat) : undefined;
        const changedFields: string[] = [];
        if (input.name !== undefined && hasFieldChanged(existing.name, sanitizedName)) {
          changedFields.push('name');
        }
        if (input.phone !== undefined && hasFieldChanged(existing.phone, sanitizedPhone)) {
          changedFields.push('phone');
        }
        if (input.phoneIsWhatsapp !== undefined) {
          if (existing.phoneIsWhatsapp !== input.phoneIsWhatsapp) {
            changedFields.push('phoneIsWhatsapp');
          }
        }
        if (input.alamat !== undefined && hasFieldChanged(existing.alamat, sanitizedAlamat)) {
          changedFields.push('alamat');
        }

        if (changedFields.length === 0) {
          return withChangeResult(formatWrittenLeader(existing), false);
        }

        const updated = (await tx.rtLeader.update({
          where: { rtNumber },
          data: {
            ...(input.name !== undefined ? { name: input.name.trim() } : {}),
            ...(input.phone !== undefined ? { phone: input.phone.trim() } : {}),
            ...(input.phoneIsWhatsapp !== undefined
              ? { phoneIsWhatsapp: input.phoneIsWhatsapp }
              : {}),
            ...(input.alamat !== undefined ? { alamat: sanitizeNullableText(input.alamat) } : {}),
          },
        })) as unknown as RtLeaderWriteRow;

        await buildAuditLog(
          {
            action: AUDIT_ACTIONS.RT_LEADER_UPDATED,
            actor,
            target: { type: 'rt_leader', id: String(rtNumber), label: `RT ${rtNumber}` },
            metadata: { changedFields },
            context: reqContext,
          },
          tx,
        );

        // Any real edit means the roster is no longer the seeded sample set.
        await clearRtLeadersSampleRosterFlag(tx);

        return formatWrittenLeader(updated);
      },
    });
  } catch (error) {
    if (error instanceof MapsServiceError) throw error;
    if (isPrismaKnownError(error, 'P2025')) {
      throw new MapsServiceError('Ketua RT tidak ditemukan.', 404);
    }
    throw error;
  }
};
