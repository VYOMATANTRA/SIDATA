import { Router } from 'express';
import { getAuditRetention, updateAuditRetention } from '../controllers/settings.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/role.middleware.js';
import {
  userManagementReadLimiter,
  userManagementWriteLimiter,
} from '../middlewares/rateLimit.middleware.js';

const router = Router();

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
