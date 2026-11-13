import { afterEach, beforeEach } from 'vitest';

/**
 * The public shell loads the Cerita page list for its menu (`GET /api/pages?include=sections`).
 * A spec that mounts a whole public view without caring about that menu calls this once at the top
 * level: the request is answered instead of failing noisily, every other URL still reaches
 * whatever `fetch` was before, and the original is restored after each test.
 */
export function useStubbedPagesFetch(): void {
  let original: typeof fetch | undefined;

  beforeEach(() => {
    original = globalThis.fetch;
    const before = original;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/pages?include=sections') {
        return { ok: true, status: 200, json: async () => ({ pages: [] }) } as Response;
      }
      return before(input, init);
    }) as typeof fetch;
  });

  afterEach(() => {
    if (original) globalThis.fetch = original;
  });
}
