import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './auth'
import { getCsrfToken } from '../utils/csrf'

export type AuditSeverity = 'info' | 'warning' | 'critical'
export type AuditOutcome = 'success' | 'failure'

export interface AuditLogItem {
  id: string
  action: string
  outcome: string
  severity: string
  acknowledgedAt: string | null
  acknowledgedById: string | null
  actorId: string | null
  actorEmail: string | null
  actorRole: string | null
  targetType: string | null
  targetId: string | null
  targetLabel: string | null
  metadata: Record<string, unknown> | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
}

export interface AuditSummary {
  since: string
  counts: Record<AuditSeverity, number>
  openCritical: number
}

export interface AuditLogFilters {
  /** '' means "no severity filter" — the API treats an absent param as no filter. */
  severity: AuditSeverity | ''
  /** '' means "no outcome filter". */
  outcome: AuditOutcome | ''
  /** null means "no acknowledgment filter", true = acknowledged only, false = open only. */
  acknowledged: boolean | null
  /** Free-text action match (exact action string sent to the API, e.g. 'auth.login_failed'). */
  action: string
  /** 'YYYY-MM-DD' from a date input; '' = no lower bound. */
  from: string
  /** 'YYYY-MM-DD' from a date input; '' = no upper bound. */
  to: string
}

export const DEFAULT_PAGE_SIZE = 50

const EMPTY_FILTERS: AuditLogFilters = {
  severity: '',
  outcome: '',
  acknowledged: null,
  action: '',
  from: '',
  to: '',
}

export const useAuditStore = defineStore('audit', () => {
  const authStore = useAuthStore()
  const logs = ref<AuditLogItem[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(DEFAULT_PAGE_SIZE)
  const summary = ref<AuditSummary | null>(null)
  const adminActionCount = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const summaryError = ref<string | null>(null)
  const filters = ref<AuditLogFilters>({ ...EMPTY_FILTERS })

  // Monotonic id for list fetches. Page controls and filters stay interactive while a
  // fetch is in flight, so two fetchLogs calls can overlap; whichever response arrives
  // last must not win by arrival order. Each call takes the next id and only the call
  // holding the latest id may write state (or clear loading/error) on completion.
  let listRequestId = 0

  async function getAuthHeaders(): Promise<Record<string, string>> {
    const csrfToken = await getCsrfToken()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
    }
    if (authStore.accessToken) {
      headers['Authorization'] = `Bearer ${authStore.accessToken}`
    }
    return headers
  }

  function buildListQuery(): string {
    const params = new URLSearchParams()
    const f = filters.value
    if (f.severity) params.set('severity', f.severity)
    if (f.outcome) params.set('outcome', f.outcome)
    if (f.acknowledged !== null) params.set('acknowledged', String(f.acknowledged))
    if (f.action.trim()) params.set('action', f.action.trim())
    // The date inputs carry a calendar date in the *user's* timezone. Turn each into
    // the local start/end of that day and send it as an explicit UTC instant: a bare
    // 'YYYY-MM-DD' would be read as UTC midnight by the backend, while an unoffset
    // '...T23:59:59.999' would be read in the *server's* timezone — mixing the two
    // shifts the window so logs near the day boundary silently drop out of the filter.
    if (f.from) params.set('from', new Date(`${f.from}T00:00:00`).toISOString())
    if (f.to) params.set('to', new Date(`${f.to}T23:59:59.999`).toISOString())
    params.set('page', String(page.value))
    params.set('pageSize', String(pageSize.value))
    return params.toString()
  }

  async function fetchLogs() {
    const requestId = ++listRequestId
    loading.value = true
    error.value = null
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/audit-logs?${buildListQuery()}`, {
        headers,
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengambil daftar audit log.')
      }
      // A newer fetch superseded this one while it was in flight — discard, or a slow
      // stale response would overwrite fresher logs/total/page.
      if (requestId !== listRequestId) return
      logs.value = data.logs || []
      total.value = data.total || 0
      page.value = data.page || page.value
      pageSize.value = data.pageSize || pageSize.value
    } catch (err: unknown) {
      // Stale failures stay silent too: the newer request owns the error state.
      if (requestId !== listRequestId) return
      error.value = err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat audit log.'
    } finally {
      if (requestId === listRequestId) loading.value = false
    }
  }

  async function fetchSummary(sinceIso?: string) {
    summaryError.value = null
    try {
      const headers = await getAuthHeaders()
      const url = sinceIso
        ? `/api/audit-logs/summary?since=${encodeURIComponent(sinceIso)}`
        : '/api/audit-logs/summary'
      const res = await fetch(url, {
        headers,
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengambil ringkasan audit log.')
      }
      summary.value = data
    } catch (err: unknown) {
      // Own error ref, not `error`: fetchLogs and fetchSummary run concurrently at mount
      // and one failure must not mask or clear the other's.
      summaryError.value =
        err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat ringkasan audit log.'
    }
  }

  /**
   * Counts admin-performed actions within the last `hours` (default 24) for the dashboard
   * "Aksi Admin" stat. The audit API has no `actorRole` filter, so this fetches the most
   * recent window of logs (up to the API's MAX_PAGE_SIZE of 200) and counts admin actors
   * client-side. Exact for the expected audit volume of a village-scale system; if a 24h
   * window ever exceeds 200 events this becomes a lower bound — a server-side role filter
   * would be the fix, and is out of scope here.
   */
  async function fetchAdminActionCount(hours = 24) {
    try {
      const headers = await getAuthHeaders()
      const from = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
      const res = await fetch(`/api/audit-logs?from=${encodeURIComponent(from)}&pageSize=200`, {
        headers,
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengambil hitungan aksi admin.')
      }
      const logs: AuditLogItem[] = data.logs || []
      adminActionCount.value = logs.filter((l) => l.actorRole?.toLowerCase() === 'admin').length
    } catch (err: unknown) {
      // Non-fatal for the page — the stat simply stays at its last known value.
      console.error('Error fetching admin action count:', err)
    }
  }

  /**
   * Applies new filters and resets to the first page — the backend paginates, so any
   * filter change must refetch rather than narrowing the already-loaded page client-side.
   */
  async function applyFilters(patch: Partial<AuditLogFilters>) {
    filters.value = { ...filters.value, ...patch }
    page.value = 1
    await fetchLogs()
  }

  function resetFilters() {
    filters.value = { ...EMPTY_FILTERS }
  }

  async function goToPage(next: number) {
    page.value = next
    await fetchLogs()
  }

  async function acknowledgeLog(id: string) {
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/audit-logs/${id}/acknowledge`, {
        method: 'PATCH',
        headers,
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal meng-acknowledge audit log.')
      }
      if (summary.value && summary.value.openCritical > 0) {
        summary.value.openCritical -= 1
      }
      // With the "open only" filter active, the row just acknowledged no longer belongs
      // in the result set — refetch the current page so the list and its total stop
      // contradicting the filter. Without that filter the row stays visible (its status
      // simply flips), so the in-place update below avoids a pointless refetch.
      if (filters.value.acknowledged === false) {
        await fetchLogs()
        return data
      }
      const target = logs.value.find((l) => l.id === id)
      if (target) {
        target.acknowledgedAt = data.log?.acknowledgedAt || new Date().toISOString()
        target.acknowledgedById = data.log?.acknowledgedById || authStore.user?.id || null
      }
      return data
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal meng-acknowledge audit log.'
      error.value = msg
      throw new Error(msg)
    }
  }

  return {
    logs,
    total,
    page,
    pageSize,
    summary,
    adminActionCount,
    loading,
    error,
    summaryError,
    filters,
    fetchLogs,
    fetchSummary,
    fetchAdminActionCount,
    applyFilters,
    resetFilters,
    goToPage,
    acknowledgeLog,
  }
})
