import { Router } from 'express';
import { updateSectionHandler, deleteSectionHandler } from '../controllers/sections.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireEditorOrAdmin } from '../middlewares/role.middleware.js';
import { apiLimiter, pagesWriteLimiter } from '../middlewares/rateLimit.middleware.js';

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

export default router;
