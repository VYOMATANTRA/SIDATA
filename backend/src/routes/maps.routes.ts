import { Router } from 'express';
import {
  listPoints,
  getPoint,
  listRtLeaders,
  getRtLeader,
  getSummary,
  createPointHandler,
  updatePointHandler,
  deletePointHandler,
  createPointCoverageHandler,
  deletePointCoverageHandler,
  updateRtLeaderHandler,
} from '../controllers/maps.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireEditorOrAdmin } from '../middlewares/role.middleware.js';
import {
  apiLimiter,
  mapsPointsLimiter,
  mapsRtLeadersLimiter,
  mapsSummaryLimiter,
  mapsWriteLimiter,
} from '../middlewares/rateLimit.middleware.js';

const router = Router();

// Public reads (rate-limited per resource so landing-page fan-out cannot exhaust one bucket).
router.get('/points', mapsPointsLimiter, listPoints);
router.get('/points/:id', mapsPointsLimiter, getPoint);
router.get('/rt-leaders', mapsRtLeadersLimiter, listRtLeaders);
router.get('/rt-leaders/:rtNumber', mapsRtLeadersLimiter, getRtLeader);
router.get('/summary', mapsSummaryLimiter, getSummary);

// Mutations (SPEC.md §7 write paths): Editor or Admin only — CSRF protection is global (app.ts),
// and order (apiLimiter → verifyToken → requireEditorOrAdmin → limiter) ensures unauthenticated
// and unauthorized traffic never drains the user-keyed write bucket.
router.post(
  '/points',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  mapsWriteLimiter,
  createPointHandler,
);
router.patch(
  '/points/:id',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  mapsWriteLimiter,
  updatePointHandler,
);
router.delete(
  '/points/:id',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  mapsWriteLimiter,
  deletePointHandler,
);
router.post(
  '/points/:id/rts',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  mapsWriteLimiter,
  createPointCoverageHandler,
);
router.delete(
  '/points/:id/rts/:rtNumber',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  mapsWriteLimiter,
  deletePointCoverageHandler,
);
router.patch(
  '/rt-leaders/:rtNumber',
  apiLimiter,
  verifyToken,
  requireEditorOrAdmin,
  mapsWriteLimiter,
  updateRtLeaderHandler,
);

export default router;
