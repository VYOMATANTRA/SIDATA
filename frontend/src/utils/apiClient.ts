import { useAuthStore } from '../stores/auth';
import { getCsrfToken } from './csrf';
import {
  REFRESH_UNAVAILABLE_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  sanitizeFieldErrors,
  toUserMessage,
} from './userMessages';

export { REFRESH_UNAVAILABLE_MESSAGE, SESSION_EXPIRED_MESSAGE };

/**
 * Shared fetch wrapper for the CMS/editor endpoints. The backend mounts
 * `doubleCsrfProtection` globally, and every mutating content route sits behind
 * `verifyToken` + a role guard, so a request has to carry both the CSRF token header and
 * the in-memory access token. The per-store `getAuthHeaders()` copies in
 * `users.store.ts` / `contentBlocks.store.ts` predate this helper; new stores use it
 * instead of adding a third and fourth copy.
 */
const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** Facts a failed response carries alongside its message. */
export interface ApiErrorInit {
  /** Server `code` (e.g. `TREND_KEYWORD_ACK_REQUIRED`), kept for programmatic handling. */
  code?: string;
  /** Parsed JSON error body (e.g. `warnings`). Diagnostic only, never rendered. */
  body?: unknown;
  /** Field-level messages, present only when the server sends a field map. */
  fieldErrors?: Record<string, string>;
}

/**
 * Error carrying the HTTP status, so callers can branch on 409/422 without string matching.
 *
 * `message` keeps the server's text for existing callers and diagnostics. Banners and dialogs
 * must render `userMessage` (or `toUserMessage(error, context)` for an action-specific line),
 * never `message`.
 */
export class ApiError extends Error {
  status: number;
  code: string | undefined;
  body: unknown;
  fieldErrors: Record<string, string>;
  /** Approved plain-Indonesian text for a banner or dialog. Never the raw server message. */
  userMessage: string;

  constructor(message: string, status: number, init: ApiErrorInit = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = init.code;
    this.body = init.body;
    this.fieldErrors = init.fieldErrors ?? {};
    this.userMessage = toUserMessage(this).message;
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
 * `SESSION_EXPIRED_MESSAGE`. A refresh that fails for a transient reason (network/5xx) throws
 * `REFRESH_UNAVAILABLE_MESSAGE` instead, because that is not the session ending. Requests that
 * were sent without a token are never replayed — there is no session to restore, so the 401 is
 * the real answer.
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
    const outcome = await authStore.refreshSession();
    if (outcome === 'transient') {
      // The refresh endpoint failed, not the session: throwing here (rather than returning the
      // original 401) keeps the caller from showing "please log in again" to a user who is
      // still signed in.
      throw new ApiError(REFRESH_UNAVAILABLE_MESSAGE, 503);
    }
    if (outcome === 'denied') {
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
  const body = await readErrorBody(response);
  return textField(fieldOf(body, 'error')) ?? textField(fieldOf(body, 'message')) ?? fallback;
}

/** Parses an error response's JSON body; a non-JSON body (HTML error page) yields undefined. */
async function readErrorBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function fieldOf(body: unknown, key: string): unknown {
  return typeof body === 'object' && body !== null
    ? (body as Record<string, unknown>)[key]
    : undefined;
}

function textField(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** Raw failure details go to the dev console only. Nothing logged here reaches the UI. */
function logDiagnostic(label: string, detail: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    console.warn(`[apiClient] ${label}`, detail);
  }
}

async function apiErrorFromResponse(response: Response, path: string): Promise<ApiError> {
  const body = await readErrorBody(response);
  const serverMessage = textField(fieldOf(body, 'error')) ?? textField(fieldOf(body, 'message'));
  const code = textField(fieldOf(body, 'code'));
  const message =
    response.status === 401
      ? SESSION_EXPIRED_MESSAGE
      : (serverMessage ?? `Permintaan gagal (HTTP ${response.status}).`);

  logDiagnostic('request failed', { path, status: response.status, code, serverMessage });

  return new ApiError(message, response.status, {
    code,
    body,
    fieldErrors: sanitizeFieldErrors(fieldOf(body, 'fieldErrors')),
  });
}

export async function apiRequestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    throw await apiErrorFromResponse(response, path);
  }
  return (await response.json()) as T;
}
