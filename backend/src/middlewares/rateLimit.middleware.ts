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

// Settings write operations rate limiter (dedicated 100 req/15min bucket keyed by admin user ID,
// separate from userManagementWriteLimiter so settings edits and user management do not drain each other)
export const settingsWriteLimiter = createUserKeyedLimiter(100);

// Self-service password change: runs bcrypt.compare + bcrypt.hash on every request.
// Budget matches loginLimiter (same security weight — both gatekeep credential changes).
export const changePasswordLimiter = createLimiter(10);

// General public API endpoints rate limiter
export const apiLimiter = createLimiter(300);
