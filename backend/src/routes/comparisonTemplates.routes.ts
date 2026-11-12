import { Router } from 'express';
import {
  listComparisonTemplatesHandler,
  getComparisonTemplateHandler,
  createComparisonTemplateHandler,
  updateComparisonTemplateHandler,
  deleteComparisonTemplateHandler,
  previewComparisonTemplateHandler,
} from '../controllers/comparisonTemplates.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireAdmin, requireEditorOrAdmin } from '../middlewares/role.middleware.js';
import {
  apiLimiter,
  comparisonTemplatesWriteLimiter,
  comparisonTemplatesPreviewLimiter,
  comparisonTemplatesPreviewPreAuthLimiter,
} from '../middlewares/rateLimit.middleware.js';

const router = Router();

// Reads: Editor or Admin. Templates are not public content — editors need them to pick one
// for an indicator, and the public sees only the sentence rendered from one.
router.get('/', apiLimiter, verifyToken, requireEditorOrAdmin, listComparisonTemplatesHandler);
router.get('/:id', apiLimiter, verifyToken, requireEditorOrAdmin, getComparisonTemplateHandler);

// Mutations: Admin only (SPEC §3 — authoring sentence structures is an Admin capability).
router.post(
  '/',
  apiLimiter,
  verifyToken,
  requireAdmin,
  comparisonTemplatesWriteLimiter,
  createComparisonTemplateHandler,
);
// Live preview: a POST only because it carries a draft body, so it is CSRF-protected like the
// other mutating routes. It stores nothing and fires while an admin types, so it has its own
// roomier per-user bucket instead of draining the save budget. It deliberately skips the shared
// apiLimiter (300/15min per IP, also used by public routes): a separate, generous pre-auth guard
// stops unauthenticated floods, and the per-user limiter is the real ceiling once authenticated.
router.post(
  '/preview',
  comparisonTemplatesPreviewPreAuthLimiter,
  verifyToken,
  requireAdmin,
  comparisonTemplatesPreviewLimiter,
  previewComparisonTemplateHandler,
);
router.patch(
  '/:id',
  apiLimiter,
  verifyToken,
  requireAdmin,
  comparisonTemplatesWriteLimiter,
  updateComparisonTemplateHandler,
);
router.delete(
  '/:id',
  apiLimiter,
  verifyToken,
  requireAdmin,
  comparisonTemplatesWriteLimiter,
  deleteComparisonTemplateHandler,
);

export default router;
