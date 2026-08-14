import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getCsrfToken } from '../utils/csrf'

export interface UserProfile {
  id: string
  email: string
  role: string
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserProfile | null>(null)
  const accessToken = ref<string | null>(null)
  const isInitialized = ref(false)

  const isAuthenticated = computed(() => !!accessToken.value)

  function setAuth(newUser: UserProfile, token: string) {
    user.value = newUser
    accessToken.value = token
    isInitialized.value = true
  }

  function clearAuth() {
    user.value = null
    accessToken.value = null
    isInitialized.value = true
  }

  /**
   * Performs silent refresh on app boot using the HTTP-only refresh token cookie.
   * Keeps access token strictly in JavaScript memory without disk persistence.
   */
  async function initAuth(): Promise<boolean> {
    if (isInitialized.value && accessToken.value) {
      return true
    }

    try {
      const csrfToken = await getCsrfToken()
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'x-csrf-token': csrfToken,
        },
      })

      if (!res.ok) {
        clearAuth()
        return false
      }

      const data = await res.json()
      if (data.accessToken) {
        setAuth(data.user || { id: '', email: '', role: '' }, data.accessToken)
        return true
      }

      clearAuth()
      return false
    } catch {
      clearAuth()
      return false
    } finally {
      isInitialized.value = true
    }
  }

  return {
    user,
    accessToken,
    isInitialized,
    isAuthenticated,
    setAuth,
    clearAuth,
    initAuth,
  }
})
