import { Router } from 'express';
import {
  getAuditRetention,
  updateAuditRetention,
  getPublicSettingsHandler,
  updatePublicSettingsHandler,
} from '../controllers/settings.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/role.middleware.js';
import {
  apiLimiter,
  userManagementReadLimiter,
  userManagementWriteLimiter,
} from '../middlewares/rateLimit.middleware.js';

const router = Router();

// Public portal profile and contact settings (unauthenticated, rate-limited)
router.get('/public', apiLimiter, getPublicSettingsHandler);
router.patch(
  '/public',
  userManagementWriteLimiter,
  verifyToken,
  requireAdmin,
  updatePublicSettingsHandler,
);

// Admin-only audit retention policy settings
router.get(
  '/audit-retention',
  userManagementReadLimiter,
  verifyToken,
  requireAdmin,
  getAuditRetention,
);
router.patch(
  '/audit-retention',
  userManagementWriteLimiter,
  verifyToken,
  requireAdmin,
  updateAuditRetention,
);

export default router;
