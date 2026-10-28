import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../stores/auth';
import {
  apiFetch,
  apiRequestJson,
  REFRESH_UNAVAILABLE_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
} from '../utils/apiClient';

const EDITOR = { id: 'u-1', email: 'editor@example.com', role: 'editor' };

function json(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function refreshOk(token: string): Response {
  return json({ accessToken: token, user: EDITOR });
}

function signIn(token: string): ReturnType<typeof useAuthStore> {
  const store = useAuthStore();
  store.setAuth(EDITOR, token);
  return store;
}

describe('apiClient', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('leaves a non-401 response alone and does not refresh', async () => {
    const store = signIn('still-valid');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({ indicators: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await apiFetch('/api/indicators');

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.accessToken).toBe('still-valid');
  });

  it('refreshes once and replays the save with the new token', async () => {
    const store = signIn('expired-token');
    const saveAuthHeaders: Array<string | null> = [];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/auth/csrf-token') return json({ csrfToken: 'csrf-token' });
      if (url === '/api/auth/refresh') return refreshOk('fresh-token');

      saveAuthHeaders.push(new Headers(init?.headers).get('Authorization'));
      return saveAuthHeaders.length === 1
        ? json({ error: 'Token kedaluwarsa' }, 401)
        : json({ indicator: { id: 'ind-1' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await apiFetch('/api/indicators/ind-1', {
      method: 'PATCH',
      body: JSON.stringify({ label: 'Jumlah Penduduk' }),
    });

    expect(response.status).toBe(200);
    expect(saveAuthHeaders).toEqual(['Bearer expired-token', 'Bearer fresh-token']);
    expect(store.accessToken).toBe('fresh-token');

    const refreshCalls = fetchMock.mock.calls.filter(
      ([input]) => String(input) === '/api/auth/refresh',
    );
    expect(refreshCalls).toHaveLength(1);

    // The replay is still a mutating request, so it must carry a fresh CSRF header.
    const calls = fetchMock.mock.calls;
    const replayInit = calls[calls.length - 1]?.[1];
    expect(new Headers(replayInit?.headers).get('x-csrf-token')).toBe('csrf-token');
  });

  it('replays at most once, so a second 401 is returned to the caller', async () => {
    signIn('expired-token');
    let refreshCalls = 0;
    let dataCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input);
        if (url === '/api/auth/csrf-token') return json({ csrfToken: 'csrf-token' });
        if (url === '/api/auth/refresh') {
          refreshCalls++;
          return refreshOk('fresh-token');
        }
        dataCalls++;
        return json({ error: 'Token tidak valid' }, 401);
      }),
    );

    const response = await apiFetch('/api/indicators');

    expect(response.status).toBe(401);
    expect(dataCalls).toBe(2);
    expect(refreshCalls).toBe(1);
  });

  it('returns the original 401 and clears the session when the refresh is denied', async () => {
    const store = signIn('expired-token');
    let dataCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input);
        if (url === '/api/auth/csrf-token') return json({ csrfToken: 'csrf-token' });
        if (url === '/api/auth/refresh') {
          return json({ error: 'Refresh token sudah dicabut' }, 403);
        }
        dataCalls++;
        return json({ error: 'Token tidak valid' }, 401);
      }),
    );

    const response = await apiFetch('/api/indicators');

    expect(response.status).toBe(401);
    expect(dataCalls).toBe(1);
    expect(store.accessToken).toBeNull();
    expect(store.isAuthenticated).toBe(false);
  });

  it('never refreshes a request that was sent without a token', async () => {
    useAuthStore();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (String(input) === '/api/auth/refresh') {
        throw new Error('refresh must not be attempted without a session');
      }
      return json({ error: 'Token akses tidak ditemukan' }, 401);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await apiFetch('/api/indicators');

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shares one refresh across concurrent 401s and replays each request', async () => {
    signIn('expired-token');
    let refreshCalls = 0;
    const attempts = new Map<string, number>();
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input);
        if (url === '/api/auth/csrf-token') return json({ csrfToken: 'csrf-token' });
        if (url === '/api/auth/refresh') {
          refreshCalls++;
          await Promise.resolve();
          return refreshOk('fresh-token');
        }
        const attempt = (attempts.get(url) ?? 0) + 1;
        attempts.set(url, attempt);
        return attempt === 1 ? json({ error: 'Token kedaluwarsa' }, 401) : json({ ok: true });
      }),
    );

    const [first, second] = await Promise.all([
      apiFetch('/api/indicators'),
      apiFetch('/api/indicator-tables'),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(refreshCalls).toBe(1);
  });

  it('skips the refresh when another request already replaced the token', async () => {
    const store = signIn('expired-token');
    let dataCalls = 0;
    const replayedAuthHeaders: Array<string | null> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
        if (String(input) === '/api/auth/refresh') {
          throw new Error('the token was already rotated, refresh must not run');
        }
        dataCalls++;
        if (dataCalls === 1) {
          // Simulate a concurrent request completing its refresh while this one was in flight.
          store.setAuth(EDITOR, 'rotated-token');
          return json({ error: 'Token kedaluwarsa' }, 401);
        }
        replayedAuthHeaders.push(new Headers(init?.headers).get('Authorization'));
        return json({ ok: true });
      }),
    );

    const response = await apiFetch('/api/indicators');

    expect(response.status).toBe(200);
    expect(replayedAuthHeaders).toEqual(['Bearer rotated-token']);
  });

  it('turns a 401 that survives the refresh into a session-expired ApiError', async () => {
    signIn('expired-token');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input);
        if (url === '/api/auth/csrf-token') return json({ csrfToken: 'csrf-token' });
        if (url === '/api/auth/refresh') {
          return json({ error: 'Refresh token tidak ditemukan' }, 401);
        }
        return json({ error: 'Token tidak valid' }, 401);
      }),
    );

    await expect(apiRequestJson('/api/indicators')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: SESSION_EXPIRED_MESSAGE,
    });
  });

  it('reports a connection problem instead of an expired session when the refresh is unavailable', async () => {
    const store = signIn('expired-token');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input);
        if (url === '/api/auth/csrf-token') return json({ csrfToken: 'csrf-token' });
        if (url === '/api/auth/refresh') return json({ error: 'boom' }, 503);
        return json({ error: 'Token tidak valid' }, 401);
      }),
    );

    await expect(apiRequestJson('/api/indicators')).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
      message: REFRESH_UNAVAILABLE_MESSAGE,
    });
    // The session was never rejected, so the token stays in memory for the next attempt.
    expect(store.accessToken).toBe('expired-token');
  });

  it('keeps the server message for non-401 failures', async () => {
    signIn('still-valid');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(json({ error: 'Label sudah dipakai' }, 409)),
    );

    await expect(
      apiRequestJson('/api/indicators/ind-1', { method: 'PATCH', body: '{}' }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      message: 'Label sudah dipakai',
    });
  });
});
