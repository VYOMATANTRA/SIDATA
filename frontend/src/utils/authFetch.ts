import { useAuthStore } from '../stores/auth'

/**
 * fetch() wrapper for endpoints behind the backend's verifyToken middleware
 * (Authorization: Bearer <accessToken>), e.g. GET /api/auth/me. Plain fetch() calls never
 * attach this header — the in-memory access token has to be added explicitly per request.
 */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const authStore = useAuthStore()
  const headers = new Headers(init.headers)

  if (authStore.accessToken) {
    headers.set('Authorization', `Bearer ${authStore.accessToken}`)
  }

  return fetch(input, { ...init, credentials: 'include', headers })
}
