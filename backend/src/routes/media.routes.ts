import { Router } from 'express';
import {
  previewMediaHandler,
  publicMediaDownloadHandler,
  publicMediaImageHandler,
  uploadMediaHandler,
} from '../controllers/media.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { acceptMediaUpload } from '../middlewares/mediaUpload.middleware.js';
import {
  apiLimiter,
  mediaReadLimiter,
  mediaWriteLimiter,
} from '../middlewares/rateLimit.middleware.js';
import { requireEditorOrAdmin } from '../middlewares/role.middleware.js';

const router = Router();

// Upload: Editor or Admin only. CSRF is enforced globally in app.ts (x-csrf-token header). A
// per-IP limiter runs first (so unauthenticated floods are throttled before token verification,
// as on the other CMS write routes), then auth, role and the per-user limiter — all BEFORE the
// multipart transport, so an unauthorized request never makes the server buffer a file.
router.post(
  '/',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  mediaWriteLimiter,
  acceptMediaUpload,
  uploadMediaHandler,
);

// Editor preview: serves any asset, attached or not. It authenticates with the Authorization
// header only (no cookie, no signed URL), so a bare <img src>/<a href> gets a 401: the CMS fetches it
// with the authenticated API client and renders a blob URL. The DTO's `previewUrl` is this path.
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
