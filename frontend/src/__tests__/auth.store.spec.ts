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
      return { ok: false, json: async () => ({}) } as Response
    })

    const store = useAuthStore()
    const result = await store.initAuth()

    expect(result).toBe(false)
    expect(store.isAuthenticated).toBe(false)
    expect(store.isInitialized).toBe(true)
  })
})
