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
  settingsWriteLimiter,
} from '../middlewares/rateLimit.middleware.js';

const router = Router();

// Mutations: apiLimiter throttles unauthenticated traffic before verifyToken; settingsWriteLimiter (keyed by
// user id) runs only after authentication and role checks so anonymous requests cannot drain admin quota.
// Public portal profile and contact settings (unauthenticated, rate-limited)
router.get('/public', apiLimiter, getPublicSettingsHandler);
router.patch(
  '/public',
  apiLimiter,
  verifyToken,
  requireAdmin,
  settingsWriteLimiter,
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
  apiLimiter,
  verifyToken,
  requireAdmin,
  settingsWriteLimiter,
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
  apiLimiter,
  verifyToken,
  requireAdmin,
  settingsWriteLimiter,
  updateWeatherConfigHandler,
);

export default router;
