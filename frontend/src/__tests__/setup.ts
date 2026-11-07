import { vi } from 'vitest';

// jsdom does not implement window.scrollTo and logs "Not implemented" on every call; the router's
// scroll handling calls it on each navigation. Specs that assert on it can re-spy.
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
