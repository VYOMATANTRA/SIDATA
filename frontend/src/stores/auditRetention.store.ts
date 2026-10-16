import { defineStore } from 'pinia';
import { ref } from 'vue';
import { authFetch } from '../utils/authFetch';
import { getCsrfToken } from '../utils/csrf';

export interface AuditRetentionPolicy {
  info: number;
  warning: number;
  critical: number;
}

export const MAX_RETENTION_DAYS = 36500; // 100 years

/**
 * Validates retention policy per SPEC §3:
 * - Whole days (non-negative integers).
 * - Maximum 36500 days.
 * - critical >= warning >= info (treating 0 as infinite).
 * Returns an error message string if invalid, or null if valid.
 */
export function validateRetentionPolicy(policy: AuditRetentionPolicy): string | null {
  const fields: Array<{ key: keyof AuditRetentionPolicy; label: string }> = [
    { key: 'info', label: 'info' },
    { key: 'warning', label: 'warning' },
    { key: 'critical', label: 'critical' },
  ];

  for (const { key, label } of fields) {
    const val = policy[key];
    if (typeof val !== 'number' || !Number.isInteger(val) || val < 0) {
      return `Nilai retensi "${label}" harus berupa bilangan bulat non-negatif (0 = simpan selamanya).`;
    }
    if (val > MAX_RETENTION_DAYS) {
      return `Nilai retensi "${label}" maksimal ${MAX_RETENTION_DAYS} hari (100 tahun). Gunakan 0 untuk menyimpan selamanya.`;
    }
  }

  // 0 means keep forever (treat as Infinity)
  const effective = (value: number) => (value === 0 ? Infinity : value);

  if (
    effective(policy.info) > effective(policy.warning) ||
    effective(policy.warning) > effective(policy.critical)
  ) {
    return 'Retensi critical harus >= warning >= info. Kejadian yang lebih parah tidak boleh dihapus lebih cepat daripada kejadian yang lebih ringan.';
  }

  return null;
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
  const successMessage = ref<string | null>(null);

  async function fetchRetention(): Promise<boolean> {
    isLoading.value = true;
    error.value = null;

    try {
      const res = await authFetch('/api/settings/audit-retention', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Gagal memuat pengaturan retensi audit (HTTP ${res.status})`);
      }

      const data = await res.json();
      if (data && typeof data === 'object' && data.retention) {
        retention.value = {
          info: Number(data.retention.info) || 0,
          warning: Number(data.retention.warning) || 0,
          critical: Number(data.retention.critical) || 0,
        };
      }
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Terjadi kesalahan jaringan saat memuat retensi audit.';
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function updateRetention(policy: AuditRetentionPolicy): Promise<boolean> {
    const validationError = validateRetentionPolicy(policy);
    if (validationError) {
      error.value = validationError;
      return false;
    }

    isSaving.value = true;
    error.value = null;
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
        throw new Error(body.error || `Gagal memperbarui pengaturan retensi audit (HTTP ${res.status})`);
      }

      const data = await res.json();
      if (data && typeof data === 'object' && data.retention) {
        retention.value = {
          info: Number(data.retention.info) || 0,
          warning: Number(data.retention.warning) || 0,
          critical: Number(data.retention.critical) || 0,
        };
      }
      successMessage.value = data.message || 'Pengaturan retensi audit log berhasil diperbarui.';
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Terjadi kesalahan jaringan saat memperbarui retensi audit.';
      return false;
    } finally {
      isSaving.value = false;
    }
  }

  function clearMessages() {
    error.value = null;
    successMessage.value = null;
  }

  return {
    retention,
    isLoading,
    isSaving,
    error,
    successMessage,
    fetchRetention,
    updateRetention,
    clearMessages,
  };
});
