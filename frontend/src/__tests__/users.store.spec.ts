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

  it('createUser adds new user to store without triggering fetchUsers', async () => {
    let getCalled = false
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'mock-csrf' }) } as Response
      }
      if (url === '/api/users' && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            message: 'Pengguna berhasil dibuat.',
            user: {
              id: 'u-new',
              email: 'newuser@example.com',
              auth_provider: 'local',
              email_verified: true,
              requires_password_change: true,
              deletedAt: null,
              roleId: 'r-1',
              role: { id: 'r-1', name: 'user' },
              createdAt: '2026-08-20T00:00:00.000Z',
            },
          }),
        } as Response
      }
      if (url === '/api/users' && (!init || init.method === 'GET')) {
        getCalled = true
        return { ok: true, json: async () => ({ users: [] }) } as Response
      }
      return { ok: true, json: async () => ({}) } as Response
    })
    globalThis.fetch = fetchMock

    const store = useUsersStore()
    store.users = [
      {
        id: 'u-old',
        email: 'old@example.com',
        auth_provider: 'local',
        email_verified: true,
        requires_password_change: false,
        deletedAt: null,
        roleId: 'r-1',
        role: { id: 'r-1', name: 'user' },
        createdAt: '2026-08-01T00:00:00.000Z',
      },
    ]

    await store.createUser({ email: 'newuser@example.com', roleId: 'r-1', password: 'Password123!' })

    expect(getCalled).toBe(false)
    expect(store.users).toHaveLength(2)
    expect(store.users[0]?.id).toBe('u-new')
    expect(store.users[0]?.email).toBe('newuser@example.com')
  })

  it('reactivateUser updates deletedAt to null in-place without refetching', async () => {
    let getCalled = false
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'mock-csrf' }) } as Response
      }
      if (url.includes('/reactivate') && init?.method === 'PATCH') {
        return {
          ok: true,
          json: async () => ({
            message: 'Pengguna berhasil diaktifkan kembali.',
            user: { id: 'u-1', deletedAt: null },
          }),
        } as Response
      }
      if (url === '/api/users' && (!init || init.method === 'GET')) {
        getCalled = true
        return { ok: true, json: async () => ({ users: [] }) } as Response
      }
      return { ok: true, json: async () => ({}) } as Response
    })
    globalThis.fetch = fetchMock

    const store = useUsersStore()
    store.users = [
      {
        id: 'u-1',
        email: 'user1@example.com',
        auth_provider: 'local',
        email_verified: true,
        requires_password_change: false,
        deletedAt: '2026-08-10T00:00:00.000Z',
        roleId: 'r-1',
        role: { id: 'r-1', name: 'user' },
        createdAt: '2026-08-01T00:00:00.000Z',
      },
    ]

    await store.reactivateUser('u-1')

    expect(getCalled).toBe(false)
    expect(store.users[0]?.deletedAt).toBeNull()
  })

  it('changeUserPassword updates requires_password_change in-place without refetching', async () => {
    let patchCalled = false
    let getCalled = false
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
      if (url === '/api/users' && (!init || init.method === 'GET')) {
        getCalled = true
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
    store.users = [
      {
        id: 'user-123',
        email: 'user@example.com',
        auth_provider: 'google',
        email_verified: true,
        requires_password_change: false,
        deletedAt: null,
        roleId: 'r-1',
        role: { id: 'r-1', name: 'user' },
        createdAt: '2026-08-01T00:00:00.000Z',
      },
    ]

    const res = await store.changeUserPassword('user-123', 'NewPass123!@#')

    expect(patchCalled).toBe(true)
    expect(getCalled).toBe(false)
    expect(patchBody).toEqual({ password: 'NewPass123!@#' })
    expect(res).toEqual({ message: 'Password pengguna berhasil diperbarui.' })
    expect(store.users[0]?.requires_password_change).toBe(true)
    expect(store.users[0]?.auth_provider).toBe('local')
  })

  it('updateUserRole updates user role in-place without refetching', async () => {
    let getCalled = false
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'mock-csrf' }) } as Response
      }
      if (url.includes('/role') && init?.method === 'PATCH') {
        return {
          ok: true,
          json: async () => ({
            message: 'Role pengguna berhasil diperbarui.',
            user: { id: 'u-1', roleId: 'r-admin', role: { id: 'r-admin', name: 'admin' } },
          }),
        } as Response
      }
      if (url === '/api/users' && (!init || init.method === 'GET')) {
        getCalled = true
        return { ok: true, json: async () => ({ users: [] }) } as Response
      }
      return { ok: true, json: async () => ({}) } as Response
    })
    globalThis.fetch = fetchMock

    const store = useUsersStore()
    store.roles = [
      { id: 'r-user', name: 'user' },
      { id: 'r-admin', name: 'admin' },
    ]
    store.users = [
      {
        id: 'u-1',
        email: 'user1@example.com',
        auth_provider: 'local',
        email_verified: true,
        requires_password_change: false,
        deletedAt: null,
        roleId: 'r-user',
        role: { id: 'r-user', name: 'user' },
        createdAt: '2026-08-01T00:00:00.000Z',
      },
    ]

    await store.updateUserRole('u-1', 'r-admin')

    expect(getCalled).toBe(false)
    expect(store.users[0]?.roleId).toBe('r-admin')
    expect(store.users[0]?.role.name).toBe('admin')
  })

  it('deleteUser updates deletedAt timestamp in-place without refetching', async () => {
    let getCalled = false
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'mock-csrf' }) } as Response
      }
      if (url === '/api/users/u-1' && init?.method === 'DELETE') {
        return {
          ok: true,
          json: async () => ({ message: 'Pengguna berhasil dinonaktifkan.' }),
        } as Response
      }
      if (url === '/api/users' && (!init || init.method === 'GET')) {
        getCalled = true
        return { ok: true, json: async () => ({ users: [] }) } as Response
      }
      return { ok: true, json: async () => ({}) } as Response
    })
    globalThis.fetch = fetchMock

    const store = useUsersStore()
    store.users = [
      {
        id: 'u-1',
        email: 'user1@example.com',
        auth_provider: 'local',
        email_verified: true,
        requires_password_change: false,
        deletedAt: null,
        roleId: 'r-user',
        role: { id: 'r-user', name: 'user' },
        createdAt: '2026-08-01T00:00:00.000Z',
      },
    ]

    await store.deleteUser('u-1')

    expect(getCalled).toBe(false)
    expect(store.users[0]?.deletedAt).not.toBeNull()
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
