import { Router } from 'express';
import {
  listAuditLogs,
  getAuditLogsSummary,
  acknowledgeAuditLogEntry,
} from '../controllers/audit.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/role.middleware.js';
import {
  userManagementReadLimiter,
  userManagementWriteLimiter,
} from '../middlewares/rateLimit.middleware.js';

const router = Router();

router.get('/', userManagementReadLimiter, verifyToken, requireAdmin, listAuditLogs);
router.get('/summary', userManagementReadLimiter, verifyToken, requireAdmin, getAuditLogsSummary);
router.patch(
  '/:id/acknowledge',
  userManagementWriteLimiter,
  verifyToken,
  requireAdmin,
  acknowledgeAuditLogEntry,
);

export default router;
