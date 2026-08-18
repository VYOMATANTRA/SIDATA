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

// Session-maintenance endpoints (csrf-token, refresh, logout, me) are hit on every SPA
// navigation while unauthenticated (see router/index.ts's beforeEach), not just on deliberate
// user action — sharing authLimiter's 100 req/15min budget with register/login/OTP let
// multiple unauthenticated users behind one IP (NAT) burn through it purely on silent-refresh
// retries and lock each other out of logging in. Given a roomier, separate budget instead.
export const sessionLimiter = createLimiter(300);

// User management endpoints access DB & perform bcrypt password hashing
export const userManagementLimiter = createLimiter(100);

// Self-service password change: runs bcrypt.compare + bcrypt.hash on every request.
// Budget matches loginLimiter (same security weight — both gatekeep credential changes).
export const changePasswordLimiter = createLimiter(10);

// General public API endpoints rate limiter
export const apiLimiter = createLimiter(300);
