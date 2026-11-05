import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useMapsStore } from '../stores/maps';
import type { SpatialPointDTO, MapSummaryDTO, RtLeaderDTO } from '../types/maps';
import { MANGGAR_MAP_ORIGIN } from '../constants/mapOrigin';

describe('maps.ts Pinia Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  const mockLeader: RtLeaderDTO = {
    rtNumber: 1,
    name: 'Leader Satu',
    phone: '08120000001',
    phoneIsWhatsapp: true,
    alamat: 'Jl. RT 1',
    coordinates: null,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  };

  const mockPoints: SpatialPointDTO[] = [
    {
      id: 'point-1',
      name: 'Pos RT 01',
      type: 'ketua_rt',
      latitude: MANGGAR_MAP_ORIGIN.latitude,
      longitude: MANGGAR_MAP_ORIGIN.longitude,
      metadata: null,
      rts: [1],
      rtLeader: mockLeader,
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

  it('derives selectedLeader strictly from the selected point without issuing secondary fetch', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    globalThis.fetch = fetchMock;

    const store = useMapsStore();
    store.selectPoint(mockPoints[0]!);

    expect(store.selectedPoint?.id).toBe('point-1');
    expect(store.selectedLeader?.name).toBe('Leader Satu');
    expect(store.selectedLeader?.rtNumber).toBe(1);
    expect(store.selectedLeader?.coordinates?.pointId).toBe('point-1');
    // Selecting a point must never fetch from the standalone leader endpoint
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('evaluates selectedLeader as null when point has an integrityWarning', () => {
    const store = useMapsStore();
    store.selectPoint({
      ...mockPoints[0]!,
      integrityWarning: 'Integrity conflict on RT 1',
    });

    expect(store.selectedLeader).toBeNull();
  });

  it('evaluates selectedLeader as null when point has multiple RTs or mismatched rtNumber', () => {
    const store = useMapsStore();

    // Multiple RT coverages
    store.selectPoint({
      ...mockPoints[0]!,
      rts: [1, 2],
    });
    expect(store.selectedLeader).toBeNull();

    // Mismatched rtNumber
    store.selectPoint({
      ...mockPoints[0]!,
      rts: [1],
      rtLeader: { ...mockLeader, rtNumber: 2 },
    });
    expect(store.selectedLeader).toBeNull();
  });

  it('keeps an open contact card when points reload with same valid point and leader', async () => {
    const store = useMapsStore();
    store.selectPoint(mockPoints[0]!);
    expect(store.selectedLeader?.name).toBe('Leader Satu');

    const updatedLeader = { ...mockLeader, name: 'Leader Satu Update' };
    const refreshedPoint = { ...mockPoints[0]!, rtLeader: updatedLeader };

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ points: [refreshedPoint], total: 1 }),
    } as Response);

    await store.loadPoints();
    expect(store.selectedPoint?.id).toBe('point-1');
    expect(store.selectedLeader?.name).toBe('Leader Satu Update');
  });

  it('removes contact immediately when point reloads into an integrity conflict', async () => {
    const store = useMapsStore();
    store.selectPoint(mockPoints[0]!);
    expect(store.selectedLeader).not.toBeNull();

    const conflictedPoint = {
      ...mockPoints[0]!,
      integrityWarning: 'Disputed point',
      rtLeader: null,
    };

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ points: [conflictedPoint], total: 1 }),
    } as Response);

    await store.loadPoints();
    expect(store.selectedPoint?.id).toBe('point-1');
    expect(store.selectedPoint?.integrityWarning).toBe('Disputed point');
    expect(store.selectedLeader).toBeNull();
  });

  it('clears selection when selected point is removed during points reload', async () => {
    const store = useMapsStore();
    store.selectPoint(mockPoints[0]!);
    expect(store.selectedPoint).not.toBeNull();

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ points: [mockPoints[1]!], total: 1 }),
    } as Response);

    await store.loadPoints();
    expect(store.selectedPoint).toBeNull();
    expect(store.selectedLeader).toBeNull();
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
