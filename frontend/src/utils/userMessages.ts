/**
 * Plain-Indonesian messages for the failures a non-technical operator can run into.
 *
 * Banners and dialogs must only ever show text from this module. HTTP statuses, server
 * exception strings, API response objects and database errors are diagnostics: they stay on
 * the error object (`status`, `code`, `body`) and in the dev console, never on screen.
 *
 * This module deliberately imports nothing from `apiClient.ts` (it reads error shapes by duck
 * typing), so `ApiError` can depend on it without an import cycle.
 */

/**
 * Shown when a request is rejected with 401 and the silent refresh cannot restore the session.
 * The API's own message ("Token tidak valid") is accurate but unhelpful to someone who just
 * spent ten minutes filling a form.
 */
export const SESSION_EXPIRED_MESSAGE =
  'Sesi Anda berakhir. Silakan masuk kembali — isi formulir ini belum dikirim.';

/**
 * Shown when the 401 refresh could not even be attempted (network error) or the server failed
 * (5xx). The client cannot tell whether the session is still valid — the access token already
 * got a 401 and the refresh never finished — so the wording promises nothing and asks for a
 * retry instead of pushing the user to discard a draft.
 */
export const REFRESH_UNAVAILABLE_MESSAGE =
  'Koneksi ke server bermasalah; coba simpan lagi sebentar lagi.';

/** `ApiError.code` used for failures where no HTTP response arrived at all. */
export const NETWORK_ERROR_CODE = 'NETWORK_ERROR';

export type FailureKind =
  | 'network'
  | 'session'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'payload_too_large'
  | 'validation'
  | 'rate_limited'
  | 'server'
  | 'unknown';

export const USER_MESSAGES: Readonly<Record<FailureKind, string>> = {
  network: 'Perubahan belum tersimpan. Periksa koneksi lalu coba lagi.',
  session: SESSION_EXPIRED_MESSAGE,
  forbidden: 'Anda tidak memiliki izin untuk tindakan ini.',
  not_found: 'Data yang dicari tidak ditemukan. Muat ulang halaman.',
  conflict:
    'Data ini baru saja diubah oleh orang lain. Muat ulang untuk melihat versi terbaru; isian Anda tetap tersimpan di formulir.',
  payload_too_large: 'Berkas terlalu besar.',
  validation: 'Periksa kembali isian yang ditandai.',
  rate_limited: 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.',
  server: 'Terjadi kendala di server. Perubahan belum tersimpan. Coba lagi beberapa saat lagi.',
  unknown: 'Terjadi kendala di server. Perubahan belum tersimpan. Coba lagi beberapa saat lagi.',
};

export interface UserMessage {
  /** Approved text for a banner or dialog. Contains no status code or server string. */
  message: string;
  kind: FailureKind;
  /** The HTTP status the failure carried, or null when none was available. */
  status: number | null;
  /** Field-level messages, only for validation failures and only when the server sent a map. */
  fieldErrors: Record<string, string>;
}

function statusOf(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return null;
  }
  const { status } = error as { status: unknown };
  return typeof status === 'number' && Number.isInteger(status) ? status : null;
}

function isNetworkFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ((error as { code?: unknown }).code === NETWORK_ERROR_CODE) return true;
  // Browsers reject fetch() with a TypeError when no response arrived at all.
  return (
    error instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(error.message)
  );
}

function kindForStatus(status: number): FailureKind {
  if (status === 0) return 'network';
  if (status === 401) return 'session';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 413) return 'payload_too_large';
  if (status === 400 || status === 422) return 'validation';
  if (status === 429) return 'rate_limited';
  if (status >= 500 && status <= 599) return 'server';
  return 'unknown';
}

/** Buckets any thrown value into one failure kind. Anything unrecognised is `unknown`. */
export function classifyFailure(error: unknown): { kind: FailureKind; status: number | null } {
  const status = statusOf(error);
  if (isNetworkFailure(error)) {
    return { kind: 'network', status };
  }
  if (status === null) {
    return { kind: 'unknown', status: null };
  }
  return { kind: kindForStatus(status), status };
}

/**
 * Keeps only usable string messages from a server-provided field map. The key `__proto__` is
 * dropped so a hostile JSON body cannot touch the object's prototype.
 */
export function sanitizeFieldErrors(fieldMap: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (typeof fieldMap !== 'object' || fieldMap === null || Array.isArray(fieldMap)) {
    return result;
  }
  for (const [field, raw] of Object.entries(fieldMap)) {
    if (field === '__proto__') continue;
    const text = Array.isArray(raw)
      ? raw.find((item): item is string => typeof item === 'string')
      : raw;
    if (typeof text === 'string' && text.trim() !== '') {
      result[field] = text;
    }
  }
  return result;
}

/**
 * Maps any failure to approved user-facing text.
 *
 * @param error   Whatever was thrown: an ApiError, a fetch() rejection, or anything else.
 * @param context Optional action phrase, e.g. `'menyimpan indikator'`, which turns the result
 *                into `Gagal menyimpan indikator. <approved text>`.
 */
export function toUserMessage(error: unknown, context?: string): UserMessage {
  const { kind, status } = classifyFailure(error);
  const phrase = context?.trim().replace(/\.+$/, '');
  const base = USER_MESSAGES[kind];
  const message = phrase ? `Gagal ${phrase}. ${base}` : base;
  const fieldErrors =
    kind === 'validation' && typeof error === 'object' && error !== null
      ? sanitizeFieldErrors((error as { fieldErrors?: unknown }).fieldErrors)
      : {};

  return { message, kind, status, fieldErrors };
}
