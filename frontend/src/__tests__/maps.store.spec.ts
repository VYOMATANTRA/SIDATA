import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useMapsStore } from '../stores/maps';
import type { SpatialPointDTO, MapSummaryDTO } from '../types/maps';
import { MANGGAR_MAP_ORIGIN } from '../constants/mapOrigin';

describe('maps.ts Pinia Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  const mockPoints: SpatialPointDTO[] = [
    {
      id: 'point-1',
      name: 'Pos RT 01',
      type: 'ketua_rt',
      latitude: MANGGAR_MAP_ORIGIN.latitude,
      longitude: MANGGAR_MAP_ORIGIN.longitude,
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

  it('does not let an older leader lookup overwrite the current selection', async () => {
    let resolveFirst!: (value: import('../types/maps').RtLeaderDTO | null) => void;
    const firstLookup = new Promise<import('../types/maps').RtLeaderDTO | null>((resolve) => {
      resolveFirst = resolve;
    });
    const currentLeader = {
      rtNumber: 2,
      name: 'Current leader',
      phone: '08120000002',
      phoneIsWhatsapp: true,
      alamat: null,
      coordinates: null,
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
    };
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation((input) => {
      if (String(input).endsWith('/rt-leaders/1')) return firstLookup.then((leader) => ({ ok: true, json: async () => ({ leader }) }) as Response);
      if (String(input).endsWith('/rt-leaders/2')) return Promise.resolve({ ok: true, json: async () => ({ leader: currentLeader }) } as Response);
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    });

    const store = useMapsStore();
    const firstSelection = store.selectPoint(mockPoints[0]!);
    await store.selectPoint({ ...mockPoints[0]!, id: 'point-2', rts: [2] });
    resolveFirst({ ...currentLeader, rtNumber: 1, name: 'Stale leader' });
    await firstSelection;

    expect(store.selectedPoint?.rts).toEqual([2]);
    expect(store.selectedLeader?.name).toBe('Current leader');
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
