import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../stores/auth';
import {
  ApiError,
  apiRequestJson,
  REFRESH_UNAVAILABLE_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
} from '../utils/apiClient';
import {
  CSRF_INVALID_MESSAGE,
  READ_USER_MESSAGES,
  SESSION_EXPIRED_NEUTRAL_MESSAGE,
  toUserMessage,
  USER_MESSAGES,
} from '../utils/userMessages';

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

  it('uses the concurrent-edit wording only when the server reports a stale write', async () => {
    const stale = await failureOf(json({ error: 'Data sudah berubah', code: 'STALE_WRITE' }, 409));
    const duplicate = await failureOf(json({ error: 'Email ini sudah dipakai' }, 409));

    expect(stale.userMessage).toBe(USER_MESSAGES.stale);
    expect(duplicate.userMessage).toBe(USER_MESSAGES.conflict);
    expect(duplicate.userMessage).not.toContain('diubah oleh orang lain');
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
    // A 422 without a field map shows the server's own sentence.
    expect(error.userMessage).toBe('Body template memuat kata tren di luar slot {trend}.');
    expect(error.serverMessage).toBe('Body template memuat kata tren di luar slot {trend}.');
  });

  it.each([
    [403, 'Anda tidak memiliki izin untuk tindakan ini.', 'Akses ditolak oleh policy role'],
    [404, 'Data yang dicari tidak ditemukan. Muat ulang halaman.', 'Row 42 not found'],
    [413, USER_MESSAGES.payload_too_large, 'entity.too.large 524288 bytes'],
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

  it('maps 403 with CSRF failure to CSRF_INVALID_MESSAGE', async () => {
    const error1 = await failureOf(json({ error: 'CSRF token tidak valid' }, 403));
    expect(error1.userMessage).toBe(CSRF_INVALID_MESSAGE);

    const error2 = await failureOf(json({ error: 'Forbidden', code: 'EBADCSRFTOKEN' }, 403));
    expect(error2.userMessage).toBe(CSRF_INVALID_MESSAGE);
  });

  it('shows the server sentence for a 400 without a field map', async () => {
    const error = await failureOf(json({ error: 'Judul halaman tidak boleh memuat HTML.' }, 400));

    expect(error.userMessage).toBe('Judul halaman tidak boleh memuat HTML.');
    expect(error.serverMessage).toBe('Judul halaman tidak boleh memuat HTML.');
    expect(error.fieldErrors).toEqual({});
  });

  it('falls back to the general text when a 400 body carries no message', async () => {
    const error = await failureOf(json({}, 400));

    expect(error.message).toBe('Permintaan gagal (HTTP 400).');
    expect(error.serverMessage).toBeUndefined();
    expect(error.userMessage).toBe(USER_MESSAGES.validation);
    expect(error.userMessage).not.toContain('HTTP 400');
  });

  it('shows only approved text for a 500 that carries a technical message', async () => {
    const raw =
      'PrismaClientKnownRequestError: SQLSTATE[23000] at Object.<anonymous> (/app/x.js:1)';
    const error = await failureOf(json({ error: raw }, 500));

    expect(error.userMessage).toBe(USER_MESSAGES.server);
    expect(error.userMessage).not.toContain('Prisma');
    expect(toUserMessage(error, 'menyimpan indikator').message).toBe(
      `Gagal menyimpan indikator. ${USER_MESSAGES.server}`,
    );
  });

  it('uses the concurrent-edit wording for the Ketua RT stale-ownership 409 the backend sends', async () => {
    const error = await failureOf(
      json(
        {
          error: 'Lokasi RT telah berubah. Muat ulang data RT sebelum menyimpan.',
          code: 'STALE_WRITE',
        },
        409,
      ),
    );

    expect(error.status).toBe(409);
    expect(error.code).toBe('STALE_WRITE');
    expect(error.userMessage).toBe(USER_MESSAGES.stale);
  });

  it('uses the neutral conflict wording for the RT-already-covered 409 (no code)', async () => {
    const error = await failureOf(
      json({ error: 'RT 5 sudah dicakup oleh titik ketua_rt lain (p-2)' }, 409),
    );

    expect(error.userMessage).toBe(USER_MESSAGES.conflict);
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

  it('parses numeric Retry-After response header into retryAfterSeconds', async () => {
    const response = {
      ok: false,
      status: 429,
      headers: new Headers({ 'retry-after': '120' }),
      json: async () => ({ error: 'Too many requests' }),
    } as unknown as Response;

    const error = await failureOf(response);

    expect(error.status).toBe(429);
    expect(error.retryAfterSeconds).toBe(120);
    expect(error.userMessage).toBe(USER_MESSAGES.rate_limited);
  });

  it('leaves retryAfterSeconds undefined when Retry-After is absent or non-numeric', async () => {
    const errorWithoutHeader = await failureOf(json({ error: 'Too many requests' }, 429));
    expect(errorWithoutHeader.retryAfterSeconds).toBeUndefined();

    const responseWithInvalid = {
      ok: false,
      status: 429,
      headers: new Headers({ 'retry-after': 'invalid' }),
      json: async () => ({ error: 'Too many requests' }),
    } as unknown as Response;

    const errorWithInvalid = await failureOf(responseWithInvalid);
    expect(errorWithInvalid.retryAfterSeconds).toBeUndefined();
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

    const readError = await apiRequestJson('/api/indicators').catch((e: unknown) => e);

    expect(readError).toBeInstanceOf(ApiError);
    expect((readError as ApiError).userMessage).toBe(SESSION_EXPIRED_NEUTRAL_MESSAGE);
    expect((readError as ApiError).message).toBe(SESSION_EXPIRED_MESSAGE);

    const writeError = await apiRequestJson('/api/indicators', { method: 'POST', body: '{}' }).catch(
      (e: unknown) => e,
    );

    expect(writeError).toBeInstanceOf(ApiError);
    expect((writeError as ApiError).userMessage).toBe(SESSION_EXPIRED_MESSAGE);
    expect((writeError as ApiError).message).toBe(SESSION_EXPIRED_MESSAGE);
  });

  it('maps a transient refresh failure to the server wording', async () => {
    useAuthStore().setAuth(EDITOR, 'expired-token');
    stubFetch((url) => {
      if (url === '/api/auth/refresh') return json({ error: 'boom' }, 503);
      return json({ error: 'Token tidak valid' }, 401);
    });

    const error = await apiRequestJson('/api/indicators').catch((e: unknown) => e);

    expect((error as ApiError).message).toBe(REFRESH_UNAVAILABLE_MESSAGE);
    expect((error as ApiError).userMessage).toBe(READ_USER_MESSAGES.server);
  });

  it('keeps the saving wording when a write hits a transient refresh failure', async () => {
    useAuthStore().setAuth(EDITOR, 'expired-token');
    stubFetch((url) => {
      if (url === '/api/auth/refresh') return json({ error: 'boom' }, 503);
      return json({ error: 'Token tidak valid' }, 401);
    });

    const error = await apiRequestJson('/api/indicators/ind-1', {
      method: 'PATCH',
      body: '{}',
    }).catch((e: unknown) => e);

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

  describe('network failures', () => {
    const offline = async (): Promise<never> => {
      throw new TypeError('Failed to fetch');
    };

    it('turns a fetch() rejection into a status-0 ApiError with the offline wording', async () => {
      stubFetch((url) => {
        if (url === '/api/indicators') return offline();
        return json({});
      });

      const error = await apiRequestJson('/api/indicators').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(0);
      expect((error as ApiError).code).toBe('NETWORK_ERROR');
      expect((error as ApiError).message).toBe(READ_USER_MESSAGES.network);
      expect((error as ApiError).userMessage).toBe(READ_USER_MESSAGES.network);
      expect((error as ApiError).userMessage).not.toContain('belum tersimpan');
      expect((error as ApiError).userMessage).not.toContain('Failed to fetch');
    });

    it('keeps the "belum tersimpan" wording when a write cannot reach the server', async () => {
      stubFetch(offline);

      const error = await apiRequestJson('/api/indicators/ind-1', {
        method: 'PATCH',
        body: '{}',
      }).catch((e: unknown) => e);

      expect((error as ApiError).method).toBe('PATCH');
      expect((error as ApiError).userMessage).toBe(USER_MESSAGES.network);
    });

    it('wraps a network failure on the replay after a refresh the same way', async () => {
      useAuthStore().setAuth(EDITOR, 'expired-token');
      let dataCalls = 0;
      stubFetch((url) => {
        if (url === '/api/auth/refresh') return json({ accessToken: 'fresh', user: EDITOR });
        dataCalls++;
        if (dataCalls === 1) return json({ error: 'Token tidak valid' }, 401);
        return offline();
      });

      const error = await apiRequestJson('/api/indicators').catch((e: unknown) => e);

      expect((error as ApiError).code).toBe('NETWORK_ERROR');
      expect((error as ApiError).userMessage).toBe(READ_USER_MESSAGES.network);
      expect(dataCalls).toBe(2);
    });

    it('lets an aborted request reject with its own AbortError', async () => {
      const abort = Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
      stubFetch(async () => {
        throw abort;
      });

      await expect(apiRequestJson('/api/indicators')).rejects.toBe(abort);
    });

    it('builds a contextual network banner without the browser text', async () => {
      stubFetch(offline);

      const error = await apiRequestJson('/api/indicators').catch((e: unknown) => e);
      const banner = toUserMessage(error, 'memuat indikator').message;

      expect(banner).toBe(`Gagal memuat indikator. ${READ_USER_MESSAGES.network}`);
      expect(banner).not.toContain('Failed to fetch');
    });
  });
});
