import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const createLimiter = (limit: number) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => {
      if (!req.ip) {
        throw new Error('Identitas koneksi tidak valid');
      }
      return ipKeyGenerator(req.ip);
    },
  });

export const authLimiter = createLimiter(100);
export const loginLimiter = createLimiter(10);

export const weatherLimiter = createLimiter(300);

// Maps and spatial data rate limiters.
// Separated per resource to prevent landing page fan-out (/summary + /points + /rt-leaders)
// from exhausting a shared bucket when multiple users browse from the same NAT/office IP.
export const mapsPointsLimiter = createLimiter(300);
export const mapsRtLeadersLimiter = createLimiter(300);
export const mapsSummaryLimiter = createLimiter(300);
export const pagesLimiter = createLimiter(300);

// Session-maintenance endpoints (csrf-token, refresh, logout, me) are hit on every SPA
// navigation while unauthenticated (see router/index.ts's beforeEach), not just on deliberate
// user action — sharing authLimiter's 100 req/15min budget with register/login/OTP let
// multiple unauthenticated users behind one IP (NAT) burn through it purely on silent-refresh
// retries and lock each other out of logging in. Given a roomier, separate budget instead.
export const sessionLimiter = createLimiter(300);

// User management endpoints: read operations (300 req/15min) separate from bcrypt/transaction writes (100 req/15min)
export const userManagementReadLimiter = createLimiter(300);
export const userManagementWriteLimiter = createLimiter(100);

// User-keyed rate limiter helper: keys by authenticated user id if present, otherwise by IP.
const createUserKeyedLimiter = (limit: number) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const authReq = req as unknown as { user?: { id?: string } };
      if (authReq.user?.id) {
        return `user:${authReq.user.id}`;
      }
      if (!req.ip) {
        throw new Error('Identitas koneksi tidak valid');
      }
      return ipKeyGenerator(req.ip);
    },
  });

// Content blocks CMS write operations rate limiter (dedicated 100 req/15min bucket keyed by user ID)
export const contentBlocksWriteLimiter = createUserKeyedLimiter(100);

// Pages management write operations rate limiter (dedicated 100 req/15min bucket keyed by user ID)
export const pagesWriteLimiter = createUserKeyedLimiter(100);

// Indicators CMS write operations rate limiter (dedicated 100 req/15min bucket keyed by user ID,
// separate from contentBlocksWriteLimiter so indicator edits and prose edits do not drain each other)
export const indicatorsWriteLimiter = createUserKeyedLimiter(100);

// Comparison template write operations rate limiter (dedicated 100 req/15min bucket keyed by
// admin user ID, so authoring templates does not drain the indicator or prose edit budgets)
export const comparisonTemplatesWriteLimiter = createUserKeyedLimiter(100);

// Comparison template live preview (debounced calls while an admin types; continuous typing
// at 700 ms debounce is ~1,290 / 15 min, 3000 leaves headroom; it stores nothing, so it gets
// its own roomier bucket keyed by user ID rather than draining the 100/15min save budget)
export const comparisonTemplatesPreviewLimiter = createUserKeyedLimiter(3000);

// Pre-auth flood guard for the preview route only. A separate instance from the shared
// apiLimiter (so preview traffic never drains the 300/15min public-site budget).
// With skipSuccessfulRequests: true, requestWasSuccessful: statusCode !== 401 && statusCode !== 403,
// and limit: 120, unauthenticated/unauthorized callers (which receive 401/403) are capped at
// 120 requests per 15 min per IP. Requests that pass authentication (200 OK, 400 validation, or
// 422 trend-keyword warnings from authenticated admins) are skipped here and instead governed by
// comparisonTemplatesPreviewLimiter (3000 req/15min per admin user ID), ensuring that multiple
// admins behind a shared NAT/office IP do not exhaust the shared IP quota while typing.
// Note: In deployments behind a reverse proxy, TRUST_PROXY must be configured so req.ip resolves to
// the real client IP rather than the proxy address.
export const comparisonTemplatesPreviewPreAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => res.statusCode !== 401 && res.statusCode !== 403,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (!req.ip) {
      throw new Error('Identitas koneksi tidak valid');
    }
    return ipKeyGenerator(req.ip);
  },
});

// Indicator tables CMS write operations rate limiter (dedicated 100 req/15min bucket keyed by
// user ID, separate from indicatorsWriteLimiter so matrix-table edits and scalar-figure edits
// do not drain each other)
export const indicatorTablesWriteLimiter = createUserKeyedLimiter(100);

// Settings write operations rate limiter (dedicated 100 req/15min bucket keyed by admin user ID,
// separate from userManagementWriteLimiter so settings edits and user management do not drain each other)
export const settingsWriteLimiter = createUserKeyedLimiter(100);

// Spatial point / RT coverage / RT leader CMS write operations rate limiter (dedicated 100
// req/15min bucket keyed by user ID, separate from indicatorsWriteLimiter etc. so map survey
// data entry does not drain other CMS edit budgets)
export const mapsWriteLimiter = createUserKeyedLimiter(100);

// Self-service password change: runs bcrypt.compare + bcrypt.hash on every request.
// Budget matches loginLimiter (same security weight — both gatekeep credential changes).
export const changePasswordLimiter = createLimiter(10);

// General public API endpoints rate limiter
export const apiLimiter = createLimiter(300);
