import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { SpatialPointDTO, SpatialPointType, MapSummaryDTO, RtLeaderDTO } from '../types/maps';
import { fetchSpatialPoints, fetchMapSummary, fetchRtLeaderByRt } from '../services/maps.service';

export const useMapsStore = defineStore('maps', () => {
  const points = ref<SpatialPointDTO[]>([]);
  const summary = ref<MapSummaryDTO | null>(null);
  const selectedPoint = ref<SpatialPointDTO | null>(null);
  const selectedLeader = ref<RtLeaderDTO | null>(null);
  const selectedLeaderError = ref<string | null>(null);
  const activeTypeFilter = ref<SpatialPointType | 'all'>('all');
  const activeRtFilter = ref<number | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  let selectionRequest = 0;
  let loadPointsRequest = 0;

  const filteredPoints = computed(() => {
    return points.value.filter((point) => {
      if (activeTypeFilter.value !== 'all' && point.type !== activeTypeFilter.value) {
        return false;
      }
      if (activeRtFilter.value !== null && !point.rts.includes(activeRtFilter.value)) {
        return false;
      }
      return true;
    });
  });

  async function loadPoints() {
    const requestId = ++loadPointsRequest;
    isLoading.value = true;
    error.value = null;
    try {
      const fetched = await fetchSpatialPoints();
      if (requestId !== loadPointsRequest) return;
      points.value = fetched;
      if (selectedPoint.value) {
        const fresh = points.value.find((p) => p.id === selectedPoint.value?.id) ?? null;
        void selectPoint(fresh);
      }
    } catch (err) {
      if (requestId !== loadPointsRequest) return;
      error.value = err instanceof Error ? err.message : 'Gagal memuat titik peta';
    } finally {
      if (requestId === loadPointsRequest) {
        isLoading.value = false;
      }
    }
  }

  async function loadSummary() {
    try {
      summary.value = await fetchMapSummary();
    } catch {
      // Non-blocking summary load failure
    }
  }

  async function selectPoint(point: SpatialPointDTO | null) {
    const requestId = ++selectionRequest;
    selectedPoint.value = point;
    selectedLeader.value = null;
    selectedLeaderError.value = null;

    if (point && point.type === 'ketua_rt' && point.rts.length > 0) {
      if (point.rtLeader) {
        selectedLeader.value = {
          ...point.rtLeader,
          coordinates: {
            latitude: point.latitude,
            longitude: point.longitude,
            pointId: point.id,
          },
          createdAt: point.createdAt,
          updatedAt: point.updatedAt,
        };
        return;
      }
      const primaryRt = point.rts[0];
      if (typeof primaryRt === 'number') {
        try {
          const leader = await fetchRtLeaderByRt(primaryRt);
          if (requestId === selectionRequest) selectedLeader.value = leader;
        } catch (err) {
          if (requestId === selectionRequest) {
            selectedLeaderError.value =
              err instanceof Error ? err.message : 'Gagal memuat kontak Ketua RT';
          }
        }
      }
    }
  }

  async function retrySelectedLeader() {
    if (selectedPoint.value) {
      await selectPoint(selectedPoint.value);
    }
  }

  function setTypeFilter(type: SpatialPointType | 'all') {
    activeTypeFilter.value = type;
  }

  function setRtFilter(rt: number | null) {
    activeRtFilter.value = rt;
  }

  function clearSelection() {
    selectionRequest += 1;
    selectedPoint.value = null;
    selectedLeader.value = null;
    selectedLeaderError.value = null;
  }

  return {
    points,
    summary,
    selectedPoint,
    selectedLeader,
    selectedLeaderError,
    activeTypeFilter,
    activeRtFilter,
    isLoading,
    error,
    filteredPoints,
    loadPoints,
    loadSummary,
    selectPoint,
    retrySelectedLeader,
    setTypeFilter,
    setRtFilter,
    clearSelection,
  };
});
