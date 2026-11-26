import { Router } from 'express';
import { getDashboardHandler } from '../controllers/dashboard.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireEditorOrAdmin } from '../middlewares/role.middleware.js';
import { apiLimiter } from '../middlewares/rateLimit.middleware.js';

const router = Router();

// Read-only admin overview (SPEC §8). Editor or Admin; the audit feed is a content-change projection.
router.get('/', apiLimiter, verifyToken, requireEditorOrAdmin, getDashboardHandler);

export default router;
