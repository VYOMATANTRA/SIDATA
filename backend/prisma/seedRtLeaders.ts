import { RT_LEADERS_DATA, type RtSeedRecord } from './rtLeadersData.js';

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
      };
    }): Promise<unknown>;
  };
  spatialPointRt: {
    upsert(args: {
      where: { pointId_rtNumber: { pointId: string; rtNumber: number } };
      update: Record<string, never>;
      create: { pointId: string; rtNumber: number };
    }): Promise<unknown>;
  };
}

/**
 * Seeds one RT-leader row per RT together with its 1:1 spatial point.
 *
 * Every upsert carries `update: {}` on purpose. Re-running the seed must only fill
 * in rows that are missing; passing the stored values in `update` would silently
 * revert any correction an editor has already made, which SPEC §2 forbids.
 *
 * Returns the number of RTs processed.
 */
export async function seedRtLeaders(
  client: RtLeaderSeedClient,
  data: RtSeedRecord[] = RT_LEADERS_DATA,
): Promise<number> {
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

    const pointId = `00000000-0000-0000-0001-${String(rt.rtNumber).padStart(12, '0')}`;
    const pointName = `Pos RT ${String(rt.rtNumber).padStart(2, '0')} Kelurahan Manggar`;
    const metadata = { keterangan: `Ketua RT ${rt.rtNumber}: ${rt.name}` };

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

    await client.spatialPointRt.upsert({
      where: { pointId_rtNumber: { pointId, rtNumber: rt.rtNumber } },
      update: {},
      create: { pointId, rtNumber: rt.rtNumber },
    });
  }

  return data.length;
}
