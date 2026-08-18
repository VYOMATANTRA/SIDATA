import { Router } from 'express';
import { changeOwnPassword } from '../controllers/profile.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireTurnstile } from '../middlewares/turnstile.middleware.js';
import { changePasswordLimiter } from '../middlewares/rateLimit.middleware.js';

const router = Router();

// POST /api/profile/change-password
//
// Middleware chain:
//   1. changePasswordLimiter  — 10 req / 15 min per IP; bcrypt runs twice per request
//   2. verifyToken            — validates JWT, hydrates req.user from DB, rejects deleted accounts
//   3. requireTurnstile       — bot deterrent (CPU-expensive endpoint; cheap extra layer)
//   4. handler                — verifies current password, validates + hashes new, atomic swap
router.post('/change-password', changePasswordLimiter, verifyToken, requireTurnstile, changeOwnPassword);

export default router;
