import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getCsrfToken } from '../utils/csrf'

export interface UserProfile {
  id: string
  email: string
  role: string
}

/**
 * Why a silent refresh did or did not restore the session.
 *
 * - `ok` — a new access token was issued.
 * - `denied` — the server rejected the refresh token (401/403); the session is really over.
 * - `transient` — the refresh could not be attempted (network) or the server failed (5xx).
 *   The session may still be valid, so callers must not tell the user to log in again.
 */
export type RefreshOutcome = 'ok' | 'denied' | 'transient'

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
  let inFlight: Promise<RefreshOutcome> | null = null

  // Monotonically increasing generation counter to invalidate in-flight silent refreshes
  // when an explicit logout or clearAuth occurs while a request is pending.
  let authEpoch = 0

  const isAuthenticated = computed(() => !!accessToken.value)
  const isAdmin = computed(() => user.value?.role?.toLowerCase() === 'admin')
  const isEditor = computed(() => user.value?.role?.toLowerCase() === 'editor')
  /**
   * Content editing is Editor or Admin (SPEC §3). Mirrors the backend's
   * `requireEditorOrAdmin` guard so the UI does not offer actions the API would reject.
   */
  const canEditData = computed(() => isAdmin.value || isEditor.value)

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

  async function performInitAuth(): Promise<RefreshOutcome> {
    const currentEpoch = ++authEpoch
    try {
      const csrfToken = await getCsrfToken()
      if (currentEpoch !== authEpoch) {
        return 'transient'
      }
      if (!csrfToken) {
        // getCsrfToken() collapses a network/5xx failure into ''. Sending an empty header would
        // make /refresh answer 403, which this function reads as a dead session — so a brief
        // hiccup on the CSRF endpoint would log the user out. Treat it as transient instead.
        return 'transient'
      }
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'x-csrf-token': csrfToken,
        },
      })

      if (currentEpoch !== authEpoch) {
        return 'transient'
      }

      if (!res.ok) {
        // 401/403 is the server saying the session is dead. Every other 4xx (400 malformed,
        // CSRF rejection) means the refresh will keep failing the same way, so it is also a
        // denial — otherwise the user retries forever and is never asked to sign in again.
        // 408 (timeout) and 429 (rate limited) are failures of this attempt, not of the
        // session, and stay transient so a busy IP is not logged out.
        const denied =
          res.status === 401 ||
          res.status === 403 ||
          (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429);

        if (denied) {
          if (currentEpoch === authEpoch) {
            clearAuth(mustChangePassword.value)
            refreshDenied.value = true
          }
          return 'denied'
        }

        // A 5xx (or a network blip) must not destroy a session that may still be valid: keep
        // the in-memory token and let the next navigation or request retry.
        return 'transient'
      }

      const data = await res.json()
      if (currentEpoch !== authEpoch) {
        return 'transient'
      }

      if (data.accessToken) {
        setAuth(data.user || { id: '', email: '', role: '' }, data.accessToken)
        return 'ok'
      }

      if (currentEpoch === authEpoch) {
        clearAuth(mustChangePassword.value)
      }
      return 'denied'
    } catch {
      // Network failure: transient, exactly like a 5xx. Clearing here would log the user out
      // of a session the server never rejected.
      return 'transient'
    } finally {
      if (currentEpoch === authEpoch) {
        isInitialized.value = true
      }
    }
  }

  /**
   * Forces a refresh even when an access token is already in memory. The 401 retry path in
   * `utils/apiClient.ts` calls this precisely because the in-memory token is the one the API
   * just rejected — `initAuth()` cannot be used there, since it short-circuits while a token is
   * present.
   *
   * Concurrent callers (the router guard plus one or more replaying requests) share one request,
   * and a definitive 401/403 latches `refreshDenied` so a dead session is not hammered. Network
   * errors and 5xx stay retryable.
   */
  async function refreshSession(): Promise<RefreshOutcome> {
    if (refreshDenied.value) {
      return 'denied'
    }

    if (!inFlight) {
      inFlight = performInitAuth().finally(() => {
        inFlight = null
      })
    }

    return inFlight
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

    return (await refreshSession()) === 'ok'
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
    isEditor,
    canEditData,
    setupToken,
    mustChangePassword,
    refreshDenied,
    setAuth,
    setSetupAuth,
    clearAuth,
    initAuth,
    refreshSession,
    logout,
  }
})
