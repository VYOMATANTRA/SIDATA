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

/**
 * Shown when a request is rejected with 401 and the silent refresh cannot restore the session.
 * The API's own message ("Token tidak valid") is accurate but unhelpful to someone who just
 * spent ten minutes filling a form.
 */
export const SESSION_EXPIRED_MESSAGE =
  'Sesi Anda berakhir. Silakan masuk kembali — isi formulir ini belum dikirim.';

/** Error carrying the HTTP status, so callers can branch on 409/422 without string matching. */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Builds the init for one attempt. The bearer token is read from the store on every call, so a
 * replay after a refresh carries the new token rather than the one the API just rejected.
 */
async function buildInit(init: RequestInit): Promise<RequestInit> {
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

  return { ...init, headers, credentials: 'include' };
}

/**
 * Sends an authenticated request, refreshing once and replaying it if the access token has
 * expired. Access tokens live 15 minutes (`backend/src/utils/jwt.ts`), which is shorter than an
 * editor can plausibly leave a form open, so without this a save would fail with a bare 401 and
 * strand the draft.
 *
 * The replay happens at most once: a second 401 is returned to the caller, which turns it into
 * `SESSION_EXPIRED_MESSAGE`. Requests that were sent without a token are never replayed — there
 * is no session to restore, so the 401 is the real answer.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const authStore = useAuthStore();
  const tokenUsed = authStore.accessToken;
  const response = await fetch(path, await buildInit(init));

  if (response.status !== 401 || !tokenUsed) {
    return response;
  }

  if (authStore.accessToken === tokenUsed) {
    // `refreshSession()` shares one in-flight refresh with the router guard and with other
    // requests that 401'd at the same time, so a burst of saves triggers one refresh.
    const refreshed = await authStore.refreshSession();
    if (!refreshed) {
      return response;
    }
  } else if (!authStore.accessToken) {
    // A concurrent request already refreshed and the session is gone; replaying would just send
    // another tokenless request.
    return response;
  }

  // Safe to replay because every body in this app is a JSON string. A streaming body would have
  // been consumed by the first attempt.
  return fetch(path, await buildInit(init));
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
    const message =
      response.status === 401
        ? SESSION_EXPIRED_MESSAGE
        : await readErrorMessage(response, `Permintaan gagal (HTTP ${response.status}).`);
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as T;
}
