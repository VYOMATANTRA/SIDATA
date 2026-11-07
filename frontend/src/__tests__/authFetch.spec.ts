import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { authFetch } from '../utils/authFetch'
import { useAuthStore } from '../stores/auth'

describe('authFetch', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('attaches Authorization: Bearer <accessToken> and credentials for verifyToken-protected endpoints', async () => {
    const authStore = useAuthStore()
    authStore.setAuth({ id: '1', email: 'user@example.com', role: 'user' }, 'test-access-token')

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Berhasil mengakses profil', user: { id: '1' } }),
    } as Response)
    globalThis.fetch = fetchMock

    await authFetch('/api/auth/me')

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, options] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/auth/me')
    expect(options?.credentials).toBe('include')
    const headers = options?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer test-access-token')
  })

  it('omits the Authorization header when there is no access token', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({ ok: false } as Response)
    globalThis.fetch = fetchMock

    await authFetch('/api/auth/me')

    const [, options] = fetchMock.mock.calls[0]!
    const headers = options?.headers as Headers
    expect(headers.has('Authorization')).toBe(false)
  })
})
