import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiRequestJson } from '../utils/apiClient';
import { toUserMessage, type FailureKind } from '../utils/userMessages';

export interface DashboardCounts {
  indicators: number;
  indicatorTables: number;
  pages: number;
  publications: number;
  rtLeaders: number;
  spatialPoints: number;
}

export interface DashboardStaleIndicator {
  id: string;
  label: string;
  pageSlug: string | null;
}

export interface DashboardHealth {
  staleIndicators: { count: number; items: DashboardStaleIndicator[] };
  rtLeadersWithoutCoordinates: number;
  rtLeadersWithIntegrityConflicts: number;
}

export interface DashboardRecentChange {
  action: string;
  targetType: string | null;
  targetLabel: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface DashboardData {
  counts: DashboardCounts;
  health: DashboardHealth;
  recentChanges: DashboardRecentChange[];
}

interface DashboardResponse {
  dashboard?: DashboardData;
}

/** Shown when the response arrives without the dashboard object. */
export const DASHBOARD_UNREADABLE_MESSAGE = 'Data dasbor belum dapat dibaca.';

export const useDashboardStore = defineStore('dashboard', () => {
  const dashboard = ref<DashboardData | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  /** Failure class of `error`, for AlertBanner; null while `error` is null. */
  const errorKind = ref<FailureKind | null>(null);

  // Retries and repeated mounts can overlap; only the newest request may write state.
  let requestId = 0;

  async function fetchDashboard() {
    const id = ++requestId;
    loading.value = true;
    error.value = null;
    errorKind.value = null;
    try {
      const data = await apiRequestJson<DashboardResponse>('/api/dashboard');
      if (id !== requestId) return;
      if (!data.dashboard) {
        error.value = DASHBOARD_UNREADABLE_MESSAGE;
        errorKind.value = 'unknown';
        return;
      }
      dashboard.value = data.dashboard;
    } catch (err: unknown) {
      if (id !== requestId) return;
      const mapped = toUserMessage(err, 'memuat dasbor', 'GET');
      error.value = mapped.message;
      errorKind.value = mapped.kind;
    } finally {
      if (id === requestId) loading.value = false;
    }
  }

  return { dashboard, loading, error, errorKind, fetchDashboard };
});
