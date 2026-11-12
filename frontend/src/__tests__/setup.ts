import { vi } from 'vitest';

// jsdom does not implement window.scrollTo and logs "Not implemented" on every call; the router's
// scroll handling calls it on each navigation. Specs that assert on it can re-spy.
window.scrollTo = vi.fn<() => void>() as unknown as typeof window.scrollTo;

if (typeof window !== 'undefined' && !window.localStorage) {
  const store = new Map<string, string>();
  const storageStub: Storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, 'localStorage', {
    value: storageStub,
    configurable: true,
    writable: true,
  });
}
