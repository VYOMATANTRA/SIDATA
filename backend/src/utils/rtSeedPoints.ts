/** system_settings key: JSON array of seeded Ketua RT point ids an editor deleted. */
export const RT_SEED_POINT_TOMBSTONES_KEY = 'maps.rt_seed_point_tombstones';

const SEEDED_RT_POINT_ID = /^00000000-0000-0000-0001-(\d{12})$/;

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
  data?: readonly { rtNumber: number }[],
): boolean {
  if (data) return data.some((rt) => seededKetuaRtPointId(rt.rtNumber) === id);
  const match = SEEDED_RT_POINT_ID.exec(id);
  if (!match?.[1]) return false;
  const rtNumber = Number(match[1]);
  return rtNumber >= 1 && rtNumber <= 100;
}
