import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUsersStore } from '../stores/users.store'
import { useAuthStore } from '../stores/auth'
import { ApiError } from '../utils/apiClient'
import { READ_USER_MESSAGES, toUserMessage } from '../utils/userMessages'

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

  it('changeUserPassword throws on backend error and leaves the load error alone', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'mock-csrf' }) } as Response
      }
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: 'Password terlalu lemah atau umum digunakan.' }),
      } as Response
    })
    globalThis.fetch = fetchMock

    const store = useUsersStore()
    await expect(store.changeUserPassword('user-123', 'password123')).rejects.toMatchObject({
      status: 400,
      serverMessage: 'Password terlalu lemah atau umum digunakan.',
    })
    expect(store.error).toBeNull()
    expect(store.errorKind).toBeNull()
  })

  it('a failed createUser does not set the page load error', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (String(input).includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'mock-csrf' }) } as Response
      }
      return { ok: false, status: 409, json: async () => ({ error: 'Email sudah ada.' }) } as Response
    })
    const store = useUsersStore()
    await expect(
      store.createUser({ email: 'a@b.id', roleId: 'r-1', password: 'Password123!' }),
    ).rejects.toMatchObject({ status: 409 })
    expect(store.error).toBeNull()
    expect(store.errorKind).toBeNull()
  })

  it('a failed write leaves an earlier load error in place', async () => {
    const fail = (status: number) =>
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        if (String(input).includes('csrf-token')) {
          return { ok: true, json: async () => ({ csrfToken: 'mock-csrf' }) } as Response
        }
        return { ok: false, status, json: async () => ({}) } as Response
      })
    const store = useUsersStore()
    globalThis.fetch = fail(500)
    await store.fetchUsers()
    const loadError = store.error
    expect(loadError).toBeTruthy()
    await expect(store.deleteUser('u-1')).rejects.toBeTruthy()
    expect(store.error).toBe(loadError)
    expect(store.errorKind).toBe('server')
  })

  it('fetchUsers sets errorKind on 403, network and 500, and resets it on success', async () => {
    const respond = (status: number | 'network') =>
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        if (String(input).includes('csrf-token')) {
          return { ok: true, json: async () => ({ csrfToken: 'mock-csrf' }) } as Response
        }
        if (status === 'network') throw new TypeError('Failed to fetch')
        return { ok: false, status, json: async () => ({}) } as Response
      })
    const store = useUsersStore()
    globalThis.fetch = respond(403)
    await store.fetchUsers()
    expect(store.errorKind).toBe('forbidden')
    globalThis.fetch = respond('network')
    await store.fetchUsers()
    expect(store.errorKind).toBe('network')
    globalThis.fetch = respond(500)
    await store.fetchUsers()
    expect(store.errorKind).toBe('server')
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (String(input).includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'mock-csrf' }) } as Response
      }
      return { ok: true, json: async () => ({ users: [] }) } as Response
    })
    await store.fetchUsers()
    expect(store.error).toBeNull()
    expect(store.errorKind).toBeNull()
  })

  describe('transport failures and state isolation', () => {
    const USER_1 = {
      id: 'u-1',
      email: 'user1@example.com',
      auth_provider: 'local',
      email_verified: true,
      requires_password_change: false,
      deletedAt: null,
      roleId: 'r-user',
      role: { id: 'r-user', name: 'user' },
      createdAt: '2026-08-01T00:00:00.000Z',
    }

    function jsonRes(body: unknown, status = 200): Response {
      return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
    }

    /** A proxy or gateway answers with an HTML page, so reading it as JSON throws. */
    function htmlRes(status: number): Response {
      return {
        ok: false,
        status,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0')
        },
      } as unknown as Response
    }

    type Route = (init?: RequestInit) => Response | Promise<Response>

    /** Routes by `METHOD /path`; the CSRF endpoint is answered for every test. */
    function routeFetch(routes: Record<string, Route>) {
      const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
        const url = String(input)
        if (url.includes('csrf-token')) return jsonRes({ csrfToken: 'mock-csrf' })
        const key = `${(init?.method ?? 'GET').toUpperCase()} ${url}`
        const route = routes[key]
        if (!route) throw new Error(`unexpected fetch: ${key}`)
        return route(init)
      })
      globalThis.fetch = fetchMock
      return fetchMock
    }

    const MUTATIONS: Array<
      [
        name: string,
        run: (store: ReturnType<typeof useUsersStore>) => Promise<unknown>,
        routeKey: string,
      ]
    > = [
      [
        'createUser',
        (s) => s.createUser({ email: 'new@example.com', roleId: 'r-user', password: 'Password123!' }),
        'POST /api/users',
      ],
      ['reactivateUser', (s) => s.reactivateUser('u-1'), 'PATCH /api/users/u-1/reactivate'],
      [
        'changeUserPassword',
        (s) => s.changeUserPassword('u-1', 'Password123!'),
        'PATCH /api/users/u-1/password',
      ],
      ['updateUserRole', (s) => s.updateUserRole('u-1', 'r-user'), 'PATCH /api/users/u-1/role'],
      ['deleteUser', (s) => s.deleteUser('u-1'), 'DELETE /api/users/u-1'],
    ]

    beforeEach(() => {
      setActivePinia(createPinia())
    })

    it('fetchUsers reports a non-JSON 502 as a server failure, not an unknown one', async () => {
      routeFetch({ 'GET /api/users': () => htmlRes(502) })
      const store = useUsersStore()

      await store.fetchUsers()

      expect(store.errorKind).toBe('server')
      expect(store.error).toBe(`Gagal memuat daftar pengguna. ${READ_USER_MESSAGES.server}`)
      expect(store.error).not.toMatch(/SyntaxError|Unexpected token/)
    })

    it('fetchRoles reports a non-JSON 500 as a server failure in rolesError only', async () => {
      routeFetch({ 'GET /api/users/roles': () => htmlRes(500) })
      const store = useUsersStore()

      await store.fetchRoles()

      expect(store.rolesErrorKind).toBe('server')
      expect(store.rolesError).toBe(`Gagal memuat daftar role. ${READ_USER_MESSAGES.server}`)
      expect(store.error).toBeNull()
      expect(store.errorKind).toBeNull()
    })

    it('a non-JSON 502 on a mutation rejects with an ApiError carrying the status', async () => {
      routeFetch({ 'DELETE /api/users/u-1': () => htmlRes(502) })
      const store = useUsersStore()
      store.users = [{ ...USER_1 }]

      const failure: unknown = await store.deleteUser('u-1').catch((err: unknown) => err)

      expect(failure).toBeInstanceOf(ApiError)
      expect(failure).toMatchObject({ status: 502 })
      expect(toUserMessage(failure).kind).toBe('server')
      expect(store.users[0]?.deletedAt).toBeNull()
      expect(store.mutating).toBe(false)
    })

    it('fetchUsers with a 401 and a dead refresh yields the session kind and ends the session', async () => {
      const authStore = useAuthStore()
      authStore.setAuth({ id: 'admin-1', email: 'admin@example.com', role: 'admin' }, 'expired')
      routeFetch({
        'GET /api/users': () => jsonRes({ error: 'Token tidak valid' }, 401),
        'POST /api/auth/refresh': () => jsonRes({ error: 'Token tidak valid' }, 401),
      })
      const store = useUsersStore()

      await store.fetchUsers()

      expect(store.errorKind).toBe('session')
      expect(authStore.sessionEnded).toBe(true)
    })

    it('a mutation with a 401 and a dead refresh yields the session kind and ends the session', async () => {
      const authStore = useAuthStore()
      authStore.setAuth({ id: 'admin-1', email: 'admin@example.com', role: 'admin' }, 'expired')
      routeFetch({
        'DELETE /api/users/u-1': () => jsonRes({ error: 'Token tidak valid' }, 401),
        'POST /api/auth/refresh': () => jsonRes({ error: 'Token tidak valid' }, 401),
      })
      const store = useUsersStore()
      store.users = [{ ...USER_1 }]

      const failure: unknown = await store.deleteUser('u-1').catch((err: unknown) => err)

      expect(toUserMessage(failure, 'menghapus pengguna', 'DELETE').kind).toBe('session')
      expect(authStore.sessionEnded).toBe(true)
    })

    it('fetchRoles fills roles and leaves the list error untouched', async () => {
      routeFetch({ 'GET /api/users/roles': () => jsonRes({ roles: [{ id: 'r-user', name: 'user' }] }) })
      const store = useUsersStore()
      store.error = 'Gagal memuat daftar pengguna. Coba lagi.'
      store.errorKind = 'server'

      await store.fetchRoles()

      expect(store.roles).toEqual([{ id: 'r-user', name: 'user' }])
      expect(store.rolesError).toBeNull()
      expect(store.rolesErrorKind).toBeNull()
      expect(store.error).toBe('Gagal memuat daftar pengguna. Coba lagi.')
      expect(store.errorKind).toBe('server')
    })

    it('a failed fetchRoles sets rolesError and never writes the list error', async () => {
      routeFetch({ 'GET /api/users/roles': () => jsonRes({ error: 'Akses ditolak' }, 403) })
      const store = useUsersStore()

      await store.fetchRoles()

      expect(store.rolesErrorKind).toBe('forbidden')
      expect(store.rolesError).toBe(`Gagal memuat daftar role. ${READ_USER_MESSAGES.forbidden}`)
      expect(store.error).toBeNull()
      expect(store.errorKind).toBeNull()
      expect(store.loading).toBe(false)
    })

    it('a successful fetchRoles clears an earlier rolesError', async () => {
      let attempt = 0
      routeFetch({
        'GET /api/users/roles': () => {
          attempt += 1
          return attempt === 1
            ? jsonRes({ error: 'Akses ditolak' }, 403)
            : jsonRes({ roles: [{ id: 'r-user', name: 'user' }] })
        },
      })
      const store = useUsersStore()
      await store.fetchRoles()
      expect(store.rolesErrorKind).toBe('forbidden')

      await store.fetchRoles()

      expect(store.rolesError).toBeNull()
      expect(store.rolesErrorKind).toBeNull()
      expect(store.roles).toHaveLength(1)
    })

    it('a roles failure racing a successful user list keeps each banner to its own request', async () => {
      routeFetch({
        'GET /api/users': () => jsonRes({ users: [{ ...USER_1 }] }),
        'GET /api/users/roles': () => jsonRes({ error: 'Akses ditolak' }, 403),
      })
      const store = useUsersStore()

      await Promise.all([store.fetchUsers(), store.fetchRoles()])

      expect(store.users).toHaveLength(1)
      expect(store.error).toBeNull()
      expect(store.errorKind).toBeNull()
      expect(store.rolesErrorKind).toBe('forbidden')
      expect(store.loading).toBe(false)
    })

    it('a user-list failure racing a successful role load keeps each banner to its own request', async () => {
      routeFetch({
        'GET /api/users': () => jsonRes({ error: 'Terjadi kesalahan' }, 500),
        'GET /api/users/roles': () => jsonRes({ roles: [{ id: 'r-user', name: 'user' }] }),
      })
      const store = useUsersStore()

      await Promise.all([store.fetchUsers(), store.fetchRoles()])

      expect(store.errorKind).toBe('server')
      expect(store.rolesError).toBeNull()
      expect(store.rolesErrorKind).toBeNull()
      expect(store.roles).toHaveLength(1)
      expect(store.loading).toBe(false)
    })

    it.each(MUTATIONS)(
      '%s sets mutating while in flight and never touches loading or the load errors',
      async (_name, run, routeKey) => {
        let release: ((res: Response) => void) | undefined
        routeFetch({
          [routeKey]: () =>
            new Promise<Response>((resolve) => {
              release = resolve
            }),
        })
        const store = useUsersStore()
        store.users = [{ ...USER_1 }]
        store.error = 'Gagal memuat daftar pengguna. Coba lagi.'
        store.errorKind = 'server'
        store.rolesError = 'Gagal memuat daftar role. Coba lagi.'
        store.rolesErrorKind = 'forbidden'

        const pending = run(store)
        await vi.waitFor(() => expect(release).toBeDefined())
        expect(store.mutating).toBe(true)
        expect(store.loading).toBe(false)

        release?.(jsonRes({ message: 'ok', user: { ...USER_1 } }))
        await pending

        expect(store.mutating).toBe(false)
        expect(store.loading).toBe(false)
        expect(store.error).toBe('Gagal memuat daftar pengguna. Coba lagi.')
        expect(store.errorKind).toBe('server')
        expect(store.rolesError).toBe('Gagal memuat daftar role. Coba lagi.')
        expect(store.rolesErrorKind).toBe('forbidden')
      },
    )

    it('a failed mutation clears mutating and leaves loading and the list error untouched', async () => {
      routeFetch({ 'DELETE /api/users/u-1': () => jsonRes({ error: 'Pengguna tidak ditemukan' }, 404) })
      const store = useUsersStore()
      store.users = [{ ...USER_1 }]
      store.error = 'Gagal memuat daftar pengguna. Coba lagi.'
      store.errorKind = 'server'

      await expect(store.deleteUser('u-1')).rejects.toBeInstanceOf(ApiError)

      expect(store.mutating).toBe(false)
      expect(store.loading).toBe(false)
      expect(store.error).toBe('Gagal memuat daftar pengguna. Coba lagi.')
      expect(store.errorKind).toBe('server')
    })

    it('mutating stays true until the last of two overlapping mutations settles', async () => {
      let releaseDelete: ((res: Response) => void) | undefined
      let releaseReactivate: ((res: Response) => void) | undefined
      routeFetch({
        'DELETE /api/users/u-1': () =>
          new Promise<Response>((resolve) => {
            releaseDelete = resolve
          }),
        'PATCH /api/users/u-2/reactivate': () =>
          new Promise<Response>((resolve) => {
            releaseReactivate = resolve
          }),
      })
      const store = useUsersStore()
      store.users = [{ ...USER_1 }, { ...USER_1, id: 'u-2' }]

      const first = store.deleteUser('u-1')
      const second = store.reactivateUser('u-2')
      await vi.waitFor(() => {
        expect(releaseDelete).toBeDefined()
        expect(releaseReactivate).toBeDefined()
      })

      releaseDelete?.(jsonRes({ message: 'ok' }))
      await first
      expect(store.mutating).toBe(true)

      releaseReactivate?.(jsonRes({ message: 'ok', user: { id: 'u-2', deletedAt: null } }))
      await second
      expect(store.mutating).toBe(false)
    })
  })
})
