import { useAuthStore } from '../stores/auth';
import { getCsrfToken } from './csrf';

/**
 * Shared fetch wrapper for the CMS/editor endpoints. The backend mounts
 * `doubleCsrfProtection` globally, and every mutating content route sits behind
 * `verifyToken` + a role guard, so a request has to carry both the CSRF token header and
 * the in-memory access token. The per-store `getAuthHeaders()` copies in
 * `users.store.ts` / `contentBlocks.store.ts` predate this helper; new stores use it
 * instead of adding a third and fourth copy.
 */
const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** Error carrying the HTTP status, so callers can branch on 409/422 without string matching. */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const authStore = useAuthStore();
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);

  if (authStore.accessToken) {
    headers.set('Authorization', `Bearer ${authStore.accessToken}`);
  }

  if (MUTATING_METHODS.has(method)) {
    headers.set('x-csrf-token', await getCsrfToken());
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  }

  return fetch(path, { ...init, headers, credentials: 'include' });
}

/**
 * Pulls the message out of an error response. The backend answers with `{ error }` for
 * service/validation failures and `{ message }` on success bodies; a non-JSON body (an HTML
 * error page, an empty 502) falls back to the caller's generic text rather than throwing
 * over the top of the original failure.
 */
export async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string; message?: string };
    return data.error || data.message || fallback;
  } catch {
    return fallback;
  }
}

export async function apiRequestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    throw new ApiError(
      await readErrorMessage(response, `Permintaan gagal (HTTP ${response.status}).`),
      response.status,
    );
  }
  return (await response.json()) as T;
}
