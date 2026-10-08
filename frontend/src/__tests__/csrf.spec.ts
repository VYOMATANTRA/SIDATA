import { describe, it, expect, vi } from 'vitest'
import { getCsrfToken } from '../utils/csrf'

describe('getCsrfToken', () => {
  it('requests the token with credentials so the CSRF cookie is attached cross-origin', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ csrfToken: 'test-csrf-token' }),
    } as Response)
    globalThis.fetch = fetchMock

    const token = await getCsrfToken()

    expect(token).toBe('test-csrf-token')
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/csrf-token', { credentials: 'include' })
  })

  it('returns an empty string when the request fails', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response)

    expect(await getCsrfToken()).toBe('')
  })

  it('returns an empty string when fetch throws', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockRejectedValue(new Error('network error'))

    expect(await getCsrfToken()).toBe('')
  })
})
