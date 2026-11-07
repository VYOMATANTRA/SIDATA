import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../stores/auth';
import {
  ApiError,
  apiRequestJson,
  REFRESH_UNAVAILABLE_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
} from '../utils/apiClient';
import { toUserMessage, USER_MESSAGES } from '../utils/userMessages';

const EDITOR = { id: 'u-1', email: 'editor@example.com', role: 'editor' };

function json(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

/** A proxy error page: the body is HTML, so parsing it as JSON fails. */
function htmlError(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON at position 0');
    },
  } as unknown as Response;
}

function stubFetch(handler: (url: string) => Response | Promise<Response>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/auth/csrf-token') return json({ csrfToken: 'csrf-token' });
      return handler(url);
    }),
  );
}

async function failureOf(response: Response): Promise<ApiError> {
  stubFetch(() => response);
  try {
    await apiRequestJson('/api/indicators/ind-1', { method: 'PATCH', body: '{}' });
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('expected apiRequestJson to reject');
}

describe('apiClient error object', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useAuthStore().setAuth(EDITOR, 'still-valid');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps the server text in message for existing callers but exposes userMessage', async () => {
    const error = await failureOf(json({ error: 'Label sudah dipakai' }, 409));

    expect(error.message).toBe('Label sudah dipakai');
    expect(error.userMessage).toBe(USER_MESSAGES.conflict);
    expect(error.userMessage).not.toContain('Label sudah dipakai');
  });

  it('keeps the original status and code available on the error', async () => {
    const error = await failureOf(
      json({ error: 'Label sudah dipakai', code: 'DUPLICATE_LABEL' }, 409),
    );

    expect(error.status).toBe(409);
    expect(error.code).toBe('DUPLICATE_LABEL');
  });

  it('keeps the TREND_KEYWORD_ACK_REQUIRED code and warnings for programmatic handling', async () => {
    const warnings = [{ ackKey: 'ack-1', matched: 'meningkat' }];
    const error = await failureOf(
      json(
        {
          error: 'Body template memuat kata tren di luar slot {trend}.',
          code: 'TREND_KEYWORD_ACK_REQUIRED',
          warnings,
        },
        422,
      ),
    );

    expect(error.status).toBe(422);
    expect(error.code).toBe('TREND_KEYWORD_ACK_REQUIRED');
    expect(error.body).toMatchObject({ warnings });
    expect(error.userMessage).toBe(USER_MESSAGES.validation);
    expect(error.userMessage).not.toContain('{trend}');
  });

  it.each([
    [403, 'Anda tidak memiliki izin untuk tindakan ini.', 'Akses ditolak oleh policy role'],
    [404, 'Data yang dicari tidak ditemukan. Muat ulang halaman.', 'Row 42 not found'],
    [413, 'Berkas terlalu besar.', 'entity.too.large 524288 bytes'],
    [429, 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.', 'rate limit bucket x'],
    [500, USER_MESSAGES.server, 'SQLSTATE[23000]: Duplicate entry'],
  ])(
    'maps HTTP %i to approved text without the raw server message',
    async (status, expected, raw) => {
      const error = await failureOf(json({ error: raw }, status));

      expect(error.userMessage).toBe(expected);
      expect(error.userMessage).not.toContain(raw);
      expect(error.message).toBe(raw);
      expect(error.status).toBe(status);
    },
  );

  it('shows the general validation text for a 400 without a field map', async () => {
    const error = await failureOf(json({ error: 'ID indikator tidak valid' }, 400));

    expect(error.userMessage).toBe('Periksa kembali isian yang ditandai.');
    expect(error.fieldErrors).toEqual({});
    expect(error.userMessage).not.toContain('ID indikator');
  });

  it('exposes a server field map as fieldErrors while keeping the general validation text', async () => {
    const error = await failureOf(
      json(
        {
          error: 'Validasi gagal',
          fieldErrors: { label: 'Label wajib diisi', value: ['Angka tidak valid'] },
        },
        422,
      ),
    );

    expect(error.userMessage).toBe('Periksa kembali isian yang ditandai.');
    expect(error.fieldErrors).toEqual({
      label: 'Label wajib diisi',
      value: 'Angka tidak valid',
    });
  });

  it('gives a non-JSON error page the server wording and a fallback message', async () => {
    const error = await failureOf(htmlError(502));

    expect(error.status).toBe(502);
    expect(error.message).toBe('Permintaan gagal (HTTP 502).');
    expect(error.userMessage).toBe(USER_MESSAGES.server);
    expect(error.userMessage).not.toContain('Unexpected token');
  });

  it('keeps the session-ended wording in userMessage when the refresh is denied', async () => {
    useAuthStore().setAuth(EDITOR, 'expired-token');
    stubFetch((url) => {
      if (url === '/api/auth/refresh') return json({ error: 'Refresh token sudah dicabut' }, 403);
      return json({ error: 'Token tidak valid' }, 401);
    });

    const error = await apiRequestJson('/api/indicators').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).userMessage).toBe(SESSION_EXPIRED_MESSAGE);
    expect((error as ApiError).message).toBe(SESSION_EXPIRED_MESSAGE);
  });

  it('maps a transient refresh failure to the server wording', async () => {
    useAuthStore().setAuth(EDITOR, 'expired-token');
    stubFetch((url) => {
      if (url === '/api/auth/refresh') return json({ error: 'boom' }, 503);
      return json({ error: 'Token tidak valid' }, 401);
    });

    const error = await apiRequestJson('/api/indicators').catch((e: unknown) => e);

    expect((error as ApiError).message).toBe(REFRESH_UNAVAILABLE_MESSAGE);
    expect((error as ApiError).userMessage).toBe(USER_MESSAGES.server);
  });

  it('writes the raw server text only to the dev console', async () => {
    await failureOf(json({ error: 'SQLSTATE[23000]: Duplicate entry' }, 500));

    expect(console.warn).toHaveBeenCalledWith(
      '[apiClient] request failed',
      expect.objectContaining({ status: 500, serverMessage: 'SQLSTATE[23000]: Duplicate entry' }),
    );
  });

  it('builds an action-specific banner from the error when a view supplies context', async () => {
    const error = await failureOf(json({ error: 'Label sudah dipakai' }, 409));

    const banner = toUserMessage(error, 'menyimpan indikator').message;

    expect(banner).toBe(`Gagal menyimpan indikator. ${USER_MESSAGES.conflict}`);
    expect(banner).not.toContain('Label sudah dipakai');
  });
});
