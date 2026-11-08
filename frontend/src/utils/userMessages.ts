/**
 * Plain-Indonesian messages for the failures a non-technical operator can run into.
 *
 * Banners and dialogs must only ever show text from this module. The single exception is the
 * server's own sentence for a 400/422 validation failure (see `toUserMessage`). HTTP statuses, server
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

/**
 * Server codes that mean "someone saved this record after you loaded it". Only these get the
 * concurrent-edit wording; any other 409 (duplicate name or email, item still in use) is a
 * plain conflict with the existing data, and telling the user someone else edited it would be
 * wrong.
 */
export const STALE_WRITE_CODES: ReadonlySet<string> = new Set(['STALE_WRITE']);

export type FailureKind =
  | 'network'
  | 'session'
  | 'forbidden'
  | 'not_found'
  | 'stale'
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
  stale:
    'Data ini baru saja diubah oleh orang lain. Muat ulang untuk melihat versi terbaru; isian Anda tetap tersimpan di formulir.',
  conflict:
    'Tindakan tidak dapat dilakukan karena data ini bentrok dengan data lain yang sudah ada atau masih dipakai. Periksa kembali, lalu coba lagi.',
  payload_too_large: 'Isi yang dikirim terlalu besar. Persingkat teks atau kurangi jumlah baris.',
  validation: 'Periksa kembali isian yang ditandai.',
  rate_limited: 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.',
  server: 'Terjadi kendala di server. Perubahan belum tersimpan. Coba lagi beberapa saat lagi.',
  unknown: 'Terjadi kendala di server. Perubahan belum tersimpan. Coba lagi beberapa saat lagi.',
};

/**
 * Wording for failed reads (GET/HEAD). Nothing was being saved, so "Perubahan belum tersimpan"
 * would be wrong; only the kinds that mention saving need a neutral variant.
 */
export const READ_USER_MESSAGES: Readonly<Partial<Record<FailureKind, string>>> = {
  network: 'Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.',
  server: 'Terjadi kendala di server. Coba lagi beberapa saat lagi.',
  unknown: 'Terjadi kendala di server. Coba lagi beberapa saat lagi.',
};

/** True for HTTP methods that never change data. An unknown method counts as a write. */
export function isReadMethod(method: unknown): boolean {
  if (typeof method !== 'string') return false;
  const upper = method.toUpperCase();
  return upper === 'GET' || upper === 'HEAD';
}

/** Approved text for a failure kind, worded for a read or a write request. */
export function approvedMessage(kind: FailureKind, method?: unknown): string {
  return (isReadMethod(method) ? READ_USER_MESSAGES[kind] : undefined) ?? USER_MESSAGES[kind];
}

/** Longest server message surfaced for a 400/422; anything longer is not a readable sentence. */
const MAX_SERVER_MESSAGE_LENGTH = 300;

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

function codeOf(error: unknown): unknown {
  return typeof error === 'object' && error !== null
    ? (error as { code?: unknown }).code
    : undefined;
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
  if (status === 409 && STALE_WRITE_CODES.has(String(codeOf(error)))) {
    return { kind: 'stale', status };
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
 * Internal API field, parameter and table names that appear inside backend error sentences.
 * A sentence naming any of them (as a whole token) is never shown. An explicit list, not a
 * camelCase/snake_case heuristic: units and acronyms ("kWh", "eKTP") and e-mail addresses
 * would be false positives of a pattern.
 */
export const HIDDEN_API_TOKENS: readonly string[] = [
  'comparisonTemplateId',
  'comparisonTemplate',
  'isComputedComparison',
  'isSample',
  'value_previous',
  'period_previous',
  'value_current',
  'period_current',
  'valuePrevious',
  'periodPrevious',
  'valueCurrent',
  'periodCurrent',
  'rowKey',
  'sectionId',
  'chapterId',
  'pageId',
  'pageSlug',
  'tableId',
  'templateId',
  'pointId',
  'pointIds',
  'roleId',
  'sortOrder',
  'expectedUpdatedAt',
  'expectedRtNumber',
  'acknowledgedWarnings',
  'ackKey',
  'trendNaik',
  'trendTurun',
  'trendTetap',
  'pageSize',
  'includeStale',
  'rtNumber',
  'rt_number',
  'point_id',
  'section_id',
  'chapter_id',
  'page_id',
  'setting_key',
  'comparison_templates',
  'content_blocks',
  'indicator_tables',
  'indicator_table_rows',
  'rt_leaders',
  'spatial_points',
  'spatial_point_rt',
  'system_settings',
  'audit_logs',
  'acknowledgedAt',
  'acknowledgedById',
];

/** Camel-case API name to its lower-case concatenated, snake_case and kebab-case spellings. */
function tokenSpellings(token: string): string[] {
  const words = token
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[\s_-]+/);
  return [words.join(''), words.join('_'), words.join('-')];
}

/**
 * Matched against the lower-cased sentence, so `RowKey`, `foo_rowKey`, `rowKeys`, `row_key`
 * and `row-key2` are all caught. A trailing plural `s` or digits are tolerated.
 */
const HIDDEN_TOKEN_PATTERN = new RegExp(
  `(?<![a-z0-9])(?:${[...new Set(HIDDEN_API_TOKENS.flatMap(tokenSpellings))].join('|')})(?:s|\\d+)?(?![a-z0-9])`,
);

/**
 * Enum-like values the backend puts in sentences, with the words a reader knows. Only
 * standalone tokens: not part of a URL, path, file name, code span or longer identifier.
 */
const FRIENDLY_TERMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/(?<![\w/.\-`])ketua_rt(?![\w/\-`]|\.\w)/g, 'Ketua RT'],
  [/(?<![\w/.\-`])bank_sampah(?![\w/\-`]|\.\w)/g, 'Bank Sampah'],
  [/(?<![\w/.\-`])fasilitas_umum(?![\w/\-`]|\.\w)/g, 'Fasilitas Umum'],
];

/** Approved wording for a refused template attach (indicators.service `assertTemplateAttachable`). */
export const TEMPLATE_ATTACH_MESSAGE =
  'Templat kalimat hanya bisa dipakai pada indikator yang memiliki nilai dan periode sebelumnya.';

/** Approved wording for an orphaned half of the previous value/period pair. */
export const PREVIOUS_PAIR_MESSAGE = 'Nilai dan periode sebelumnya harus diisi berpasangan.';

/** Approved wording for a computed-comparison indicator that lacks its previous value/period. */
export const PREVIOUS_REQUIRED_MESSAGE =
  'Nilai dan periode sebelumnya harus diisi untuk indikator perbandingan.';

export const UNKNOWN_FIELD_MESSAGE =
  'Ada isian yang tidak dikenali. Muat ulang halaman lalu coba lagi.';
export const INPUT_MISMATCH_MESSAGE = 'Isian belum sesuai. Periksa kembali isian yang ditandai.';
export const CSV_FORMAT_MESSAGE =
  'Format berkas CSV tidak sesuai. Unduh contoh berkas lalu coba lagi.';
export const RT_CONFLICT_MESSAGE =
  'Data Ketua RT/RT bertentangan. Periksa kembali koordinat dan RT yang dipilih.';

const TEMPLATE_ATTACH_SOURCE =
  /^Template perbandingan (?:membutuhkan value_previous|hanya dapat dipakai pada indikator perbandingan terkomputasi)/;
const PREVIOUS_PAIR_SOURCE = /^value_previous dan period_previous harus diisi berpasangan/;
const PREVIOUS_REQUIRED_SOURCE =
  /^Indikator perbandingan terkomputasi membutuhkan (?:value_previous|period_previous)/;
const CSV_HEADER_SOURCE = /^Header CSV harus\b/;
const RT_INVARIANT_SOURCE = /^Invariant (?:Ketua RT|ketua_rt)\/RT dilanggar/i;
const UNRECOGNIZED_SOURCE = /^Terdapat bidang .{0,60}\byang tidak dikenali\b|Unrecognized keys?\b/i;
const VALIDATION_PREFIX = /^Validasi [^:]{1,60} gagal:/i;

/** Zod's default English wording, which must never reach an operator. */
const ZOD_PATTERNS: readonly RegExp[] = [
  /(?:^|[\s:,;])(?:Invalid (?:input|option|type|value|enum)|Too (?:big|small)|Unrecognized keys?|Required|Expected|Unexpected)\b/,
  /^Invalid\b/,
  /^(?:String|Number|Array) must\b/,
  /\breceived (?:undefined|null|number|string|object|array|boolean|nan)\b/i,
  /\bexpected (?:one of|string|number|boolean|object|array|record)\b/i,
];

const QUOTED_ID =
  /"(?:c[a-z0-9]{20,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/gi;

function readableServerMessage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (text === '' || text.length > MAX_SERVER_MESSAGE_LENGTH) return undefined;
  if (TEMPLATE_ATTACH_SOURCE.test(text)) return TEMPLATE_ATTACH_MESSAGE;
  if (PREVIOUS_PAIR_SOURCE.test(text)) return PREVIOUS_PAIR_MESSAGE;
  if (PREVIOUS_REQUIRED_SOURCE.test(text)) return PREVIOUS_REQUIRED_MESSAGE;
  if (CSV_HEADER_SOURCE.test(text)) return CSV_FORMAT_MESSAGE;
  if (RT_INVARIANT_SOURCE.test(text)) return RT_CONFLICT_MESSAGE;
  if (UNRECOGNIZED_SOURCE.test(text)) return UNKNOWN_FIELD_MESSAGE;
  if (ZOD_PATTERNS.some((pattern) => pattern.test(text))) {
    return VALIDATION_PREFIX.test(text) ? INPUT_MISMATCH_MESSAGE : undefined;
  }
  const friendly = FRIENDLY_TERMS.reduce(
    (acc, [pattern, term]) => acc.replace(pattern, term),
    text.replace(QUOTED_ID, '').replace(/ {2,}/g, ' '),
  );
  return HIDDEN_TOKEN_PATTERN.test(friendly.toLowerCase()) ? undefined : friendly;
}

/**
 * Maps any failure to approved user-facing text.
 *
 * @param error   Whatever was thrown: an ApiError, a fetch() rejection, or anything else.
 * @param context Optional action phrase, e.g. `'menyimpan indikator'`, which turns the result
 *                into `Gagal menyimpan indikator. <approved text>`.
 * @param method  HTTP method of the request, for callers whose error carries none (a raw
 *                `fetch()` rejection). Pass `'GET'` for reads so the text does not claim that
 *                changes were not saved. An `ApiError` already records its own method.
 */
export function toUserMessage(error: unknown, context?: string, method?: string): UserMessage {
  const { kind, status } = classifyFailure(error);
  const phrase = context?.trim().replace(/\.+$/, '');
  const record =
    typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {};
  const fieldErrors = kind === 'validation' ? sanitizeFieldErrors(record['fieldErrors']) : {};
  // Validation failures are the one place the server's own sentence is shown: the backend
  // answers 400/422 with a short, user-oriented Indonesian reason ("Judul tidak boleh memuat
  // HTML"). Every other status keeps approved wording so 5xx/SQL/stack text never leaks.
  const base =
    kind === 'validation' && Object.keys(fieldErrors).length === 0
      ? (readableServerMessage(record['serverMessage']) ?? USER_MESSAGES.validation)
      : approvedMessage(kind, record['method'] ?? method);
  const message = phrase ? `Gagal ${phrase}. ${base}` : base;

  return { message, kind, status, fieldErrors };
}
