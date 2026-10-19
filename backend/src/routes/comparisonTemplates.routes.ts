import { Router } from 'express';
import {
  listComparisonTemplatesHandler,
  getComparisonTemplateHandler,
  createComparisonTemplateHandler,
  updateComparisonTemplateHandler,
  deleteComparisonTemplateHandler,
} from '../controllers/comparisonTemplates.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireAdmin, requireEditorOrAdmin } from '../middlewares/role.middleware.js';
import {
  apiLimiter,
  comparisonTemplatesWriteLimiter,
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
