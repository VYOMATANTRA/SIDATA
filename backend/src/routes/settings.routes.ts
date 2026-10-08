import { Router } from 'express';
import {
  getAuditRetention,
  updateAuditRetention,
  getPublicSettingsHandler,
  updatePublicSettingsHandler,
  getWeatherConfigHandler,
  updateWeatherConfigHandler,
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

// Admin-only operational weather forecast settings
router.get(
  '/weather-config',
  userManagementReadLimiter,
  verifyToken,
  requireAdmin,
  getWeatherConfigHandler,
);
router.patch(
  '/weather-config',
  userManagementWriteLimiter,
  verifyToken,
  requireAdmin,
  updateWeatherConfigHandler,
);

export default router;
