import { Router } from 'express';
import {
  register,
  login,
  firstLoginPassword,
  refreshToken,
  logout,
  getMe,
  getCsrfToken,
} from '../controllers/auth.controller.js';
import { googleLogin, googleCallback } from '../controllers/oauth.controller.js';
import { verifyOtp, resendOtp } from '../controllers/otp.controller.js';
import { authLimiter, loginLimiter, sessionLimiter } from '../middlewares/rateLimit.middleware.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireTurnstile } from '../middlewares/turnstile.middleware.js';

const router = Router();

// Session-maintenance endpoints get their own, roomier limiter (see rateLimit.middleware.ts)
// since they're hit on every unauthenticated SPA navigation, not just deliberate user action.
router.get('/csrf-token', sessionLimiter, getCsrfToken);
router.post('/register', authLimiter, requireTurnstile, register);
router.post('/login', authLimiter, loginLimiter, requireTurnstile, login);
router.post('/first-login-password', authLimiter, requireTurnstile, firstLoginPassword);
router.post('/verify-otp', authLimiter, requireTurnstile, verifyOtp);
router.post('/resend-otp', authLimiter, requireTurnstile, resendOtp);
router.post('/refresh', sessionLimiter, refreshToken);
router.post('/logout', sessionLimiter, logout);

router.get('/google', authLimiter, googleLogin);
router.get('/google/callback', authLimiter, googleCallback);

router.get('/me', sessionLimiter, verifyToken, getMe);

export default router;
