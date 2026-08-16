import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './auth'
import { getCsrfToken } from '../utils/csrf'

export interface UserRole {
  id: string
  name: string
}

export interface UserItem {
  id: string
  email: string
  auth_provider: string
  email_verified: boolean
  requires_password_change: boolean
  roleId: string
  role: UserRole
  createdAt: string
}

export const useUsersStore = defineStore('users', () => {
  const authStore = useAuthStore()
  const users = ref<UserItem[]>([])
  const roles = ref<UserRole[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function getAuthHeaders(): Promise<Record<string, string>> {
    const csrfToken = await getCsrfToken()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
    }
    if (authStore.accessToken) {
      headers['Authorization'] = `Bearer ${authStore.accessToken}`
    }
    return headers
  }

  async function fetchUsers() {
    loading.value = true
    error.value = null
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/users', {
        headers,
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengambil daftar pengguna.')
      }
      users.value = data.users || []
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat pengguna.'
    } finally {
      loading.value = false
    }
  }

  async function fetchRoles() {
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/users/roles', {
        headers,
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal memuat daftar role.')
      }
      roles.value = data.roles || []
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat daftar role.'
      error.value = msg
      console.error('Error fetching roles:', err)
    }
  }

  async function createUser(payload: { email: string; roleId: string; password: string }) {
    loading.value = true
    error.value = null
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/users', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal membuat pengguna.')
      }
      await fetchUsers()
      return data
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat pengguna.'
      error.value = msg
      throw new Error(msg)
    } finally {
      loading.value = false
    }
  }

  async function updateUserRole(userId: string, roleId: string) {
    loading.value = true
    error.value = null
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/users/${userId}/role`, {
        method: 'PATCH',
        headers,
        credentials: 'include',
        body: JSON.stringify({ roleId }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengubah role pengguna.')
      }
      await fetchUsers()
      return data
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengubah role pengguna.'
      error.value = msg
      throw new Error(msg)
    } finally {
      loading.value = false
    }
  }

  async function deleteUser(userId: string) {
    loading.value = true
    error.value = null
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menghapus pengguna.')
      }
      await fetchUsers()
      return data
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus pengguna.'
      error.value = msg
      throw new Error(msg)
    } finally {
      loading.value = false
    }
  }

  return {
    users,
    roles,
    loading,
    error,
    fetchUsers,
    fetchRoles,
    createUser,
    updateUserRole,
    deleteUser,
  }
})
