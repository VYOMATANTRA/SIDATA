import { defineConfig, devices } from '@playwright/test';

/**
 * Real-browser tests for behaviour jsdom cannot prove (paint order, hit targets, scroll/focus,
 * mobile viewports). Unit tests stay in Vitest; see the "End-to-end tests" section of
 * `frontend/README.md`.
 *
 * Specs are named `*.mobile.spec.ts` or `*.desktop.spec.ts`; each project only matches its own
 * suffix, so nothing is skipped at runtime.
 *
 * Tests never reach a real backend or the internet: `e2e/support/mocks.ts` stubs `/api/**` and the
 * OpenStreetMap tile host. Vite is started on a dedicated port so it cannot collide with (or
 * silently reuse) a developer's `npm run dev` on 5173.
 */
const PORT = 5199;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.output/test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: './e2e/.output/report', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    locale: 'id-ID',
    timezoneId: 'Asia/Makassar',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
      testMatch: '**/*.mobile.spec.ts',
    },
    {
      name: 'mobile-small',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 320, height: 640 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
      testMatch: '**/*.mobile.spec.ts',
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testMatch: '**/*.desktop.spec.ts',
    },
  ],
  webServer: {
    // The app's own dev server (same config) minus Vue DevTools, whose injected panel would sit
    // on top of the page in hit tests. See e2e/vite.e2e.config.ts.
    command: `npm run dev -- --config e2e/vite.e2e.config.ts --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
