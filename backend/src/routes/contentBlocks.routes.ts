import { Router } from 'express';
import {
  getContentBlocksHandler,
  getContentBlockBySlugHandler,
  updateContentBlockHandler,
} from '../controllers/contentBlocks.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireEditorOrAdmin } from '../middlewares/role.middleware.js';
import { apiLimiter, contentBlocksWriteLimiter } from '../middlewares/rateLimit.middleware.js';

const router = Router();

// Public reads (rate-limited, in-memory cached)
router.get('/', apiLimiter, getContentBlocksHandler);
router.get('/:slug', apiLimiter, getContentBlockBySlugHandler);

// Mutation: Editor or Admin only (rate-limited, token verified, role checked, user-rate-limited)
router.patch(
  '/:slug',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  contentBlocksWriteLimiter,
  updateContentBlockHandler,
);

export default router;
