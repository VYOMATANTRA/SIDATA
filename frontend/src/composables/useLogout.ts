import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

/**
 * Shared UI logout helper: delegates the server session revocation, CSRF retry, and local state
 * cleanup to `authStore.logout()` (the single source of truth for how logout works), then
 * redirects to `/login` on success.
 */
export function useLogout() {
  const router = useRouter();
  const authStore = useAuthStore();

  async function logout(): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const result = await authStore.logout();

      if (!result.success) {
        return {
          ok: false,
          error: result.error || 'Gagal keluar dari sesi. Silakan coba lagi.',
        };
      }

      await router.push('/login');
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: 'Terjadi kesalahan tidak terduga saat keluar. Silakan coba lagi.',
      };
    }
  }

  return { logout };
}
