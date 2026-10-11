import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '../stores/auth'

describe('auth store', () => {
  beforeEach(() => {
    sessionStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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
    vi.stubGlobal('fetch', fetchMock)

    const store = useAuthStore()
    const result = await store.initAuth()

    expect(result).toBe(true)
    expect(store.accessToken).toBe('new-access-token')

    const refreshCall = fetchMock.mock.calls.find(([input]) => String(input).includes('/api/auth/refresh'))
    expect(refreshCall).toBeDefined()
    expect(refreshCall?.[1]).toMatchObject({ credentials: 'include' })
  })

  it('initAuth clears auth state when the refresh request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('csrf-token')) {
          return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
        }
        return { ok: false, status: 500, json: async () => ({}) } as Response
      }),
    )

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
    vi.stubGlobal('fetch', fetchMock)

    const store = useAuthStore()
    const [a, b] = await Promise.all([store.initAuth(), store.initAuth()])

    expect(a).toBe(true)
    expect(b).toBe(true)
    expect(refreshCalls).toBe(1)
  })

  it('does not retry initAuth after a definitive 401 (refresh denied)', async () => {
    let refreshCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('csrf-token')) {
          return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
        }
        refreshCalls++
        return { ok: false, status: 401, json: async () => ({}) } as Response
      }),
    )

    const store = useAuthStore()
    await store.initAuth()
    await store.initAuth()

    expect(refreshCalls).toBe(1)
  })

  it('does retry initAuth after a transient 500 (not latched)', async () => {
    let refreshCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('csrf-token')) {
          return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
        }
        refreshCalls++
        return { ok: false, status: 500, json: async () => ({}) } as Response
      }),
    )

    const store = useAuthStore()
    await store.initAuth()
    await store.initAuth()

    expect(refreshCalls).toBe(2)
  })

  it('clearAuth resets the refresh-denied latch so initAuth can retry again', async () => {
    let refreshCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('csrf-token')) {
          return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
        }
        refreshCalls++
        return { ok: false, status: 403, json: async () => ({}) } as Response
      }),
    )

    const store = useAuthStore()
    await store.initAuth()
    store.clearAuth()
    await store.initAuth()

    expect(refreshCalls).toBe(2)
  })

  it('initAuth failure preserves setupToken and mustChangePassword when user is in password setup flow', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('csrf-token')) {
          return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
        }
        return { ok: false, status: 401, json: async () => ({}) } as Response
      }),
    )

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

  it('starts unauthenticated with no admin rights and no setup flow', () => {
    const store = useAuthStore()

    expect(store.user).toBeNull()
    expect(store.accessToken).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    expect(store.isAdmin).toBe(false)
    expect(store.isInitialized).toBe(false)
    expect(store.setupToken).toBeNull()
    expect(store.mustChangePassword).toBe(false)
  })

  it('isAdmin is true for admin role case-insensitively, false otherwise', () => {
    const store = useAuthStore()

    store.setAuth({ id: '1', email: 'a@example.com', role: 'admin' }, 't')
    expect(store.isAdmin).toBe(true)

    store.setAuth({ id: '1', email: 'a@example.com', role: 'ADMIN' }, 't')
    expect(store.isAdmin).toBe(true)

    store.setAuth({ id: '1', email: 'a@example.com', role: 'user' }, 't')
    expect(store.isAdmin).toBe(false)

    store.clearAuth()
    expect(store.isAdmin).toBe(false)
  })

  it('clearAuth keeps setupToken when keepSetup is true', () => {
    const store = useAuthStore()
    store.setSetupAuth('keep-me')

    store.clearAuth(true)

    expect(store.user).toBeNull()
    expect(store.accessToken).toBeNull()
    expect(store.setupToken).toBe('keep-me')
    expect(store.mustChangePassword).toBe(true)
    expect(sessionStorage.getItem('sidata_setup_token')).toBe('keep-me')
  })

  it('initAuth short-circuits when already authenticated without fetching', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    const store = useAuthStore()
    store.setAuth({ id: '1', email: 'user@example.com', role: 'user' }, 'cached-token')

    const result = await store.initAuth()

    expect(result).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(store.accessToken).toBe('cached-token')
  })

  it('does not retry initAuth after a definitive 403 (refresh denied)', async () => {
    let refreshCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('csrf-token')) {
          return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
        }
        refreshCalls++
        return { ok: false, status: 403, json: async () => ({}) } as Response
      }),
    )

    const store = useAuthStore()
    const first = await store.initAuth()
    const second = await store.initAuth()

    expect(first).toBe(false)
    expect(second).toBe(false)
    expect(refreshCalls).toBe(1)
  })

  it('retries initAuth after a network error (not latched as denied)', async () => {
    let refreshCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('csrf-token')) {
          return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
        }
        refreshCalls++
        throw new Error('network down')
      }),
    )

    const store = useAuthStore()
    const first = await store.initAuth()
    const second = await store.initAuth()

    expect(first).toBe(false)
    expect(second).toBe(false)
    expect(refreshCalls).toBe(2)
    expect(store.isInitialized).toBe(true)
    expect(store.isAuthenticated).toBe(false)
  })

  it('initAuth returns false and clears auth when refresh succeeds without accessToken', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('csrf-token')) {
          return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
        }
        return { ok: true, json: async () => ({}) } as Response
      }),
    )

    const store = useAuthStore()
    const result = await store.initAuth()

    expect(result).toBe(false)
    expect(store.isAuthenticated).toBe(false)
    expect(store.isInitialized).toBe(true)
  })

  it('initAuth falls back to an empty user object when response has no user', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('csrf-token')) {
          return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
        }
        return {
          ok: true,
          json: async () => ({ accessToken: 'token-without-user' }),
        } as Response
      }),
    )

    const store = useAuthStore()
    const result = await store.initAuth()

    expect(result).toBe(true)
    expect(store.accessToken).toBe('token-without-user')
    expect(store.user).toEqual({ id: '', email: '', role: '' })
  })

  describe('in-flight initAuth race condition & logout', () => {
    it('does not re-authenticate user if clearAuth occurs while initAuth is in-flight', async () => {
      let resolveRefresh: (res: Response) => void
      const refreshPromise = new Promise<Response>((resolve) => {
        resolveRefresh = resolve
      })

      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>().mockImplementation(async (input) => {
          const url = String(input)
          if (url.includes('csrf-token')) {
            return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
          }
          return refreshPromise
        }),
      )

      const store = useAuthStore()
      // Start initAuth
      const initAuthPromise = store.initAuth()

      // User explicitly calls clearAuth before network resolves
      store.clearAuth()
      expect(store.isAuthenticated).toBe(false)

      // Network now resolves successfully
      resolveRefresh!({
        ok: true,
        json: async () => ({
          accessToken: 'stale-token',
          user: { id: '99', email: 'stale@example.com', role: 'user' },
        }),
      } as Response)

      const result = await initAuthPromise
      expect(result).toBe(false)
      expect(store.isAuthenticated).toBe(false)
      expect(store.accessToken).toBeNull()
      expect(store.user).toBeNull()
    })

    it('logout revokes session, clears state, and suppresses immediate auto-refresh', async () => {
      let logoutCalled = false
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>().mockImplementation(async (input) => {
          const url = String(input)
          if (url.includes('csrf-token')) {
            return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
          }
          if (url.includes('/api/auth/logout')) {
            logoutCalled = true
            return { ok: true, json: async () => ({}) } as Response
          }
          return { ok: true, json: async () => ({}) } as Response
        }),
      )

      const store = useAuthStore()
      store.setAuth({ id: '1', email: 'user@example.com', role: 'user' }, 'valid-token')

      const res = await store.logout()
      expect(res.success).toBe(true)
      expect(logoutCalled).toBe(true)
      expect(store.isAuthenticated).toBe(false)
      expect(store.refreshDenied).toBe(true)

      // Subsequent initAuth is suppressed without sending network request
      const initRes = await store.initAuth()
      expect(initRes).toBe(false)
    })

    it('logout handles CSRF failure gracefully without sending logout request', async () => {
      let logoutCalled = false
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>().mockImplementation(async (input) => {
          const url = String(input)
          if (url.includes('csrf-token')) {
            return { ok: false, status: 403, json: async () => ({}) } as Response
          }
          if (url.includes('/api/auth/logout')) {
            logoutCalled = true
            return { ok: true, json: async () => ({}) } as Response
          }
          return { ok: true, json: async () => ({}) } as Response
        }),
      )

      const store = useAuthStore()
      store.setAuth({ id: '1', email: 'user@example.com', role: 'user' }, 'valid-token')

      const res = await store.logout()
      expect(res.success).toBe(false)
      expect(logoutCalled).toBe(false)
      expect(res.error).toContain('Gagal memvalidasi token keamanan')
      expect(store.isAuthenticated).toBe(true)
    })

    it('logout handles server 500 rejection gracefully', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>().mockImplementation(async (input) => {
          const url = String(input)
          if (url.includes('csrf-token')) {
            return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
          }
          if (url.includes('/api/auth/logout')) {
            return { ok: false, status: 500, json: async () => ({}) } as Response
          }
          return { ok: true, json: async () => ({}) } as Response
        }),
      )

      const store = useAuthStore()
      store.setAuth({ id: '1', email: 'user@example.com', role: 'user' }, 'valid-token')

      const res = await store.logout()
      expect(res.success).toBe(false)
      expect(res.error).toContain('Gagal keluar dari sesi')
      expect(store.isAuthenticated).toBe(true)
    })
  })
})
