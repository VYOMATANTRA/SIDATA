import { Router } from 'express';
import { updateChapterHandler, deleteChapterHandler } from '../controllers/chapters.controller.js';
import {
  createSectionHandler,
  reorderSectionsHandler,
} from '../controllers/sections.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireEditorOrAdmin } from '../middlewares/role.middleware.js';
import { apiLimiter, pagesWriteLimiter } from '../middlewares/rateLimit.middleware.js';

const router = Router();

// All chapter routes are mutations: Editor or Admin only (rate-limited, token verified, role
// checked, user-rate-limited). Reads go through GET /api/pages/:slug. Chapter creation and
// reordering are addressed through the parent page (pages.routes.ts).
router.patch(
  '/:id',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  pagesWriteLimiter,
  updateChapterHandler,
);
router.delete(
  '/:id',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  pagesWriteLimiter,
  deleteChapterHandler,
);

// Sections under a chapter
router.post(
  '/:id/sections',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  pagesWriteLimiter,
  createSectionHandler,
);
router.put(
  '/:id/sections/reorder',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  pagesWriteLimiter,
  reorderSectionsHandler,
);

export default router;
