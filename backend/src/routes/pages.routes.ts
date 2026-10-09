import { Router } from 'express';
import { listPages, getPage, createPageHandler } from '../controllers/pages.controller.js';
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

export default router;
