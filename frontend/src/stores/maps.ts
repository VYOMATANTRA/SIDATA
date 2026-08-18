import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { SpatialPointDTO, SpatialPointType, MapSummaryDTO, RtLeaderDTO } from '../types/maps';
import { fetchSpatialPoints, fetchMapSummary, fetchRtLeaderByRt } from '../services/maps.service';

export const useMapsStore = defineStore('maps', () => {
  const points = ref<SpatialPointDTO[]>([]);
  const summary = ref<MapSummaryDTO | null>(null);
  const selectedPoint = ref<SpatialPointDTO | null>(null);
  const selectedLeader = ref<RtLeaderDTO | null>(null);
  const activeTypeFilter = ref<SpatialPointType | 'all'>('all');
  const activeRtFilter = ref<number | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

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
    isLoading.value = true;
    error.value = null;
    try {
      points.value = await fetchSpatialPoints();
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Gagal memuat titik peta';
    } finally {
      isLoading.value = false;
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
    selectedPoint.value = point;
    selectedLeader.value = null;

    if (point && point.type === 'ketua_rt' && point.rts.length > 0) {
      const primaryRt = point.rts[0];
      if (typeof primaryRt === 'number') {
        try {
          selectedLeader.value = await fetchRtLeaderByRt(primaryRt);
        } catch {
          // If RT leader lookup fails, proceed with available point info
        }
      }
    }
  }

  function setTypeFilter(type: SpatialPointType | 'all') {
    activeTypeFilter.value = type;
  }

  function setRtFilter(rt: number | null) {
    activeRtFilter.value = rt;
  }

  function clearSelection() {
    selectedPoint.value = null;
    selectedLeader.value = null;
  }

  return {
    points,
    summary,
    selectedPoint,
    selectedLeader,
    activeTypeFilter,
    activeRtFilter,
    isLoading,
    error,
    filteredPoints,
    loadPoints,
    loadSummary,
    selectPoint,
    setTypeFilter,
    setRtFilter,
    clearSelection,
  };
});
