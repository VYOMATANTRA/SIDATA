import { vi } from 'vitest';

/**
 * Stubs `window.matchMedia` so every query reports `matches`. `true` simulates the `md` desktop
 * breakpoint, `false` a phone (jsdom has no `matchMedia` of its own, which `useIsDesktop` reads as
 * "not desktop").
 */
export function stubViewport(matches: boolean) {
  window.matchMedia = vi.fn<(query: string) => MediaQueryList>().mockImplementation(
    (query: string) =>
      ({
        matches,
        media: query,
        addEventListener: vi.fn<() => void>(),
        removeEventListener: vi.fn<() => void>(),
      }) as unknown as MediaQueryList,
  );
}
