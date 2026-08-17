import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUsersStore } from '../stores/users.store'
import { useAuthStore } from '../stores/auth'

describe('users store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('fetchUsers calls GET /api/users and populates users list', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'mock-csrf' }) } as Response
      }
      return {
        ok: true,
        json: async () => ({
          users: [
            {
              id: 'u-1',
              email: 'test@example.com',
              auth_provider: 'local',
              email_verified: true,
              requires_password_change: false,
              deletedAt: null,
              roleId: 'r-1',
              role: { id: 'r-1', name: 'user' },
              createdAt: '2026-08-17T00:00:00.000Z',
            },
          ],
        }),
      } as Response
    })
    globalThis.fetch = fetchMock

    const store = useUsersStore()
    await store.fetchUsers()

    expect(store.users).toHaveLength(1)
    expect(store.users[0]?.email).toBe('test@example.com')
  })

  it('changeUserPassword calls PATCH /api/users/:id/password with new password and refreshes users', async () => {
    let patchCalled = false
    let patchBody: unknown = null

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'mock-csrf' }) } as Response
      }
      if (url.includes('/password') && init?.method === 'PATCH') {
        patchCalled = true
        patchBody = JSON.parse((init?.body as string) || '{}')
        return {
          ok: true,
          json: async () => ({ message: 'Password pengguna berhasil diperbarui.' }),
        } as Response
      }
      if (url.includes('/api/users') && (!init || init.method === 'GET')) {
        return {
          ok: true,
          json: async () => ({ users: [] }),
        } as Response
      }
      return { ok: true, json: async () => ({}) } as Response
    })
    globalThis.fetch = fetchMock

    const authStore = useAuthStore()
    authStore.accessToken = 'mock-access-token'

    const store = useUsersStore()
    expect(typeof store.changeUserPassword).toBe('function')

    const res = await store.changeUserPassword('user-123', 'NewPass123!@#')

    expect(patchCalled).toBe(true)
    expect(patchBody).toEqual({ password: 'NewPass123!@#' })
    expect(res).toEqual({ message: 'Password pengguna berhasil diperbarui.' })
  })

  it('changeUserPassword throws on backend error and sets error ref', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'mock-csrf' }) } as Response
      }
      return {
        ok: false,
        json: async () => ({ error: 'Password terlalu lemah atau umum digunakan.' }),
      } as Response
    })
    globalThis.fetch = fetchMock

    const store = useUsersStore()
    await expect(store.changeUserPassword('user-123', 'password123')).rejects.toThrow(
      'Password terlalu lemah atau umum digunakan.',
    )
    expect(store.error).toBe('Password terlalu lemah atau umum digunakan.')
  })
})
