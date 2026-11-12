import type { SpatialPointDTO, SpatialPointType } from '../types/maps';
import { classifyFailure, toUserMessage } from './userMessages';

/**
 * Pure rules behind the admin map screen (`/admin/peta`, SPEC §8). Kept apart from the
 * components so the invariants the server enforces (SPEC §7: a Ketua RT point covers exactly one
 * RT, and an RT has at most one Ketua RT point) can be checked and worded in one place.
 */

export const POINT_TYPE_LABELS: Readonly<Record<SpatialPointType, string>> = {
  ketua_rt: 'Ketua RT',
  bank_sampah: 'Bank Sampah',
  fasilitas_umum: 'Fasilitas Umum',
};

export const POINT_TYPES: readonly SpatialPointType[] = ['ketua_rt', 'bank_sampah', 'fasilitas_umum'];

/** The 100 RT numbers of Kelurahan Manggar (SPEC §7: `rt_number BETWEEN 1 AND 100`). */
export const RT_NUMBERS: readonly number[] = Array.from({ length: 100 }, (_, index) => index + 1);

export function typeLabel(type: SpatialPointType): string {
  return POINT_TYPE_LABELS[type] ?? 'Titik';
}

/** "RT 5", "RT 1, 2, 3" or a plain "Belum ada RT". */
export function formatRtList(rts: readonly number[]): string {
  if (rts.length === 0) return 'Belum ada RT';
  return `RT ${[...rts].sort((a, b) => a - b).join(', ')}`;
}

/** Default name offered for a new Ketua RT point; matches the RT management screen. */
export function suggestedKetuaRtName(rtNumber: number): string {
  return `Pos RT ${String(rtNumber).padStart(2, '0')} Kelurahan Manggar`;
}

/**
 * Search over name and RT number. A digits-only query also matches an RT number by prefix, so
 * `1` finds RT 1 and RT 10-19 (the same rule as the public Ketua RT page).
 */
export function matchesPointSearch(point: SpatialPointDTO, query: string): boolean {
  const term = query.trim().toLowerCase();
  if (term === '') return true;
  if (point.name.toLowerCase().includes(term)) return true;
  if (/^\d+$/.test(term)) {
    const bare = term.replace(/^0+(?=\d)/, '');
    return point.rts.some((rt) => String(rt).startsWith(bare));
  }
  return false;
}

/** The RT a Ketua RT point owns, or undefined when it is not a well-formed single-RT point. */
export function ownedRtNumber(
  point: Pick<SpatialPointDTO, 'type' | 'rts'>,
): number | undefined {
  return point.type === 'ketua_rt' && point.rts.length === 1 ? point.rts[0] : undefined;
}

export type CoverageIssueKind = 'ketua-rt-not-single' | 'rt-shared' | 'inconsistent';

export interface CoverageIssue {
  kind: CoverageIssueKind;
  /** The RT involved, when there is one. */
  rtNumber?: number;
  /** Plain-language problem and the action that fixes it. */
  message: string;
}

export interface CoverageAnalysis {
  /** Problems per point id; a point without problems is absent. */
  issues: Map<string, CoverageIssue[]>;
  /** For every RT with at least one Ketua RT point: the points that cover it. */
  ketuaRtOwners: Map<number, SpatialPointDTO[]>;
}

/**
 * Finds the coverage problems the public read path would also flag, and words them for an
 * operator with a corrective action. Derived from the points themselves, not from the server's
 * technical `integrityWarning` text; that text only decides whether a generic notice is shown
 * when none of the specific rules explains the warning.
 */
export function analyzeCoverage(points: readonly SpatialPointDTO[]): CoverageAnalysis {
  const ketuaRtOwners = new Map<number, SpatialPointDTO[]>();
  for (const point of points) {
    if (point.type !== 'ketua_rt') continue;
    for (const rt of point.rts) {
      const owners = ketuaRtOwners.get(rt);
      if (owners) owners.push(point);
      else ketuaRtOwners.set(rt, [point]);
    }
  }

  const issues = new Map<string, CoverageIssue[]>();
  const add = (pointId: string, issue: CoverageIssue) => {
    const list = issues.get(pointId);
    if (list) list.push(issue);
    else issues.set(pointId, [issue]);
  };

  for (const point of points) {
    if (point.type === 'ketua_rt' && point.rts.length !== 1) {
      const current =
        point.rts.length === 0 ? 'belum memilih RT' : `memilih ${point.rts.length} RT`;
      add(point.id, {
        kind: 'ketua-rt-not-single',
        message: `Titik Ketua RT harus memilih tepat satu RT, sedangkan titik ini ${current}. Buka Ubah, lalu pilih satu RT.`,
      });
    }
  }
  for (const [rt, owners] of ketuaRtOwners) {
    if (owners.length < 2) continue;
    for (const owner of owners) {
      add(owner.id, {
        kind: 'rt-shared',
        rtNumber: rt,
        message: `RT ${rt} dipakai oleh lebih dari satu titik Ketua RT. Hapus salah satu titik, atau Ubah dan pilih RT yang lain.`,
      });
    }
  }
  for (const point of points) {
    if (point.integrityWarning && point.integrityWarning.trim() !== '' && !issues.has(point.id)) {
      add(point.id, {
        kind: 'inconsistent',
        message:
          'Data titik ini bertentangan dengan data lain. Buka Ubah dan periksa RT yang dipilih.',
      });
    }
  }
  return { issues, ketuaRtOwners };
}

/** The other Ketua RT point (not `excludeId`) that already covers `rtNumber`, if any. */
export function otherKetuaRtOwner(
  rtNumber: number,
  analysis: CoverageAnalysis,
  excludeId?: string,
): SpatialPointDTO | undefined {
  return analysis.ketuaRtOwners.get(rtNumber)?.find((owner) => owner.id !== excludeId);
}

export const STALE_POINT_MESSAGE =
  'Titik ini baru saja diubah atau dihapus oleh orang lain. Muat ulang titik sebelum menyimpan lagi; isian Anda tetap tersimpan di formulir sampai Anda memuat ulang.';

export const RT_TAKEN_MESSAGE =
  'RT yang dipilih sudah dipakai titik Ketua RT lain. Pilih RT yang lain, atau ubah atau hapus titik yang lama terlebih dahulu.';

/** True when the point changed under the editor (stale ownership, 409) or no longer exists (404). */
export function isStaleOrGone(error: unknown): boolean {
  const { kind } = classifyFailure(error);
  return kind === 'stale' || kind === 'not_found';
}

/**
 * Approved text for a failed point save. A concurrent-edit conflict and a duplicate Ketua RT
 * claim are both HTTP 409 but need different advice, and the server's own sentence for the
 * second one names internal ids, so it is replaced rather than shown.
 */
export function describePointSaveError(error: unknown): string {
  const { kind } = classifyFailure(error);
  if (kind === 'stale' || kind === 'not_found') return STALE_POINT_MESSAGE;
  if (kind === 'conflict') return RT_TAKEN_MESSAGE;
  return toUserMessage(error, 'menyimpan titik').message;
}
