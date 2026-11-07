import { Router } from 'express';
import {
  getContentBlocksHandler,
  getContentBlockBySlugHandler,
  updateContentBlockHandler,
  deleteContentBlockHandler,
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

// Section prose blocks only; standalone singleton blocks are rejected by the service (409).
// Creation and reordering live under /api/sections/:id/content-blocks (sections.routes.ts).
router.delete(
  '/:slug',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  contentBlocksWriteLimiter,
  deleteContentBlockHandler,
);

export default router;
