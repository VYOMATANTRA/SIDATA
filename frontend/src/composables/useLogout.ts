import { useRouter } from 'vue-router';
import { getCsrfToken } from '../utils/csrf';
import { useAuthStore } from '../stores/auth';

/**
 * Shared logout flow (CSRF token → POST /api/auth/logout → clear local session → redirect to
 * /login), extracted from HomeView.vue's inline implementation so the admin shell's sidebar can
 * offer the same sign-out control without duplicating the request/error handling.
 */
export function useLogout() {
  const router = useRouter();
  const authStore = useAuthStore();

  async function postLogout(csrfToken: string): Promise<Response> {
    return fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'x-csrf-token': csrfToken,
      },
    });
  }

  async function logout(): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      let csrfToken = await getCsrfToken();
      let response = await postLogout(csrfToken);

      // The server answers 403 when the CSRF token is missing or stale — the session is still
      // alive server-side. Fetch a fresh CSRF token and retry once before giving up.
      if (response.status === 403) {
        csrfToken = await getCsrfToken();
        response = await postLogout(csrfToken);
      }

      // A 401 means the server already considers the session dead (e.g. the refresh token
      // expired or was already revoked) — that is the outcome logout was trying to reach, not a
      // failure of it. Any other non-OK status (including a 403 that still failed after retry, or
      // 5xx) means the server never revoked the session, so keep local state intact and surface
      // the error instead of falsely appearing logged out.
      if (!response.ok && response.status !== 401) {
        return { ok: false, error: 'Gagal keluar dari sesi. Silakan coba lagi.' };
      }

      authStore.clearAuth();
      router.push('/login');
      return { ok: true };
    } catch {
      return { ok: false, error: 'Terjadi kesalahan jaringan saat keluar. Silakan coba lagi.' };
    }
  }

  return { logout };
}
