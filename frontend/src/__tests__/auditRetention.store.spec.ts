import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import {
  useAuditRetentionStore,
  validateRetentionPolicy,
  parseRetention,
  type AuditRetentionPolicy,
} from '../stores/auditRetention.store';
import { useAuthStore } from '../stores/auth';

describe('validateRetentionPolicy helper', () => {
  it('rejects negative numbers', () => {
    expect(validateRetentionPolicy({ info: -1, warning: 30, critical: 60 })).toMatch(
      /non-negatif/i,
    );
    expect(validateRetentionPolicy({ info: 30, warning: -5, critical: 60 })).toMatch(
      /non-negatif/i,
    );
    expect(validateRetentionPolicy({ info: 30, warning: 60, critical: -10 })).toMatch(
      /non-negatif/i,
    );
  });

  it('rejects non-integer floating point numbers', () => {
    expect(validateRetentionPolicy({ info: 1.5, warning: 30, critical: 60 })).toMatch(
      /bilangan bulat/i,
    );
    expect(validateRetentionPolicy({ info: 10, warning: 30.2, critical: 60 })).toMatch(
      /bilangan bulat/i,
    );
  });

  it('rejects values exceeding max allowable days (36500)', () => {
    expect(validateRetentionPolicy({ info: 36501, warning: 36501, critical: 36501 })).toMatch(
      /36500/i,
    );
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

describe('parseRetention helper', () => {
  it('returns null for non-object or nullish inputs', () => {
    expect(parseRetention(null)).toBeNull();
    expect(parseRetention(undefined)).toBeNull();
    expect(parseRetention('invalid')).toBeNull();
    expect(parseRetention(123)).toBeNull();
    expect(parseRetention([])).toBeNull();
  });

  it('returns null when any required severity field is missing or null', () => {
    expect(parseRetention({})).toBeNull();
    expect(parseRetention({ info: null, warning: 30, critical: 60 })).toBeNull();
    expect(parseRetention({ info: 30, warning: undefined, critical: 60 })).toBeNull();
    expect(parseRetention({ info: 30, warning: 60 })).toBeNull(); // critical missing
  });

  it('returns null when fields contain non-integer, negative, or non-number values', () => {
    expect(parseRetention({ info: '30', warning: 60, critical: 90 })).toBeNull();
    expect(parseRetention({ info: 30, warning: 'abc', critical: 90 })).toBeNull();
    expect(parseRetention({ info: -5, warning: 30, critical: 60 })).toBeNull();
    expect(parseRetention({ info: 1.5, warning: 30, critical: 60 })).toBeNull();
    expect(parseRetention({ info: NaN, warning: 30, critical: 60 })).toBeNull();
  });

  it('returns null when hierarchy or max limit is violated', () => {
    expect(parseRetention({ info: 60, warning: 30, critical: 90 })).toBeNull();
    expect(parseRetention({ info: 0, warning: 30, critical: 90 })).toBeNull();
    expect(parseRetention({ info: 36501, warning: 36501, critical: 36501 })).toBeNull();
  });

  it('returns parsed policy for valid values', () => {
    expect(parseRetention({ info: 30, warning: 60, critical: 90 })).toEqual({
      info: 30,
      warning: 60,
      critical: 90,
    });
    expect(parseRetention({ info: 0, warning: 0, critical: 0 })).toEqual({
      info: 0,
      warning: 0,
      critical: 0,
    });
    expect(parseRetention({ info: 30, warning: 60, critical: 0 })).toEqual({
      info: 30,
      warning: 60,
      critical: 0,
    });
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

  it('rejects malformed retention payload in fetchRetention without coercing to 0 (non-happy path)', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        retention: { info: null, warning: 'abc' },
      }),
    } as Response);

    const store = useAuditRetentionStore();
    // Pre-populate retention with sentinel non-zero values to ensure it is not overwritten
    store.retention = { info: 10, warning: 20, critical: 30 };

    const success = await store.fetchRetention();

    expect(success).toBe(false);
    expect(store.error).toMatch(/tidak valid/i);
    expect(store.retention).toEqual({ info: 10, warning: 20, critical: 30 });
    expect(store.isLoading).toBe(false);
  });

  it('handles null body on 2xx PATCH response gracefully without throwing (happy path)', async () => {
    const authStore = useAuthStore();
    authStore.setAuth({ id: 'admin-1', email: 'admin@example.com', role: 'admin' }, 'valid-token');

    globalThis.fetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrfToken: 'fake-csrf-token' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => null,
      } as Response);

    const store = useAuditRetentionStore();
    const policy: AuditRetentionPolicy = { info: 30, warning: 60, critical: 90 };

    const success = await store.updateRetention(policy);

    expect(success).toBe(true);
    expect(store.error).toBeNull();
    expect(store.successMessage).toBe('Pengaturan retensi audit log berhasil diperbarui.');
    expect(store.retention).toEqual({ info: 30, warning: 60, critical: 90 });
    expect(store.isSaving).toBe(false);
  });

  it('rejects malformed retention payload in updateRetention without corrupting store state (non-happy path)', async () => {
    const authStore = useAuthStore();
    authStore.setAuth({ id: 'admin-1', email: 'admin@example.com', role: 'admin' }, 'valid-token');

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
          message: 'Policy saved',
          retention: { info: null, warning: 60, critical: 90 },
        }),
      } as Response);

    const store = useAuditRetentionStore();
    store.retention = { info: 10, warning: 20, critical: 30 };
    const policy: AuditRetentionPolicy = { info: 30, warning: 60, critical: 90 };

    const success = await store.updateRetention(policy);

    expect(success).toBe(false);
    expect(store.error).toMatch(/tidak valid/i);
    expect(store.retention).toEqual({ info: 10, warning: 20, critical: 30 });
    expect(store.isSaving).toBe(false);
  });
});
