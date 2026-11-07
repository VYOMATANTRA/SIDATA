import type { Page, Route } from '@playwright/test';
import { MAP_POINTS, MAP_SUMMARY, PUBLIC_SETTINGS } from './fixtures-data';
import { TILE_PNG } from './tile';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

export interface MockHandle {
  /**
   * `METHOD /path` of every `/api/**` request no explicit mock claimed. The `test` fixture fails
   * the test if this is non-empty, unless the test sets `allowUnmockedApi`.
   */
  unmockedApi: string[];
  /**
   * Hosts outside the app origin that the page tried to reach (all aborted; tiles are mocked).
   * Recorded for inspection only: aborting fonts/analytics is expected, so it never fails a test.
   */
  blockedExternal: string[];
}

/**
 * Makes a page fully deterministic: no real backend, no internet.
 * Playwright matches the most recently registered route first, so the order below is
 * catch-all (lowest priority) -> specific mocks (highest).
 */
export async function installMocks(page: Page, baseURL: string): Promise<MockHandle> {
  // Only the app's own origin (port included) is "local"; a stray service on another localhost
  // port must not slip through the offline guarantee.
  const appOrigin = new URL(baseURL).origin;
  const handle: MockHandle = { unmockedApi: [], blockedExternal: [] };

  // 1. Anything outside the app origin is aborted (fonts, analytics, CDNs...).
  await page.route(
    (url) => url.origin !== appOrigin,
    (route) => {
      handle.blockedExternal.push(new URL(route.request().url()).host);
      return route.abort('blockedbyclient');
    },
  );

  // 2. OpenStreetMap tiles -> one tiny generated PNG so real Leaflet tile layers render.
  await page.route('https://*.tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TILE_PNG }),
  );

  // 3. Unmocked API calls fail safely and are recorded.
  await page.route('**/api/**', (route) => {
    const req = route.request();
    handle.unmockedApi.push(`${req.method()} ${new URL(req.url()).pathname}`);
    return json(route, { error: 'Not mocked in e2e' }, 404);
  });

  // 4. Explicit mocks.
  await page.route('**/api/auth/csrf-token', (route) =>
    json(route, { csrfToken: 'e2e-csrf-token' }),
  );
  // Logged-out visitor: the refresh cookie is dead.
  await page.route('**/api/auth/refresh', (route) => json(route, { error: 'Unauthorized' }, 401));
  await page.route('**/api/settings/public', (route) => json(route, { settings: PUBLIC_SETTINGS }));
  await page.route('**/api/maps/points**', (route) =>
    json(route, { points: MAP_POINTS, total: MAP_POINTS.length }),
  );
  await page.route('**/api/maps/summary', (route) => json(route, MAP_SUMMARY));

  return handle;
}
