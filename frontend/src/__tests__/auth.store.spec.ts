import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '../stores/auth'

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('setAuth stores the user/token and marks the store initialized', () => {
    const store = useAuthStore()
    store.setAuth({ id: '1', email: 'user@example.com', role: 'user' }, 'access-token')

    expect(store.user).toEqual({ id: '1', email: 'user@example.com', role: 'user' })
    expect(store.accessToken).toBe('access-token')
    expect(store.isAuthenticated).toBe(true)
    expect(store.isInitialized).toBe(true)
  })

  it('clearAuth resets user/token but keeps the store initialized', () => {
    const store = useAuthStore()
    store.setAuth({ id: '1', email: 'user@example.com', role: 'user' }, 'access-token')
    store.clearAuth()

    expect(store.user).toBeNull()
    expect(store.accessToken).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    expect(store.isInitialized).toBe(true)
  })

  it('initAuth sends credentials so the httpOnly refresh cookie is attached cross-origin', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
      }
      return {
        ok: true,
        json: async () => ({
          accessToken: 'new-access-token',
          user: { id: '1', email: 'user@example.com', role: 'user' },
        }),
      } as Response
    })
    globalThis.fetch = fetchMock

    const store = useAuthStore()
    const result = await store.initAuth()

    expect(result).toBe(true)
    expect(store.accessToken).toBe('new-access-token')

    const refreshCall = fetchMock.mock.calls.find(([input]) => String(input).includes('/api/auth/refresh'))
    expect(refreshCall).toBeDefined()
    expect(refreshCall?.[1]).toMatchObject({ credentials: 'include' })
  })

  it('initAuth clears auth state when the refresh request fails', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
      }
      return { ok: false, status: 500, json: async () => ({}) } as Response
    })

    const store = useAuthStore()
    const result = await store.initAuth()

    expect(result).toBe(false)
    expect(store.isAuthenticated).toBe(false)
    expect(store.isInitialized).toBe(true)
  })

  it('de-dupes concurrent initAuth calls into a single refresh request', async () => {
    let refreshCalls = 0
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
      }
      refreshCalls++
      return {
        ok: true,
        json: async () => ({
          accessToken: 'new-access-token',
          user: { id: '1', email: 'user@example.com', role: 'user' },
        }),
      } as Response
    })
    globalThis.fetch = fetchMock

    const store = useAuthStore()
    const [a, b] = await Promise.all([store.initAuth(), store.initAuth()])

    expect(a).toBe(true)
    expect(b).toBe(true)
    expect(refreshCalls).toBe(1)
  })

  it('does not retry initAuth after a definitive 401 (refresh denied)', async () => {
    let refreshCalls = 0
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
      }
      refreshCalls++
      return { ok: false, status: 401, json: async () => ({}) } as Response
    })

    const store = useAuthStore()
    await store.initAuth()
    await store.initAuth()

    expect(refreshCalls).toBe(1)
  })

  it('does retry initAuth after a transient 500 (not latched)', async () => {
    let refreshCalls = 0
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
      }
      refreshCalls++
      return { ok: false, status: 500, json: async () => ({}) } as Response
    })

    const store = useAuthStore()
    await store.initAuth()
    await store.initAuth()

    expect(refreshCalls).toBe(2)
  })

  it('clearAuth resets the refresh-denied latch so initAuth can retry again', async () => {
    let refreshCalls = 0
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
      }
      refreshCalls++
      return { ok: false, status: 403, json: async () => ({}) } as Response
    })

    const store = useAuthStore()
    await store.initAuth()
    store.clearAuth()
    await store.initAuth()

    expect(refreshCalls).toBe(2)
  })

  it('initAuth failure preserves setupToken and mustChangePassword when user is in password setup flow', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
      }
      return { ok: false, status: 401, json: async () => ({}) } as Response
    })

    const store = useAuthStore()
    store.setSetupAuth('valid-setup-token')
    expect(store.mustChangePassword).toBe(true)
    expect(store.setupToken).toBe('valid-setup-token')

    const result = await store.initAuth()

    expect(result).toBe(false)
    expect(store.mustChangePassword).toBe(true)
    expect(store.setupToken).toBe('valid-setup-token')
  })

  it('setSetupAuth persists setupToken to sessionStorage and initializes store on reload', () => {
    sessionStorage.clear()
    const store = useAuthStore()
    store.setSetupAuth('persisted-setup-token')

    expect(sessionStorage.getItem('sidata_setup_token')).toBe('persisted-setup-token')
    expect(store.setupToken).toBe('persisted-setup-token')
    expect(store.mustChangePassword).toBe(true)

    // Simulate page reload by creating a new store instance
    setActivePinia(createPinia())
    const reloadedStore = useAuthStore()
    expect(reloadedStore.setupToken).toBe('persisted-setup-token')
    expect(reloadedStore.mustChangePassword).toBe(true)
  })

  it('setAuth clears setupToken from store and sessionStorage', () => {
    sessionStorage.clear()
    const store = useAuthStore()
    store.setSetupAuth('persisted-setup-token')
    expect(sessionStorage.getItem('sidata_setup_token')).toBe('persisted-setup-token')

    store.setAuth({ id: '1', email: 'user@example.com', role: 'user' }, 'access-token')
    expect(store.setupToken).toBeNull()
    expect(store.mustChangePassword).toBe(false)
    expect(sessionStorage.getItem('sidata_setup_token')).toBeNull()
  })

  it('clearAuth clears setupToken from store and sessionStorage when keepSetup is false', () => {
    sessionStorage.clear()
    const store = useAuthStore()
    store.setSetupAuth('persisted-setup-token')
    expect(sessionStorage.getItem('sidata_setup_token')).toBe('persisted-setup-token')

    store.clearAuth(false)
    expect(store.setupToken).toBeNull()
    expect(store.mustChangePassword).toBe(false)
    expect(sessionStorage.getItem('sidata_setup_token')).toBeNull()
  })
})
