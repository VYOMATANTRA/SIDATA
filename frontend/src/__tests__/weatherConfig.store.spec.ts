import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  WEATHER_SAVE_REFUSED_MESSAGE,
  useWeatherConfigStore,
  type WeatherConfig,
} from '../stores/weatherConfig.store';
import { USER_MESSAGES } from '../utils/userMessages';

const STORED: WeatherConfig = {
  bmkgBaseUrl: 'https://api.bmkg.go.id/publik/prakiraan-cuaca',
  cacheTtlMs: 3_600_000,
  staleRetryMs: 420_000,
  fetchTimeoutMs: 12_000,
};

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>;

function route(handlers: Record<string, Handler>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/auth/csrf-token') return json({ csrfToken: 'csrf-1' });
    const key = `${(init?.method ?? 'GET').toUpperCase()} ${url}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`unexpected fetch: ${key}`);
    return handler(init);
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('weather config store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('loads the stored refresh interval', async () => {
    route({ 'GET /api/settings/weather-config': () => json({ settings: STORED }) });
    const store = useWeatherConfigStore();

    expect(await store.fetchConfig()).toBe(true);

    expect(store.cacheTtlMs).toBe(3_600_000);
    expect(store.isLoaded).toBe(true);
    expect(store.error).toBeNull();
  });

  it('keeps a non-preset stored value untouched on load', async () => {
    route({
      'GET /api/settings/weather-config': () =>
        json({ settings: { ...STORED, cacheTtlMs: 2_700_000 } }),
    });
    const store = useWeatherConfigStore();

    await store.fetchConfig();

    expect(store.cacheTtlMs).toBe(2_700_000);
  });

  it('sends only cacheTtlMs when saving, never the other operational values', async () => {
    let sent: unknown;
    route({
      'GET /api/settings/weather-config': () => json({ settings: STORED }),
      'PATCH /api/settings/weather-config': (init) => {
        sent = JSON.parse(String(init?.body));
        return json({ message: 'ok', settings: { ...STORED, cacheTtlMs: 1_800_000 } });
      },
    });
    const store = useWeatherConfigStore();
    await store.fetchConfig();

    expect(await store.saveRefreshInterval(1_800_000)).toBe(true);

    expect(sent).toEqual({ cacheTtlMs: 1_800_000 });
    expect(store.cacheTtlMs).toBe(1_800_000);
    // The unedited operational values are preserved in the stored state.
    expect(store.config?.staleRetryMs).toBe(420_000);
    expect(store.config?.fetchTimeoutMs).toBe(12_000);
    expect(store.config?.bmkgBaseUrl).toBe(STORED.bmkgBaseUrl);
  });

  it('shows plain wording for a failed load and does not pretend it loaded', async () => {
    route({ 'GET /api/settings/weather-config': () => json({ error: 'x' }, 500) });
    const store = useWeatherConfigStore();

    expect(await store.fetchConfig()).toBe(false);

    expect(store.isLoaded).toBe(false);
    expect(store.error).toContain('Terjadi kendala di server');
    expect(store.error).not.toMatch(/500|HTTP/);
  });

  it('rejects an unreadable settings payload', async () => {
    route({ 'GET /api/settings/weather-config': () => json({ settings: { cacheTtlMs: 'x' } }) });
    const store = useWeatherConfigStore();

    expect(await store.fetchConfig()).toBe(false);
    expect(store.isLoaded).toBe(false);
    expect(store.error).toContain('tidak dapat dibaca');
  });

  it('never shows the server sentence that quotes "Cache TTL" or milliseconds', async () => {
    route({
      'GET /api/settings/weather-config': () => json({ settings: STORED }),
      'PATCH /api/settings/weather-config': () =>
        json({ error: 'Cache TTL minimal 1 menit (60000 ms)' }, 400),
    });
    const store = useWeatherConfigStore();
    await store.fetchConfig();

    expect(await store.saveRefreshInterval(1_800_000)).toBe(false);

    expect(store.saveError).toBe(WEATHER_SAVE_REFUSED_MESSAGE);
    expect(store.saveError).not.toMatch(/TTL|ms/);
    expect(store.cacheTtlMs).toBe(3_600_000);
  });

  it('maps other save failures through the shared message mapper', async () => {
    route({
      'GET /api/settings/weather-config': () => json({ settings: STORED }),
      'PATCH /api/settings/weather-config': () => json({ error: 'boom' }, 503),
    });
    const store = useWeatherConfigStore();
    await store.fetchConfig();

    expect(await store.saveRefreshInterval(1_800_000)).toBe(false);

    expect(store.saveError).toBe(`Gagal menyimpan pengaturan cuaca. ${USER_MESSAGES.server}`);
  });
});
