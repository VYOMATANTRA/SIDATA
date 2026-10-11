import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useMapsStore } from '../stores/maps';
import type { SpatialPointDTO, MapSummaryDTO } from '../types/maps';

describe('maps.ts Pinia Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  const mockPoints: SpatialPointDTO[] = [
    {
      id: 'point-1',
      name: 'Pos RT 01',
      type: 'ketua_rt',
      latitude: -1.2235,
      longitude: 116.9521,
      metadata: null,
      rts: [1],
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
    },
    {
      id: 'point-2',
      name: 'Bank Sampah',
      type: 'bank_sampah',
      latitude: -1.225,
      longitude: 116.955,
      metadata: null,
      rts: [1, 2, 3],
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
    },
  ];

  const mockSummary: MapSummaryDTO = {
    totalPoints: 2,
    pointsByType: { ketua_rt: 1, bank_sampah: 1, fasilitas_umum: 0 },
    totalRtLeaders: 100,
    rtLeadersWithCoordinates: 1,
    rtLeadersWithoutCoordinates: 99,
    rtLeadersWithIntegrityConflicts: 0,
  };

  it('loads points and applies category filter', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ points: mockPoints, total: 2 }),
    } as Response);

    const store = useMapsStore();
    await store.loadPoints();

    expect(store.points.length).toBe(2);
    expect(store.filteredPoints.length).toBe(2);

    store.setTypeFilter('ketua_rt');
    expect(store.filteredPoints.length).toBe(1);
    expect(store.filteredPoints[0]?.type).toBe('ketua_rt');

    store.setTypeFilter('all');
    expect(store.filteredPoints.length).toBe(2);
  });

  it('filters points by RT number', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ points: mockPoints, total: 2 }),
    } as Response);

    const store = useMapsStore();
    await store.loadPoints();

    store.setRtFilter(2);
    // Only Bank Sampah covers RT 2
    expect(store.filteredPoints.length).toBe(1);
    expect(store.filteredPoints[0]?.name).toBe('Bank Sampah');
  });

  it('loads map summary metrics', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => mockSummary,
    } as Response);

    const store = useMapsStore();
    await store.loadSummary();

    expect(store.summary?.totalPoints).toBe(2);
    expect(store.summary?.pointsByType.ketua_rt).toBe(1);
  });
});
