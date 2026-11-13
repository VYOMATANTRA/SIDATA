import { Router } from 'express';
import {
  updateSectionHandler,
  deleteSectionHandler,
  createSectionBlockHandler,
  reorderSectionBlocksHandler,
  putSectionFigureHandler,
  deleteSectionFigureHandler,
} from '../controllers/sections.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireEditorOrAdmin } from '../middlewares/role.middleware.js';
import {
  apiLimiter,
  pagesWriteLimiter,
  contentBlocksWriteLimiter,
} from '../middlewares/rateLimit.middleware.js';

const router = Router();

// All section routes are mutations: Editor or Admin only (rate-limited, token verified, role
// checked, user-rate-limited). Section creation and reordering are addressed through the parent
// chapter (chapters.routes.ts).
router.patch(
  '/:id',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  pagesWriteLimiter,
  updateSectionHandler,
);
router.delete(
  '/:id',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  pagesWriteLimiter,
  deleteSectionHandler,
);

// Section prose blocks (budgeted with the other content-block writes)
router.post(
  '/:id/content-blocks',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  contentBlocksWriteLimiter,
  createSectionBlockHandler,
);
router.put(
  '/:id/content-blocks/reorder',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  contentBlocksWriteLimiter,
  reorderSectionBlocksHandler,
);

// Section figure (one per section; budgeted with the other content-block writes)
router.put(
  '/:id/figure',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  contentBlocksWriteLimiter,
  putSectionFigureHandler,
);
router.delete(
  '/:id/figure',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  contentBlocksWriteLimiter,
  deleteSectionFigureHandler,
);

export default router;
