import { Router } from 'express';
import {
  listPoints,
  getPoint,
  listRtLeaders,
  getRtLeader,
  getSummary,
} from '../controllers/maps.controller.js';
import {
  mapsPointsLimiter,
  mapsRtLeadersLimiter,
  mapsSummaryLimiter,
} from '../middlewares/rateLimit.middleware.js';

const router = Router();

router.get('/points', mapsPointsLimiter, listPoints);
router.get('/points/:id', mapsPointsLimiter, getPoint);
router.get('/rt-leaders', mapsRtLeadersLimiter, listRtLeaders);
router.get('/rt-leaders/:rtNumber', mapsRtLeadersLimiter, getRtLeader);
router.get('/summary', mapsSummaryLimiter, getSummary);

export default router;
