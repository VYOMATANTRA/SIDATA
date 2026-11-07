import { Router } from 'express';
import {
  previewMediaHandler,
  publicMediaDownloadHandler,
  publicMediaImageHandler,
  uploadMediaHandler,
} from '../controllers/media.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { acceptMediaUpload } from '../middlewares/mediaUpload.middleware.js';
import { mediaReadLimiter, mediaWriteLimiter } from '../middlewares/rateLimit.middleware.js';
import { requireEditorOrAdmin } from '../middlewares/role.middleware.js';

const router = Router();

// Upload: Editor or Admin only. CSRF is enforced globally in app.ts (x-csrf-token header). Auth,
// role and the per-user limiter all run BEFORE the multipart transport, so an unauthorized
// request never makes the server buffer a file.
router.post(
  '/',
  verifyToken,
  requireEditorOrAdmin,
  mediaWriteLimiter,
  acceptMediaUpload,
  uploadMediaHandler,
);

// Editor preview: serves any asset, attached or not.
router.get(
  '/:id/preview',
  mediaReadLimiter,
  verifyToken,
  requireEditorOrAdmin,
  previewMediaHandler,
);

// Public delivery: only assets that content has attached (attachedAt set); otherwise 404.
router.get('/:id/download', mediaReadLimiter, publicMediaDownloadHandler);
router.get('/:id', mediaReadLimiter, publicMediaImageHandler);

export default router;
