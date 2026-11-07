import { test as base, expect } from '@playwright/test';
import { installMocks, type MockHandle } from './mocks';

/**
 * Project `test` with deterministic network mocks applied to every page automatically.
 * Import `test`/`expect` from here, not from `@playwright/test`, so a spec can never reach a
 * real backend or the internet by accident.
 */
export const test = base.extend<{ mocks: MockHandle }>({
  mocks: [
    async ({ page }, use) => {
      await use(await installMocks(page));
    },
    { auto: true },
  ],
});

export { expect };
