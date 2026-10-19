import { Router } from 'express';
import {
  listIndicatorsHandler,
  getIndicatorHandler,
  createIndicatorHandler,
  updateIndicatorHandler,
  deleteIndicatorHandler,
} from '../controllers/indicators.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireEditorOrAdmin } from '../middlewares/role.middleware.js';
import { apiLimiter, indicatorsWriteLimiter } from '../middlewares/rateLimit.middleware.js';

const router = Router();

// Public reads (rate-limited, in-memory cached)
router.get('/', apiLimiter, listIndicatorsHandler);
router.get('/:id', apiLimiter, getIndicatorHandler);

// Mutations: Editor or Admin only (rate-limited, token verified, role checked, user-rate-limited)
router.post(
  '/',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  indicatorsWriteLimiter,
  createIndicatorHandler,
);
router.patch(
  '/:id',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  indicatorsWriteLimiter,
  updateIndicatorHandler,
);
router.delete(
  '/:id',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  indicatorsWriteLimiter,
  deleteIndicatorHandler,
);

export default router;
