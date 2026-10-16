import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getCsrfToken } from '../utils/csrf'

export interface UserProfile {
  id: string
  email: string
  role: string
}

const SETUP_TOKEN_KEY = 'sidata_setup_token'

function getStoredSetupToken(): string | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null
  try {
    return sessionStorage.getItem(SETUP_TOKEN_KEY)
  } catch {
    return null
  }
}

function saveStoredSetupToken(token: string) {
  if (typeof window === 'undefined' || !window.sessionStorage) return
  try {
    sessionStorage.setItem(SETUP_TOKEN_KEY, token)
  } catch {}
}

function removeStoredSetupToken() {
  if (typeof window === 'undefined' || !window.sessionStorage) return
  try {
    sessionStorage.removeItem(SETUP_TOKEN_KEY)
  } catch {}
}

export const useAuthStore = defineStore('auth', () => {
  const initialSetupToken = getStoredSetupToken()
  const user = ref<UserProfile | null>(null)
  const accessToken = ref<string | null>(null)
  const isInitialized = ref(false)
  const setupToken = ref<string | null>(initialSetupToken)
  const mustChangePassword = ref(!!initialSetupToken)

  // Set once a refresh attempt gets a definitive 401/403 back — the server saying "this
  // session is not valid," as opposed to "something went wrong." Retrying a definitive
  // denial can't change the answer, so this suppresses further initAuth() attempts for the
  // rest of the tab's life. Network errors and 5xx must NOT set this — those are transient,
  // and silent refresh must keep retrying on the next navigation (see router/index.ts).
  const refreshDenied = ref(false)

  // Shares one in-flight request across concurrent initAuth() callers (e.g. router guards
  // firing on rapid navigations) instead of each firing its own csrf-token + refresh pair.
  let inFlight: Promise<boolean> | null = null

  // Monotonically increasing generation counter to invalidate in-flight silent refreshes
  // when an explicit logout or clearAuth occurs while a request is pending.
  let authEpoch = 0

  const isAuthenticated = computed(() => !!accessToken.value)
  const isAdmin = computed(() => user.value?.role?.toLowerCase() === 'admin')

  function setAuth(newUser: UserProfile, token: string) {
    authEpoch++
    user.value = newUser
    accessToken.value = token
    isInitialized.value = true
    refreshDenied.value = false
    setupToken.value = null
    mustChangePassword.value = false
    removeStoredSetupToken()
  }

  function setSetupAuth(token: string) {
    setupToken.value = token
    mustChangePassword.value = true
    saveStoredSetupToken(token)
  }

  function clearAuth(keepSetup = false) {
    authEpoch++
    user.value = null
    accessToken.value = null
    isInitialized.value = true
    refreshDenied.value = false
    if (!keepSetup) {
      setupToken.value = null
      mustChangePassword.value = false
      removeStoredSetupToken()
    }
  }

  async function performInitAuth(): Promise<boolean> {
    const currentEpoch = ++authEpoch
    try {
      const csrfToken = await getCsrfToken()
      if (currentEpoch !== authEpoch) {
        return false
      }

      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'x-csrf-token': csrfToken,
        },
      })

      if (currentEpoch !== authEpoch) {
        return false
      }

      if (!res.ok) {
        clearAuth(mustChangePassword.value)
        if (res.status === 401 || res.status === 403) {
          refreshDenied.value = true
        }
        return false
      }

      const data = await res.json()
      if (currentEpoch !== authEpoch) {
        return false
      }

      if (data.accessToken) {
        setAuth(data.user || { id: '', email: '', role: '' }, data.accessToken)
        return true
      }

      clearAuth(mustChangePassword.value)
      return false
    } catch {
      if (currentEpoch === authEpoch) {
        clearAuth(mustChangePassword.value)
      }
      return false
    } finally {
      if (currentEpoch === authEpoch) {
        isInitialized.value = true
      }
    }
  }

  /**
   * Performs silent refresh on app boot using the HTTP-only refresh token cookie.
   * Keeps access token strictly in JavaScript memory without disk persistence.
   */
  async function initAuth(): Promise<boolean> {
    if (isInitialized.value && accessToken.value) {
      return true
    }

    if (refreshDenied.value) {
      return false
    }

    if (!inFlight) {
      inFlight = performInitAuth().finally(() => {
        inFlight = null
      })
    }

    return inFlight
  }

  /**
   * Performs explicit user logout: revokes server session, clears memory tokens,
   * invalidates in-flight refresh requests, and suppresses immediate auto-refresh.
   */
  async function logout(): Promise<{ success: boolean; error?: string }> {
    try {
      const csrfToken = await getCsrfToken()
      if (!csrfToken) {
        return {
          success: false,
          error: 'Gagal memvalidasi token keamanan (CSRF). Silakan coba lagi.',
        }
      }

      const res = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'x-csrf-token': csrfToken,
        },
      })

      if (!res.ok) {
        return {
          success: false,
          error: 'Gagal keluar dari sesi. Silakan coba lagi.',
        }
      }

      clearAuth()
      refreshDenied.value = true
      return { success: true }
    } catch {
      return {
        success: false,
        error: 'Terjadi kesalahan jaringan saat keluar. Silakan coba lagi.',
      }
    }
  }

  return {
    user,
    accessToken,
    isInitialized,
    isAuthenticated,
    isAdmin,
    setupToken,
    mustChangePassword,
    refreshDenied,
    setAuth,
    setSetupAuth,
    clearAuth,
    initAuth,
    logout,
  }
})
