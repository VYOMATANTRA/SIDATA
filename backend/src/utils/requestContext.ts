import type { Request } from 'express';

export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Pulls the two pieces of connection metadata audit rows record. `req.ip` already backs the
 * rate limiter (rateLimit.middleware.ts) and CSRF session keying (csrf.middleware.ts) — it is
 * only meaningful behind a reverse proxy if `TRUST_PROXY` is configured (see app.ts). User-agent
 * is not read anywhere else in the codebase.
 *
 * Reads `req.headers` directly rather than Express's `req.get()` helper: the latter is just a
 * case-normalizing wrapper around headers (moot here — Node's http parser already lowercases
 * incoming header names), and the test suite's request literals (plain objects cast to
 * AuthRequest, not real Express Request instances) don't implement `.get()`.
 */
export function extractRequestContext(req: Request): RequestContext {
  const userAgent = req.headers?.['user-agent'];
  return {
    ipAddress: req.ip ?? null,
    userAgent: typeof userAgent === 'string' ? userAgent : null,
  };
}
