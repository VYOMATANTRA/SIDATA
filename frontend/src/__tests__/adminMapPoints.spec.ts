import { describe, expect, it } from 'vitest';
import { ApiError } from '../utils/apiClient';
import type { SpatialPointDTO } from '../types/maps';
import {
  RT_TAKEN_MESSAGE,
  STALE_POINT_MESSAGE,
  analyzeCoverage,
  describePointSaveError,
  formatRtList,
  isStaleOrGone,
  matchesPointSearch,
  otherKetuaRtOwner,
  ownedRtNumber,
  suggestedKetuaRtName,
} from '../utils/adminMapPoints';

function point(overrides: Partial<SpatialPointDTO> & Pick<SpatialPointDTO, 'id'>): SpatialPointDTO {
  return {
    name: `Titik ${overrides.id}`,
    type: 'ketua_rt',
    latitude: -1.22,
    longitude: 116.94,
    metadata: null,
    rts: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('adminMapPoints', () => {
  it('formats RT coverage in plain words', () => {
    expect(formatRtList([])).toBe('Belum ada RT');
    expect(formatRtList([30, 5, 72])).toBe('RT 5, 30, 72');
  });

  it('suggests the same Ketua RT name the RT screen uses', () => {
    expect(suggestedKetuaRtName(5)).toBe('Pos RT 05 Kelurahan Manggar');
    expect(suggestedKetuaRtName(100)).toBe('Pos RT 100 Kelurahan Manggar');
  });

  it('searches name and RT number, with digits matching an RT number by prefix', () => {
    const rt1 = point({ id: 'a', name: 'Pos RT 01', rts: [1] });
    const rt12 = point({ id: 'b', name: 'Pos Ronda Mawar', rts: [12] });
    const bsu = point({ id: 'c', name: 'Bank Sampah Mawar', type: 'bank_sampah', rts: [30, 72] });
    expect(matchesPointSearch(rt1, '')).toBe(true);
    expect(matchesPointSearch(bsu, 'mawar')).toBe(true);
    expect(matchesPointSearch(bsu, 'MAWAR')).toBe(true);
    expect(matchesPointSearch(rt1, '1')).toBe(true);
    expect(matchesPointSearch(rt12, '1')).toBe(true);
    expect(matchesPointSearch(rt12, '2')).toBe(false); // prefix of the RT number, not any digit
    expect(matchesPointSearch(point({ id: 'd', name: 'Pos 2 Barat', rts: [40] }), '2')).toBe(true); // name contains it
    expect(matchesPointSearch(rt1, '001')).toBe(true);
    expect(matchesPointSearch(bsu, '72')).toBe(true);
    expect(matchesPointSearch(bsu, '7')).toBe(true);
    expect(matchesPointSearch(bsu, '99')).toBe(false);
  });

  it('reports the RT a point owns only for a well-formed Ketua RT point', () => {
    expect(ownedRtNumber({ type: 'ketua_rt', rts: [4] })).toBe(4);
    expect(ownedRtNumber({ type: 'ketua_rt', rts: [4, 5] })).toBeUndefined();
    expect(ownedRtNumber({ type: 'ketua_rt', rts: [] })).toBeUndefined();
    expect(ownedRtNumber({ type: 'bank_sampah', rts: [4] })).toBeUndefined();
  });

  describe('analyzeCoverage', () => {
    it('finds no problem in a consistent set and lets Bank Sampah cover several RTs', () => {
      const result = analyzeCoverage([
        point({ id: 'a', rts: [1] }),
        point({ id: 'b', rts: [2] }),
        point({ id: 'c', type: 'bank_sampah', rts: [1, 2, 3] }),
        point({ id: 'd', type: 'bank_sampah', rts: [1, 2] }),
      ]);
      expect(result.issues.size).toBe(0);
      expect(result.ketuaRtOwners.get(1)?.map((p) => p.id)).toEqual(['a']);
      expect(result.ketuaRtOwners.has(3)).toBe(false);
    });

    it('flags a Ketua RT point that covers no RT or several RTs, with a corrective action', () => {
      const result = analyzeCoverage([
        point({ id: 'none', rts: [] }),
        point({ id: 'many', rts: [3, 4] }),
      ]);
      expect(result.issues.get('none')?.[0]).toMatchObject({ kind: 'ketua-rt-not-single' });
      expect(result.issues.get('none')?.[0]?.message).toContain('belum memilih RT');
      expect(result.issues.get('many')?.[0]?.message).toContain('memilih 2 RT');
      expect(result.issues.get('many')?.[0]?.message).toContain('Buka Ubah');
    });

    it('flags every Ketua RT point that shares an RT', () => {
      const result = analyzeCoverage([
        point({ id: 'a', rts: [5] }),
        point({ id: 'b', rts: [5] }),
        point({ id: 'c', rts: [6] }),
      ]);
      expect(result.issues.get('a')?.[0]).toMatchObject({ kind: 'rt-shared', rtNumber: 5 });
      expect(result.issues.get('b')?.[0]).toMatchObject({ kind: 'rt-shared', rtNumber: 5 });
      expect(result.issues.has('c')).toBe(false);
      expect(otherKetuaRtOwner(5, result, 'a')?.id).toBe('b');
      expect(otherKetuaRtOwner(6, result, 'c')).toBeUndefined();
    });

    it('falls back to a generic notice for a server integrity warning no rule explains', () => {
      const result = analyzeCoverage([
        point({
          id: 'x',
          type: 'bank_sampah',
          rts: [9],
          integrityWarning: 'RT 9 tidak memiliki baris rt_leaders',
        }),
      ]);
      const issue = result.issues.get('x')?.[0];
      expect(issue?.kind).toBe('inconsistent');
      expect(issue?.message).not.toMatch(/rt_leaders|integrity/i);
    });
  });

  describe('save errors', () => {
    it('treats a stale-write conflict and a missing point as "changed under you"', () => {
      const stale = new ApiError('x', 409, { code: 'STALE_WRITE' });
      const gone = new ApiError('x', 404);
      expect(isStaleOrGone(stale)).toBe(true);
      expect(isStaleOrGone(gone)).toBe(true);
      expect(describePointSaveError(stale)).toBe(STALE_POINT_MESSAGE);
      expect(describePointSaveError(gone)).toBe(STALE_POINT_MESSAGE);
    });

    it('words a duplicate Ketua RT claim without the server text, which names internal ids', () => {
      const conflict = new ApiError('x', 409, {
        serverMessage: 'RT 5 sudah dicakup oleh titik ketua_rt lain (clx123)',
      });
      expect(isStaleOrGone(conflict)).toBe(false);
      expect(describePointSaveError(conflict)).toBe(RT_TAKEN_MESSAGE);
      expect(describePointSaveError(conflict)).not.toMatch(/clx123|ketua_rt/);
    });

    it('uses the shared mapper for everything else', () => {
      expect(describePointSaveError(new ApiError('x', 500))).toContain('menyimpan titik');
      expect(describePointSaveError(new ApiError('x', 500))).not.toMatch(/500|HTTP/);
    });
  });
});
