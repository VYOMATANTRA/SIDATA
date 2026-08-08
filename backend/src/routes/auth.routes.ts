import { Router } from 'express';
import {
  register,
  login,
  refreshToken,
  logout,
  getMe,
  getCsrfToken,
} from '../controllers/auth.controller.js';
import { googleLogin, googleCallback } from '../controllers/oauth.controller.js';
import { verifyOtp, resendOtp } from '../controllers/otp.controller.js';
import { authLimiter, loginLimiter } from '../middlewares/rateLimit.middleware.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireTurnstile } from '../middlewares/turnstile.middleware.js';

const router = Router();

router.use(authLimiter);

router.get('/csrf-token', getCsrfToken);
router.post('/register', requireTurnstile, register);
router.post('/login', loginLimiter, requireTurnstile, login);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);
router.post('/refresh', refreshToken);
router.post('/logout', logout);

router.get('/google', googleLogin);
router.get('/google/callback', googleCallback);

router.get('/me', verifyToken, getMe);

export default router;
