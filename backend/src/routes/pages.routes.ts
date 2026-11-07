import { Router } from 'express';
import {
  listPages,
  getPage,
  createPageHandler,
  deletePageHandler,
  reorderPagesHandler,
  updatePageHandler,
} from '../controllers/pages.controller.js';
import {
  createChapterHandler,
  reorderChaptersHandler,
} from '../controllers/chapters.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireEditorOrAdmin } from '../middlewares/role.middleware.js';
import {
  apiLimiter,
  pagesLimiter,
  pagesWriteLimiter,
} from '../middlewares/rateLimit.middleware.js';

const router = Router();

// Public reads
router.get('/', pagesLimiter, listPages);

// Reorder must be mounted before /:slug to eliminate Express parameter shadowing
router.put(
  '/reorder',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  pagesWriteLimiter,
  reorderPagesHandler,
);

router.get('/:slug', pagesLimiter, getPage);

// Mutation: Editor or Admin only (rate-limited, token verified, role checked, user-rate-limited)
router.post(
  '/',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  pagesWriteLimiter,
  createPageHandler,
);
router.delete(
  '/:slug',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  pagesWriteLimiter,
  deletePageHandler,
);

// Chapter authoring under a page (same guards; chapter edit/delete live in chapters.routes.ts)
router.patch(
  '/:slug',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  pagesWriteLimiter,
  updatePageHandler,
);
router.post(
  '/:slug/chapters',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  pagesWriteLimiter,
  createChapterHandler,
);
router.put(
  '/:slug/chapters/reorder',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  pagesWriteLimiter,
  reorderChaptersHandler,
);

export default router;
