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
  const loading = ref(false)
  const error = ref<string | null>(null)
  const filters = ref<AuditLogFilters>({ ...EMPTY_FILTERS })

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
    if (f.from) params.set('from', f.from)
    // Extend a date-only upper bound to end-of-day so logs from the selected day
    // itself are not cut off at midnight by the backend's `new Date('YYYY-MM-DD')`.
    if (f.to) params.set('to', `${f.to}T23:59:59.999`)
    params.set('page', String(page.value))
    params.set('pageSize', String(pageSize.value))
    return params.toString()
  }

  async function fetchLogs() {
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
      logs.value = data.logs || []
      total.value = data.total || 0
      page.value = data.page || page.value
      pageSize.value = data.pageSize || pageSize.value
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat audit log.'
    } finally {
      loading.value = false
    }
  }

  async function fetchSummary() {
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/audit-logs/summary', {
        headers,
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengambil ringkasan audit log.')
      }
      summary.value = data
    } catch (err: unknown) {
      error.value =
        err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat ringkasan audit log.'
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
      // Update in place instead of refetching the page (same pattern as users.store).
      const target = logs.value.find((l) => l.id === id)
      if (target) {
        target.acknowledgedAt = data.log?.acknowledgedAt || new Date().toISOString()
        target.acknowledgedById = data.log?.acknowledgedById || authStore.user?.id || null
      }
      if (summary.value && summary.value.openCritical > 0) {
        summary.value.openCritical -= 1
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
    loading,
    error,
    filters,
    fetchLogs,
    fetchSummary,
    applyFilters,
    resetFilters,
    goToPage,
    acknowledgeLog,
  }
})
