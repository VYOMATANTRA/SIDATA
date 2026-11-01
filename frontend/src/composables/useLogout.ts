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

  async function logout(): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const csrfToken = await getCsrfToken();

      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'x-csrf-token': csrfToken,
        },
      });

      // A 401/403 means the server already considers the session dead (e.g. the refresh token
      // expired or was already revoked) — that is the outcome logout was trying to reach, not a
      // failure of it. Treating it as an error here would trap the user in a session they can
      // never leave, since every retry hits the same already-expired session and fails the same
      // way. Only a genuine server error (5xx) or network failure keeps the local session intact.
      if (!response.ok && response.status !== 401 && response.status !== 403) {
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
