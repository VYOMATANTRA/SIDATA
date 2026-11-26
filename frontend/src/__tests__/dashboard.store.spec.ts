import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useDashboardStore, DASHBOARD_UNREADABLE_MESSAGE } from '../stores/dashboard.store';

const DASHBOARD = {
  counts: {
    indicators: 3,
    indicatorTables: 1,
    pages: 2,
    publications: 4,
    rtLeaders: 5,
    spatialPoints: 6,
  },
  health: {
    staleIndicators: { count: 0, items: [] },
    rtLeadersWithoutCoordinates: 0,
    rtLeadersWithIntegrityConflicts: 0,
  },
  recentChanges: [],
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

describe('dashboard store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('fetchDashboard loads GET /api/dashboard', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ dashboard: DASHBOARD }));
    globalThis.fetch = fetchMock;

    const store = useDashboardStore();
    await store.fetchDashboard();

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/dashboard');
    expect(store.dashboard).toEqual(DASHBOARD);
    expect(store.error).toBeNull();
    expect(store.errorKind).toBeNull();
    expect(store.loading).toBe(false);
  });

  it('maps a failed request to a Indonesian message and kind', async () => {
    globalThis.fetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: 'Terjadi kesalahan internal server' }, false, 500));

    const store = useDashboardStore();
    await store.fetchDashboard();

    expect(store.dashboard).toBeNull();
    expect(store.error).toBeTruthy();
    expect(store.error).not.toMatch(/500|Terjadi kesalahan internal/);
    expect(store.errorKind).toBe('server');
    expect(store.loading).toBe(false);
  });

  it('reports an unreadable response as a failure', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}));

    const store = useDashboardStore();
    await store.fetchDashboard();

    expect(store.error).toBe(DASHBOARD_UNREADABLE_MESSAGE);
    expect(store.errorKind).toBe('unknown');
  });

  it('ignores a slower, older response that finishes after a newer one', async () => {
    const resolvers: Array<(value: Response) => void> = [];
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (String(input).includes('csrf-token')) {
        return jsonResponse({ csrfToken: 'mock-csrf' });
      }
      return new Promise<Response>((resolve) => resolvers.push(resolve));
    });

    const store = useDashboardStore();
    const first = store.fetchDashboard();
    const second = store.fetchDashboard();

    const newer = { ...DASHBOARD, counts: { ...DASHBOARD.counts, indicators: 99 } };
    await vi.waitFor(() => expect(resolvers).toHaveLength(2));
    resolvers[1]?.(jsonResponse({ dashboard: newer }));
    await second;
    resolvers[0]?.(jsonResponse({ dashboard: DASHBOARD }));
    await first;

    expect(store.dashboard?.counts.indicators).toBe(99);
    expect(store.loading).toBe(false);
  });
});
