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

/**
 * Like `stubViewport`, but returns `setMatches` to simulate a resize across the `md` breakpoint:
 * it updates every query's `matches` and fires the registered `change` listeners.
 */
export function stubResizableViewport(initial: boolean) {
  let matches = initial;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  window.matchMedia = vi.fn<(query: string) => MediaQueryList>().mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return matches;
        },
        media: query,
        addEventListener: (_type: string, cb: (event: MediaQueryListEvent) => void) => {
          listeners.add(cb);
        },
        removeEventListener: (_type: string, cb: (event: MediaQueryListEvent) => void) => {
          listeners.delete(cb);
        },
      }) as unknown as MediaQueryList,
  );
  return {
    setMatches(next: boolean) {
      matches = next;
      listeners.forEach((cb) => cb({ matches: next } as MediaQueryListEvent));
    },
  };
}
