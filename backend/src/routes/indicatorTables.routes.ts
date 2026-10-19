import { Router } from 'express';
import {
  listIndicatorTablesHandler,
  getIndicatorTableHandler,
  createIndicatorTableHandler,
  updateIndicatorTableHandler,
  deleteIndicatorTableHandler,
  createIndicatorTableRowHandler,
  updateIndicatorTableRowHandler,
  deleteIndicatorTableRowHandler,
} from '../controllers/indicatorTables.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireEditorOrAdmin } from '../middlewares/role.middleware.js';
import { apiLimiter, indicatorTablesWriteLimiter } from '../middlewares/rateLimit.middleware.js';

const router = Router();

// Public reads (rate-limited, in-memory cached). :key accepts a slug or an id.
router.get('/', apiLimiter, listIndicatorTablesHandler);
router.get('/:key', apiLimiter, getIndicatorTableHandler);

// Mutations: Editor or Admin only (rate-limited, token verified, role checked, user-rate-limited)
router.post(
  '/',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  indicatorTablesWriteLimiter,
  createIndicatorTableHandler,
);
router.patch(
  '/:id',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  indicatorTablesWriteLimiter,
  updateIndicatorTableHandler,
);
router.delete(
  '/:id',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  indicatorTablesWriteLimiter,
  deleteIndicatorTableHandler,
);
router.post(
  '/:id/rows',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  indicatorTablesWriteLimiter,
  createIndicatorTableRowHandler,
);
router.patch(
  '/rows/:rowId',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  indicatorTablesWriteLimiter,
  updateIndicatorTableRowHandler,
);
router.delete(
  '/rows/:rowId',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  indicatorTablesWriteLimiter,
  deleteIndicatorTableRowHandler,
);

export default router;
