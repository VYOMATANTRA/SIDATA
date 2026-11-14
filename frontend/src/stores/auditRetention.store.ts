import { defineStore } from 'pinia';
import { ref } from 'vue';
import { authFetch } from '../utils/authFetch';
import { getCsrfToken } from '../utils/csrf';
import { apiErrorFromBody } from '../utils/apiClient';
import { RETENTION_UNREADABLE_MESSAGE, toUserMessage, type FailureKind } from '../utils/userMessages';

export interface AuditRetentionPolicy {
  info: number;
  warning: number;
  critical: number;
}

export const MAX_RETENTION_DAYS = 36500; // 100 years

/** Words an Admin knows for each severity; the same labels the system log uses. */
export const SEVERITY_LABELS: Record<keyof AuditRetentionPolicy, string> = {
  info: 'Info',
  warning: 'Peringatan',
  critical: 'Kritis',
};

/** Shown when the order rule is broken, on the client and when the server refuses a save. */
export const RETENTION_ORDER_MESSAGE =
  'Log Kritis harus disimpan paling sedikit selama log Peringatan, dan log Peringatan paling sedikit selama log Info. Kejadian yang lebih penting tidak boleh dihapus lebih cepat.';

/** Approved wording when the server refuses a save (its own sentence quotes internal names). */
export const RETENTION_SAVE_REFUSED_MESSAGE = `Gagal menyimpan masa simpan log. ${RETENTION_ORDER_MESSAGE}`;

/**
 * Validates retention policy per SPEC §3:
 * - Whole days (non-negative integers).
 * - Maximum 36500 days.
 * - critical >= warning >= info (treating 0 as infinite).
 * Returns a plain-Indonesian error message string if invalid, or null if valid.
 */
export function validateRetentionPolicy(policy: AuditRetentionPolicy): string | null {
  const keys: Array<keyof AuditRetentionPolicy> = ['info', 'warning', 'critical'];

  for (const key of keys) {
    const val = policy[key];
    const label = SEVERITY_LABELS[key];
    if (typeof val !== 'number' || !Number.isInteger(val) || val < 0) {
      return `Masa simpan log ${label} harus berupa jumlah hari bulat. Pilih "Simpan selamanya" jika log tidak boleh dihapus.`;
    }
    if (val > MAX_RETENTION_DAYS) {
      return `Masa simpan log ${label} paling lama ${MAX_RETENTION_DAYS.toLocaleString('id-ID')} hari (100 tahun). Pilih "Simpan selamanya" jika log tidak boleh dihapus.`;
    }
  }

  // 0 means keep forever (treat as Infinity)
  const effective = (value: number) => (value === 0 ? Infinity : value);

  if (
    effective(policy.info) > effective(policy.warning) ||
    effective(policy.warning) > effective(policy.critical)
  ) {
    return RETENTION_ORDER_MESSAGE;
  }

  return null;
}

/**
 * Parses and validates an unknown raw retention payload from the server.
 * Ensures each field is a non-negative integer within allowable bounds
 * and satisfies the severity hierarchy (critical >= warning >= info).
 * Returns a valid AuditRetentionPolicy, or null if malformed or invalid.
 */
export function parseRetention(raw: unknown): AuditRetentionPolicy | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const keys: Array<keyof AuditRetentionPolicy> = ['info', 'warning', 'critical'];

  for (const key of keys) {
    const val = candidate[key];
    if (typeof val !== 'number' || !Number.isInteger(val) || val < 0) {
      return null;
    }
  }

  const policy: AuditRetentionPolicy = {
    info: candidate.info as number,
    warning: candidate.warning as number,
    critical: candidate.critical as number,
  };

  if (validateRetentionPolicy(policy) !== null) {
    return null;
  }

  return policy;
}

/**
 * Formats a retention period (in days) into human-readable Indonesian text:
 * - Returns '—' for non-number, NaN, nullish, or negative inputs.
 * - Returns 'Selamanya' for 0.
 * - Multiples of 365 -> 'X Tahun (Y hari)'.
 * - Multiples of 30 -> 'X Bulan (Y hari)'.
 * - Other positive integers -> 'X Hari'.
 */
export function formatDurationLabel(days: number | unknown): string {
  if (typeof days !== 'number' || Number.isNaN(days) || days < 0) {
    return '—';
  }
  if (days === 0) return 'Selamanya';
  if (days % 365 === 0) return `${days / 365} Tahun (${days} hari)`;
  if (days % 30 === 0) return `${days / 30} Bulan (${days} hari)`;
  return `${days} Hari`;
}

/** The server answered 200 with a retention payload this client cannot read. Our own text. */
class RetentionFormatError extends Error {
  constructor() {
    super(RETENTION_UNREADABLE_MESSAGE);
    this.name = 'RetentionFormatError';
  }
}

export const useAuditRetentionStore = defineStore('auditRetention', () => {
  const retention = ref<AuditRetentionPolicy>({
    info: 0,
    warning: 0,
    critical: 0,
  });

  const isLoading = ref(false);
  const isSaving = ref(false);
  const error = ref<string | null>(null);
  /** Failure class of `error` (load or save), for AlertBanner; null while `error` is null. */
  const errorKind = ref<FailureKind | null>(null);
  const successMessage = ref<string | null>(null);

  async function fetchRetention(): Promise<boolean> {
    isLoading.value = true;
    error.value = null;
    errorKind.value = null;
    successMessage.value = null;

    try {
      const res = await authFetch('/api/settings/audit-retention', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw apiErrorFromBody(res.status, body, 'GET');
      }

      const data = await res.json().catch(() => null);
      const parsed =
        data && typeof data === 'object'
          ? parseRetention((data as Record<string, unknown>).retention)
          : null;

      if (!parsed) {
        throw new RetentionFormatError();
      }

      retention.value = parsed;
      return true;
    } catch (err) {
      if (err instanceof RetentionFormatError) {
        error.value = err.message;
        errorKind.value = 'unknown';
      } else {
        const mapped = toUserMessage(err, 'memuat masa simpan log', 'GET');
        error.value = mapped.message;
        errorKind.value = mapped.kind;
      }
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function updateRetention(policy: AuditRetentionPolicy): Promise<boolean> {
    const validationError = validateRetentionPolicy(policy);
    if (validationError) {
      error.value = validationError;
      errorKind.value = 'validation';
      return false;
    }

    isSaving.value = true;
    error.value = null;
    errorKind.value = null;
    successMessage.value = null;

    try {
      const csrfToken = await getCsrfToken();
      const res = await authFetch('/api/settings/audit-retention', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify(policy),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw apiErrorFromBody(res.status, body, 'PATCH');
      }

      const data = await res.json().catch(() => null);
      if (data && typeof data === 'object') {
        const record = data as Record<string, unknown>;
        if (record.retention !== undefined && record.retention !== null) {
          const parsed = parseRetention(record.retention);
          if (!parsed) {
            throw new RetentionFormatError();
          }
          retention.value = parsed;
        } else {
          retention.value = { ...policy };
        }
      } else {
        retention.value = { ...policy };
      }

      successMessage.value = 'Masa simpan log berhasil disimpan.';
      return true;
    } catch (err) {
      if (err instanceof RetentionFormatError) {
        error.value = err.message;
        errorKind.value = 'unknown';
      } else {
        const mapped = toUserMessage(err, 'menyimpan masa simpan log');
        errorKind.value = mapped.kind;
        error.value =
          mapped.kind === 'validation' ? RETENTION_SAVE_REFUSED_MESSAGE : mapped.message;
      }
      return false;
    } finally {
      isSaving.value = false;
    }
  }

  function clearMessages() {
    error.value = null;
    errorKind.value = null;
    successMessage.value = null;
  }

  return {
    retention,
    isLoading,
    isSaving,
    error,
    errorKind,
    successMessage,
    fetchRetention,
    updateRetention,
    clearMessages,
  };
});
