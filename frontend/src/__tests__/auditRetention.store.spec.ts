import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import {
  useAuditRetentionStore,
  validateRetentionPolicy,
  type AuditRetentionPolicy,
} from '../stores/auditRetention.store';
import { useAuthStore } from '../stores/auth';

describe('validateRetentionPolicy helper', () => {
  it('rejects negative numbers', () => {
    expect(validateRetentionPolicy({ info: -1, warning: 30, critical: 60 })).toMatch(/non-negatif/i);
    expect(validateRetentionPolicy({ info: 30, warning: -5, critical: 60 })).toMatch(/non-negatif/i);
    expect(validateRetentionPolicy({ info: 30, warning: 60, critical: -10 })).toMatch(/non-negatif/i);
  });

  it('rejects non-integer floating point numbers', () => {
    expect(validateRetentionPolicy({ info: 1.5, warning: 30, critical: 60 })).toMatch(/bilangan bulat/i);
    expect(validateRetentionPolicy({ info: 10, warning: 30.2, critical: 60 })).toMatch(/bilangan bulat/i);
  });

  it('rejects values exceeding max allowable days (36500)', () => {
    expect(validateRetentionPolicy({ info: 36501, warning: 36501, critical: 36501 })).toMatch(/36500/i);
  });

  it('rejects invalid ordering where finite info > finite warning', () => {
    const error = validateRetentionPolicy({ info: 60, warning: 30, critical: 90 });
    expect(error).toMatch(/critical.*warning.*info/i);
  });

  it('rejects invalid ordering where finite warning > finite critical', () => {
    const error = validateRetentionPolicy({ info: 30, warning: 120, critical: 90 });
    expect(error).toMatch(/critical.*warning.*info/i);
  });

  it('rejects 0 (infinite) info paired with finite warning', () => {
    // 0 is infinite, so info=0 means info outlives warning=30, which is forbidden
    const error = validateRetentionPolicy({ info: 0, warning: 30, critical: 90 });
    expect(error).toMatch(/critical.*warning.*info/i);
  });

  it('rejects 0 (infinite) warning paired with finite critical', () => {
    // warning=0 means warning outlives critical=90, which is forbidden
    const error = validateRetentionPolicy({ info: 30, warning: 0, critical: 90 });
    expect(error).toMatch(/critical.*warning.*info/i);
  });

  it('accepts valid finite ordering: info <= warning <= critical (happy path)', () => {
    expect(validateRetentionPolicy({ info: 30, warning: 60, critical: 90 })).toBeNull();
    expect(validateRetentionPolicy({ info: 30, warning: 30, critical: 30 })).toBeNull();
  });

  it('accepts valid 0 (infinite) configurations (happy path)', () => {
    // All infinite
    expect(validateRetentionPolicy({ info: 0, warning: 0, critical: 0 })).toBeNull();
    // Only critical is infinite
    expect(validateRetentionPolicy({ info: 30, warning: 60, critical: 0 })).toBeNull();
    // Warning and critical are infinite
    expect(validateRetentionPolicy({ info: 30, warning: 0, critical: 0 })).toBeNull();
  });
});

describe('useAuditRetentionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('handles fetchRetention network or server error (non-happy path)', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Terjadi kesalahan internal server' }),
    } as Response);

    const store = useAuditRetentionStore();
    await store.fetchRetention();

    expect(store.error).toBe('Terjadi kesalahan internal server');
    expect(store.isLoading).toBe(false);
  });

  it('handles updateRetention validation or server error response (non-happy path)', async () => {
    // Mock CSRF token
    globalThis.fetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrfToken: 'fake-csrf-token' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error:
            'Retensi critical harus >= warning >= info. Kejadian yang lebih parah tidak boleh dihapus lebih cepat daripada kejadian yang lebih ringan.',
        }),
      } as Response);

    const store = useAuditRetentionStore();
    const badPolicy: AuditRetentionPolicy = { info: 60, warning: 30, critical: 90 };

    const success = await store.updateRetention(badPolicy);
    expect(success).toBe(false);
    expect(store.error).toContain('Retensi critical harus >= warning >= info');
    expect(store.isSaving).toBe(false);
  });

  it('successfully fetches and updates retention settings (happy path)', async () => {
    const authStore = useAuthStore();
    authStore.setAuth({ id: 'admin-1', email: 'admin@example.com', role: 'admin' }, 'valid-token');

    // 1. Fetch happy path
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        retention: { info: 30, warning: 90, critical: 365 },
      }),
    } as Response);

    const store = useAuditRetentionStore();
    await store.fetchRetention();

    expect(store.error).toBeNull();
    expect(store.retention).toEqual({ info: 30, warning: 90, critical: 365 });

    // 2. Update happy path
    const updatedPolicy: AuditRetentionPolicy = { info: 60, warning: 120, critical: 0 };
    globalThis.fetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrfToken: 'fake-csrf-token' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          message: 'Pengaturan retensi audit log berhasil diperbarui.',
          retention: updatedPolicy,
        }),
      } as Response);

    const success = await store.updateRetention(updatedPolicy);
    expect(success).toBe(true);
    expect(store.retention).toEqual(updatedPolicy);
    expect(store.successMessage).toBe('Pengaturan retensi audit log berhasil diperbarui.');

    // 3. Subsequent fetch resets successMessage to null
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        retention: updatedPolicy,
      }),
    } as Response);

    await store.fetchRetention();
    expect(store.successMessage).toBeNull();
  });
});
