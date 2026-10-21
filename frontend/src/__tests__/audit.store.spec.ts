import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuditStore } from '../stores/audit.store'
import { useAuthStore } from '../stores/auth'

const AUDIT_LOG = {
  id: 'log-1',
  action: 'user.role_changed',
  outcome: 'success',
  severity: 'critical',
  acknowledgedAt: null,
  acknowledgedById: null,
  actorId: 'admin-1',
  actorEmail: 'admin@example.com',
  actorRole: 'admin',
  targetType: 'user',
  targetId: 'u-2',
  targetLabel: 'user2@example.com',
  metadata: { before: 'user', after: 'admin' },
  ipAddress: '127.0.0.1',
  userAgent: 'Mozilla/5.0',
  createdAt: '2026-10-19T00:00:00.000Z',
}

function mockFetchWith(handlers: {
  list?: () => Response | Promise<Response>
  summary?: () => Response | Promise<Response>
  acknowledge?: (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>
}) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = String(input)
    if (url.includes('csrf-token')) {
      return { ok: true, json: async () => ({ csrfToken: 'mock-csrf' }) } as Response
    }
    if (url.includes('/acknowledge')) {
      return handlers.acknowledge
        ? handlers.acknowledge(input, init)
        : ({
            ok: true,
            json: async () => ({
              message: 'Audit log berhasil di-acknowledge.',
              log: { ...AUDIT_LOG, acknowledgedAt: '2026-10-19T01:00:00.000Z', acknowledgedById: 'admin-1' },
            }),
          } as Response)
    }
    if (url.includes('/summary')) {
      return (
        handlers.summary?.() ?? {
          ok: true,
          json: async () => ({
            since: '2026-10-12T00:00:00.000Z',
            counts: { info: 3, warning: 2, critical: 1 },
            openCritical: 1,
          }),
        }
      ) as Response
    }
    return (
      handlers.list?.() ?? {
        ok: true,
        json: async () => ({
          logs: [AUDIT_LOG],
          total: 1,
          page: Number(new URL(url, 'http://localhost').searchParams.get('page')) || 1,
          pageSize: 50,
        }),
      }
    ) as Response
  })
  globalThis.fetch = fetchMock
  return fetchMock
}

describe('audit store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('fetchLogs calls GET /api/audit-logs and populates logs, total and pagination', async () => {
    const fetchMock = mockFetchWith({})

    const store = useAuditStore()
    await store.fetchLogs()

    const listCall = fetchMock.mock.calls.find(([input]) =>
      String(input).startsWith('/api/audit-logs?'),
    )
    expect(listCall).toBeDefined()
    expect(String(listCall?.[0])).toContain('page=1')
    expect(String(listCall?.[0])).toContain('pageSize=50')
    expect(store.logs).toHaveLength(1)
    expect(store.logs[0]?.action).toBe('user.role_changed')
    expect(store.total).toBe(1)
    expect(store.page).toBe(1)
  })

  it('buildListQuery reflects active filters and omits empty ones', async () => {
    const fetchMock = mockFetchWith({})

    const store = useAuditStore()
    await store.applyFilters({
      severity: 'critical',
      acknowledged: false,
      action: ' user.role_changed ',
      to: '2026-10-19',
    })

    const listCall = fetchMock.mock.calls.find(([input]) =>
      String(input).startsWith('/api/audit-logs?'),
    )
    const query = new URLSearchParams(String(listCall?.[0]).split('?')[1])
    expect(query.get('severity')).toBe('critical')
    expect(query.get('acknowledged')).toBe('false')
    expect(query.get('action')).toBe('user.role_changed')
    // 'to' is the local end of the selected day, sent as an explicit UTC instant
    expect(query.get('to')).toBe(new Date(2026, 9, 19, 23, 59, 59, 999).toISOString())
    // Empty filters stay out of the query
    expect(query.get('outcome')).toBeNull()
    expect(query.get('from')).toBeNull()
  })

  it('sends date bounds as UTC instants of the local day, not bare calendar dates', async () => {
    const fetchMock = mockFetchWith({})

    const store = useAuditStore()
    await store.applyFilters({ from: '2026-10-19', to: '2026-10-19' })

    const listCall = fetchMock.mock.calls.find(([input]) =>
      String(input).startsWith('/api/audit-logs?'),
    )
    const query = new URLSearchParams(String(listCall?.[0]).split('?')[1])
    const from = query.get('from')
    const to = query.get('to')

    // Both bounds must be full UTC instants (explicit Z), never the raw 'YYYY-MM-DD'
    // the backend would read as UTC midnight / server-local end-of-day.
    expect(from).toBe(new Date(2026, 9, 19, 0, 0, 0, 0).toISOString())
    expect(to).toBe(new Date(2026, 9, 19, 23, 59, 59, 999).toISOString())
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    // The window spans the full local day and from < to
    expect(new Date(to!).getTime() - new Date(from!).getTime()).toBe(24 * 60 * 60 * 1000 - 1)
  })

  it('applyFilters resets to page 1 before refetching', async () => {
    mockFetchWith({})

    const store = useAuditStore()
    await store.goToPage(3)
    expect(store.page).toBe(3)

    await store.applyFilters({ severity: 'warning' })
    expect(store.page).toBe(1)
    expect(store.filters.severity).toBe('warning')
  })

  it('fetchSummary populates severity counts and openCritical', async () => {
    mockFetchWith({})

    const store = useAuditStore()
    await store.fetchSummary()

    expect(store.summary?.counts).toEqual({ info: 3, warning: 2, critical: 1 })
    expect(store.summary?.openCritical).toBe(1)
  })

  it('fetchSummary passes the since window to the API when provided', async () => {
    const fetchMock = mockFetchWith({})

    const store = useAuditStore()
    await store.fetchSummary('2026-09-19T00:00:00.000Z')

    const summaryCall = fetchMock.mock.calls.find(([input]) => String(input).includes('/summary'))
    expect(String(summaryCall?.[0])).toContain('since=2026-09-19T00%3A00%3A00.000Z')
  })

  it('fetchAdminActionCount counts admin-actor logs in the window', async () => {
    const fetchMock = mockFetchWith({
      list: () =>
        ({
          ok: true,
          json: async () => ({
            logs: [
              { ...AUDIT_LOG, actorRole: 'admin' },
              { ...AUDIT_LOG, id: 'log-2', actorRole: 'editor' },
              { ...AUDIT_LOG, id: 'log-3', actorRole: 'Admin' },
            ],
            total: 3,
            page: 1,
            pageSize: 200,
          }),
        }) as Response,
    })

    const store = useAuditStore()
    await store.fetchAdminActionCount(24)

    // Case-insensitive admin role match; non-admin actors excluded
    expect(store.adminActionCount).toBe(2)

    const listCall = fetchMock.mock.calls.find(([input]) => String(input).startsWith('/api/audit-logs?'))
    expect(String(listCall?.[0])).toContain('pageSize=200')
    expect(String(listCall?.[0])).toContain('from=')
  })

  it('acknowledgeLog PATCHes with CSRF and updates the row in place without refetching', async () => {
    let listCalled = false
    let patchBody: unknown = null
    mockFetchWith({
      list: () => {
        listCalled = true
        return { ok: true, json: async () => ({ logs: [], total: 0, page: 1, pageSize: 50 }) } as Response
      },
      acknowledge: (_input, init) => {
        patchBody = init?.body || null
        return {
          ok: true,
          json: async () => ({
            message: 'Audit log berhasil di-acknowledge.',
            log: {
              ...AUDIT_LOG,
              acknowledgedAt: '2026-10-19T01:00:00.000Z',
              acknowledgedById: 'admin-1',
            },
          }),
        } as Response
      },
    })

    const authStore = useAuthStore()
    authStore.accessToken = 'mock-access-token'

    const store = useAuditStore()
    store.logs = [{ ...AUDIT_LOG }]
    store.summary = {
      since: '2026-10-12T00:00:00.000Z',
      counts: { info: 3, warning: 2, critical: 1 },
      openCritical: 1,
    }

    const res = await store.acknowledgeLog('log-1')

    expect(patchBody).toBeNull() // PATCH tanpa body
    expect(listCalled).toBe(false)
    expect(res).toHaveProperty('message')
    expect(store.logs[0]?.acknowledgedAt).toBe('2026-10-19T01:00:00.000Z')
    expect(store.logs[0]?.acknowledgedById).toBe('admin-1')
    expect(store.summary?.openCritical).toBe(0)
  })

  it('acknowledgeLog refetches the page when the open-only filter is active, keeping list and filter consistent', async () => {
    let listCalls = 0
    mockFetchWith({
      list: () => {
        listCalls += 1
        // Simulate the server honoring acknowledged=false: the acknowledged row is gone.
        return {
          ok: true,
          json: async () => ({ logs: [], total: 0, page: 1, pageSize: 50 }),
        } as Response
      },
    })

    const authStore = useAuthStore()
    authStore.accessToken = 'mock-access-token'

    const store = useAuditStore()
    await store.applyFilters({ acknowledged: false }) // "Terbuka" filter; 1 list call
    store.logs = [{ ...AUDIT_LOG }]
    store.summary = {
      since: '2026-10-12T00:00:00.000Z',
      counts: { info: 3, warning: 2, critical: 1 },
      openCritical: 1,
    }

    await store.acknowledgeLog('log-1')

    // One extra list call after the PATCH — the acknowledged row must leave an
    // "open only" list rather than linger contradicting the active filter.
    expect(listCalls).toBe(2)
    expect(store.logs).toHaveLength(0)
    expect(store.summary?.openCritical).toBe(0)
  })

  it('acknowledgeLog throws on backend error and sets the error ref', async () => {
    mockFetchWith({
      acknowledge: () =>
        ({
          ok: false,
          json: async () => ({ error: 'Audit log ini sudah di-acknowledge sebelumnya.' }),
        }) as Response,
    })

    const store = useAuditStore()
    store.logs = [{ ...AUDIT_LOG }]

    await expect(store.acknowledgeLog('log-1')).rejects.toThrow(
      'Audit log ini sudah di-acknowledge sebelumnya.',
    )
    expect(store.error).toBe('Audit log ini sudah di-acknowledge sebelumnya.')
    // Row left untouched on failure
    expect(store.logs[0]?.acknowledgedAt).toBeNull()
  })

  it('fetchLogs sets a friendly error message when the API fails', async () => {
    mockFetchWith({
      list: () =>
        ({ ok: false, json: async () => ({ error: 'Akses ditolak.' }) }) as Response,
    })

    const store = useAuditStore()
    await store.fetchLogs()

    expect(store.logs).toHaveLength(0)
    expect(store.error).toBe('Akses ditolak.')
  })
})
