import { test as base, expect } from '@playwright/test';
import { installMocks, type MockHandle } from './mocks';

interface Options {
  /** Opt out of the unmocked-`/api` check for a test that intentionally triggers one. */
  allowUnmockedApi: boolean;
}

/**
 * Project `test` with deterministic network mocks applied to every page automatically.
 * Import `test`/`expect` from here, not from `@playwright/test`, so a spec can never reach a
 * real backend or the internet by accident.
 *
 * After each test the fixture fails it if the page called an `/api` endpoint with no explicit
 * mock (a silent 404 would otherwise hide a missing fixture). Aborted external hosts such as
 * fonts are tolerated and stay available on `mocks.blockedExternal`.
 */
export const test = base.extend<{ mocks: MockHandle } & Options>({
  allowUnmockedApi: [false, { option: true }],
  mocks: [
    async ({ page, baseURL, allowUnmockedApi }, use) => {
      const handle = await installMocks(page, baseURL as string);
      await use(handle);
      if (!allowUnmockedApi) {
        expect(
          handle.unmockedApi,
          'unmocked /api calls (add a mock or set allowUnmockedApi)',
        ).toEqual([]);
      }
    },
    { auto: true },
  ],
});

export { expect };
