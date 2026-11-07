import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { SpatialPointDTO, SpatialPointType, MapSummaryDTO, RtLeaderDTO } from '../types/maps';
import { fetchSpatialPoints, fetchMapSummary } from '../services/maps.service';
import { toUserMessage } from '../utils/userMessages';

export const useMapsStore = defineStore('maps', () => {
  const points = ref<SpatialPointDTO[]>([]);
  const summary = ref<MapSummaryDTO | null>(null);
  const selectedPoint = ref<SpatialPointDTO | null>(null);
  const activeTypeFilter = ref<SpatialPointType | 'all'>('all');
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const summaryError = ref<string | null>(null);
  const isSummaryLoading = ref(false);
  let loadPointsRequest = 0;
  let loadSummaryRequest = 0;

  const filteredPoints = computed(() => {
    return points.value.filter((point) => {
      if (activeTypeFilter.value !== 'all' && point.type !== activeTypeFilter.value) {
        return false;
      }
      return true;
    });
  });

  /**
   * Resolves contact strictly from embedded point data under the validity predicate.
   * Never falls back to standalone leader fetches when conflicted or missing.
   */
  const selectedLeader = computed<RtLeaderDTO | null>(() => {
    const point = selectedPoint.value;
    if (!point || point.type !== 'ketua_rt') return null;
    if (
      point.rts.length !== 1 ||
      (point.integrityWarning && point.integrityWarning.trim() !== '')
    ) {
      return null;
    }
    const leader = point.rtLeader;
    if (!leader || leader.rtNumber !== point.rts[0]) {
      return null;
    }
    return {
      ...leader,
      coordinates: {
        latitude: point.latitude,
        longitude: point.longitude,
        pointId: point.id,
      },
      createdAt: point.createdAt,
      updatedAt: point.updatedAt,
    };
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
        const previousId = selectedPoint.value.id;
        const fresh = points.value.find((p) => p.id === previousId) ?? null;
        if (!fresh) {
          clearSelection();
        } else {
          selectedPoint.value = fresh;
        }
      }
    } catch (err) {
      if (requestId !== loadPointsRequest) return;
      error.value = toUserMessage(err, 'memuat titik peta', 'GET').message;
    } finally {
      if (requestId === loadPointsRequest) {
        isLoading.value = false;
      }
    }
  }

  async function loadSummary() {
    const requestId = ++loadSummaryRequest;
    isSummaryLoading.value = true;
    summaryError.value = null;
    try {
      const fetched = await fetchMapSummary();
      if (requestId === loadSummaryRequest) summary.value = fetched;
    } catch (err) {
      if (requestId === loadSummaryRequest) {
        summaryError.value = toUserMessage(err, 'memuat ringkasan peta', 'GET').message;
      }
    } finally {
      if (requestId === loadSummaryRequest) isSummaryLoading.value = false;
    }
  }

  function selectPoint(point: SpatialPointDTO | null) {
    selectedPoint.value = point;
  }

  function setTypeFilter(type: SpatialPointType | 'all') {
    activeTypeFilter.value = type;
  }

  function clearSelection() {
    selectedPoint.value = null;
  }

  return {
    points,
    summary,
    selectedPoint,
    selectedLeader,
    activeTypeFilter,
    isLoading,
    error,
    summaryError,
    isSummaryLoading,
    filteredPoints,
    loadPoints,
    loadSummary,
    selectPoint,
    setTypeFilter,
    clearSelection,
  };
});
