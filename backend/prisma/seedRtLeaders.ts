import { RT_LEADERS_DATA, type RtSeedRecord } from './rtLeadersData.js';

/** system_settings key: JSON array of seeded Ketua RT point ids an editor deleted. */
export const RT_SEED_POINT_TOMBSTONES_KEY = 'maps.rt_seed_point_tombstones';

export function parseSeedPointTombstones(raw: string | null | undefined): Set<string> {
  if (typeof raw !== 'string' || raw.trim() === '') return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.trim() !== ''));
  } catch {
    return new Set();
  }
}

export function serializeSeedPointTombstones(ids: Iterable<string>): string {
  return JSON.stringify([...new Set(ids)].sort());
}

/** Deterministic UUID used by the seed for each Ketua RT spatial point. */
export function seededKetuaRtPointId(rtNumber: number): string {
  return `00000000-0000-0000-0001-${String(rtNumber).padStart(12, '0')}`;
}

export function isSeededKetuaRtPointId(
  id: string,
  data: RtSeedRecord[] = RT_LEADERS_DATA,
): boolean {
  return data.some((rt) => seededKetuaRtPointId(rt.rtNumber) === id);
}

/**
 * The subset of the Prisma client the RT-leader seeding needs. Narrowing it keeps
 * the seeding rule testable without a database.
 */
export interface RtLeaderSeedClient {
  rtLeader: {
    upsert(args: {
      where: { rtNumber: number };
      update: Record<string, never>;
      create: {
        rtNumber: number;
        name: string;
        phone: string;
        phoneIsWhatsapp: boolean;
        alamat: string | null;
      };
    }): Promise<unknown>;
  };
  spatialPoint: {
    findUnique(args: { where: { id: string } }): Promise<{ id: string } | null>;
    upsert(args: {
      where: { id: string };
      update: Record<string, never>;
      create: {
        id: string;
        name: string;
        type: 'ketua_rt';
        latitude: number;
        longitude: number;
        metadata: Record<string, string>;
        rtCoverages?: { create: Array<{ rtNumber: number }> };
      };
    }): Promise<unknown>;
  };
}

export type SeedRtLeadersOptions = {
  /**
   * Point ids an editor deleted on purpose. Re-seed must not recreate these
   * points or their default coverage (SPEC §2 tombstone rule).
   */
  skippedPointIds?: ReadonlySet<string>;
};

/**
 * Seeds one RT-leader row per RT together with its 1:1 spatial point.
 *
 * Every leader/point upsert carries `update: {}` on purpose. Re-running the seed
 * must only fill in rows that are missing; passing the stored values in `update`
 * would silently revert any correction an editor has already made, which SPEC §2
 * forbids. The RT-coverage junction is created only when the point itself is new
 * (nested on the create payload so point + coverage commit together). Tombstoned
 * point ids are skipped entirely so an editor delete sticks across re-seeds.
 *
 * Returns the number of RTs processed (leaders considered), including skipped points.
 */
export async function seedRtLeaders(
  client: RtLeaderSeedClient,
  data: RtSeedRecord[] = RT_LEADERS_DATA,
  options: SeedRtLeadersOptions = {},
): Promise<number> {
  const skipped = options.skippedPointIds ?? new Set<string>();

  for (const rt of data) {
    await client.rtLeader.upsert({
      where: { rtNumber: rt.rtNumber },
      update: {},
      create: {
        rtNumber: rt.rtNumber,
        name: rt.name,
        phone: rt.phone,
        phoneIsWhatsapp: rt.phoneIsWhatsapp,
        alamat: rt.alamat,
      },
    });

    const pointId = seededKetuaRtPointId(rt.rtNumber);
    if (skipped.has(pointId)) {
      continue;
    }

    const pointName = `Pos RT ${String(rt.rtNumber).padStart(2, '0')} Kelurahan Manggar`;
    const metadata = { keterangan: `Ketua RT ${rt.rtNumber}: ${rt.name}` };

    const existingPoint = await client.spatialPoint.findUnique({ where: { id: pointId } });

    if (existingPoint) {
      // Point already present: never overwrite fields or re-attach coverage.
      await client.spatialPoint.upsert({
        where: { id: pointId },
        update: {},
        create: {
          id: pointId,
          name: pointName,
          type: 'ketua_rt',
          latitude: rt.latitude,
          longitude: rt.longitude,
          metadata,
        },
      });
      continue;
    }

    // New point: create the point and its default coverage in one nested write so a
    // crash cannot leave a seeded point with no RT coverage.
    await client.spatialPoint.upsert({
      where: { id: pointId },
      update: {},
      create: {
        id: pointId,
        name: pointName,
        type: 'ketua_rt',
        latitude: rt.latitude,
        longitude: rt.longitude,
        metadata,
        rtCoverages: { create: [{ rtNumber: rt.rtNumber }] },
      },
    });
  }

  return data.length;
}
