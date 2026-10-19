import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import AuditLogView from '../views/AuditLogView.vue'
import { useAuthStore } from '../stores/auth'

const CRITICAL_OPEN_LOG = {
  id: 'log-critical-open',
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

const INFO_LOG = {
  ...CRITICAL_OPEN_LOG,
  id: 'log-info',
  action: 'auth.login',
  severity: 'info',
}

const ACKNOWLEDGED_LOG = {
  ...CRITICAL_OPEN_LOG,
  id: 'log-acknowledged',
  acknowledgedAt: '2026-10-19T01:00:00.000Z',
}

function mockBackend(logs: unknown[]) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = String(input)
    if (url.includes('csrf-token')) {
      return { ok: true, json: async () => ({ csrfToken: 'mock-csrf' }) } as Response
    }
    if (url.includes('/acknowledge')) {
      return {
        ok: true,
        json: async () => ({
          message: 'Audit log berhasil di-acknowledge.',
          log: { ...CRITICAL_OPEN_LOG, acknowledgedAt: '2026-10-19T02:00:00.000Z' },
        }),
      } as Response
    }    if (url.includes('/summary')) {
      return {
        ok: true,
        json: async () => ({
          since: '2026-10-12T00:00:00.000Z',
          counts: { info: 1, warning: 0, critical: 2 },
          openCritical: 1,
        }),
      } as Response
    }
    return {
      ok: true,
      json: async () => ({ logs, total: logs.length, page: 1, pageSize: 50 }),
    } as Response
  })
  globalThis.fetch = fetchMock
  return fetchMock
}

async function mountView() {
  const pinia = createPinia()
  setActivePinia(pinia)

  const authStore = useAuthStore()
  authStore.setAuth({ id: 'admin-1', email: 'admin@example.com', role: 'admin' }, 'mock-token')

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/audit-logs', component: AuditLogView }],
  })
  await router.push('/audit-logs')
  await router.isReady()

  const wrapper = mount(AuditLogView, { global: { plugins: [pinia, router] } })
  // let onMounted fetches resolve
  await vi.waitFor(() => expect(wrapper.find('tbody').text()).toContain('user.role_changed'))
  return wrapper
}

describe('AuditLogView', () => {
  it('renders a semantic table with caption and scoped column headers', async () => {
    mockBackend([CRITICAL_OPEN_LOG, INFO_LOG])
    const wrapper = await mountView()

    const table = wrapper.find('table')
    expect(table.exists()).toBe(true)
    expect(table.find('caption').exists()).toBe(true)

    const headers = table.findAll('th')
    expect(headers.length).toBeGreaterThan(0)
    for (const th of headers) {
      expect(th.attributes('scope')).toBe('col')
    }
  })

  it('renders the acknowledge button only for open critical rows', async () => {
    mockBackend([CRITICAL_OPEN_LOG, INFO_LOG, ACKNOWLEDGED_LOG])
    const wrapper = await mountView()

    const acknowledgeButtons = wrapper
      .findAll('tbody tr')
      .filter((tr) => tr.text().includes('Acknowledge'))
    expect(acknowledgeButtons).toHaveLength(1)
    expect(acknowledgeButtons[0]?.text()).toContain('user.role_changed')
  })

  it('acknowledges an open critical row via PATCH and updates the row in place', async () => {
    const fetchMock = mockBackend([CRITICAL_OPEN_LOG])
    const wrapper = await mountView()

    await wrapper
      .find('tbody tr button')
      .trigger('click')

    await vi.waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([input, init]) =>
        String(input).includes('/log-critical-open/acknowledge') && init?.method === 'PATCH',
      )
      expect(patchCall).toBeDefined()
    })

    // Row flips to acknowledged without refetching the list
    await vi.waitFor(() => expect(wrapper.find('tbody').text()).toContain('Diakui'))
    const listCalls = fetchMock.mock.calls.filter(
      ([input]) => String(input).startsWith('/api/audit-logs?'),
    )
    expect(listCalls).toHaveLength(1)
  })

  it('shows the summary counts and open critical tally', async () => {
    mockBackend([CRITICAL_OPEN_LOG])
    const wrapper = await mountView()

    const summary = wrapper.find('[role="status"]')
    expect(summary.exists()).toBe(true)
    expect(summary.text()).toContain('Critical: 2')
    expect(summary.text()).toContain('Critical terbuka: 1')
  })

  it('filters the list when the filter form is submitted', async () => {
    const fetchMock = mockBackend([CRITICAL_OPEN_LOG])
    const wrapper = await mountView()

    await wrapper.find('#filter-severity').setValue('critical')
    await wrapper.find('form').trigger('submit.prevent')

    await vi.waitFor(() => {
      const filteredCall = fetchMock.mock.calls.find(([input]) =>
        String(input).includes('severity=critical'),
      )
      expect(filteredCall).toBeDefined()
    })
  })
})
