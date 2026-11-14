import { Router } from 'express';
import { putPublikasiCatalogHandler } from '../controllers/publikasi.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireEditorOrAdmin } from '../middlewares/role.middleware.js';
import { apiLimiter, contentBlocksWriteLimiter } from '../middlewares/rateLimit.middleware.js';

const router = Router();

// The publication catalog (SPEC §4): Editor or Admin only, budgeted with the other content-block writes.
router.put(
  '/catalog',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  contentBlocksWriteLimiter,
  putPublikasiCatalogHandler,
);

export default router;
