/**
 * The MariaDB driver adapter reports every connection failure the same way — a pool
 * acquire timeout with "pool connections: active=0 idle=0" — whether the server is
 * down, still booting, or rejecting the credentials. The reason that actually matters
 * is buried further down the error chain, at `meta.driverAdapterError.cause.cause`.
 *
 * These helpers dig it out so a failing script can say what went wrong instead of
 * leaving the reader to guess from a pool timeout.
 */

/** Driver codes that mean "the database is not reachable yet" — waiting may help. */
const RETRYABLE_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'ECONNRESET',
  'EPIPE',
  'PROMISEDB',
  '45028',
]);

/**
 * Signatures of a rejected credential. The driver reports these as a plain string
 * with no code of its own, so they have to be recognised by their text.
 */
const CREDENTIAL_FAILURE_PATTERNS = [
  'access denied',
  'er_access_denied_error',
  'sqlstate: 28000',
  'authentication plugin',
];

export interface DbConnectionFailure {
  /** The deepest message in the chain — the actual reason the connection failed. */
  reason: string;
  /** The driver's machine-readable code, when it provided one. */
  code?: string;
  /** True when the database looks unreachable rather than misconfigured. */
  retryable: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Driver codes arrive as a string ("ECONNREFUSED") or a number (45028). */
function asCode(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

/**
 * Walks the error chain and returns the deepest reason it carries. The driver sets
 * the innermost cause to a plain string ("connect ECONNREFUSED 127.0.0.1:3306"),
 * so string nodes have to be handled alongside error objects.
 */
function deepestCause(error: unknown): { message: string; code?: string } | null {
  let current: unknown = error;
  let message: string | undefined;
  let code: string | undefined;
  const seen = new Set<unknown>();

  while (current !== undefined && current !== null && !seen.has(current)) {
    seen.add(current);

    if (typeof current === 'string') {
      message = current;
      break;
    }

    const record = asRecord(current);
    if (!record) break;

    const nodeMessage = asString(record['message']);
    if (nodeMessage) {
      message = nodeMessage;
      code = asCode(record['code']) ?? code;
    }

    const adapter = asRecord(asRecord(record['meta'])?.['driverAdapterError']);
    current =
      record['cause'] ?? adapter?.['cause'] ?? asRecord(adapter?.['cause'])?.['cause'] ?? null;
  }

  if (!message) return null;
  return code ? { message, code } : { message };
}

/**
 * Describes why a database call failed. Returns `null` when the error is not a
 * connection failure, so callers can let unrelated errors through untouched.
 */
export function describeDbConnectionFailure(error: unknown): DbConnectionFailure | null {
  const adapter = asRecord(asRecord(error)?.['meta'])?.['driverAdapterError'];
  const adapterCode = asCode(asRecord(adapter)?.['code']);
  const adapterMessage =
    asString(asRecord(adapter)?.['originalMessage']) ?? asString(asRecord(adapter)?.['message']);

  // A pool acquire timeout is the adapter's generic connection failure.
  const looksLikeConnectionFailure =
    adapterCode === '45028' ||
    adapterMessage?.includes('pool timeout') === true ||
    adapterMessage?.includes('failed to retrieve a connection from pool') === true;

  if (!looksLikeConnectionFailure) return null;

  const deepest = deepestCause(error);
  const reason = deepest?.message ?? adapterMessage ?? 'unknown';
  const code = deepest?.code ?? adapterCode;
  const trimmedReason = reason.split('\n')[0] ?? 'unknown';
  const lowered = trimmedReason.toLowerCase();

  // A rejected credential never resolves by waiting, so it must not be retried.
  const rejectedCredentials = CREDENTIAL_FAILURE_PATTERNS.some((pattern) =>
    lowered.includes(pattern),
  );

  const failure: DbConnectionFailure = {
    reason: trimmedReason,
    retryable: !rejectedCredentials && (code === undefined || RETRYABLE_CODES.has(code)),
  };
  if (code !== undefined) failure.code = code;
  return failure;
}

/** A one-line explanation a developer can act on. */
export function formatDbConnectionFailure(failure: DbConnectionFailure): string {
  // The generic pool code adds nothing; the reason below it is what matters.
  const detail =
    failure.code && failure.code !== '45028'
      ? `${failure.code}: ${failure.reason}`
      : failure.reason;
  if (failure.retryable) {
    return `Tidak dapat terhubung ke database — ${detail}. Apakah MySQL sudah berjalan?`;
  }
  return `Koneksi database ditolak — ${detail}. Periksa kredensial pada DATABASE_URL.`;
}
