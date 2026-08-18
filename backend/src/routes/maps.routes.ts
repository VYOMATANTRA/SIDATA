import { Router } from 'express';
import {
  listPoints,
  getPoint,
  listRtLeaders,
  getRtLeader,
  getSummary,
} from '../controllers/maps.controller.js';
import { mapsLimiter } from '../middlewares/rateLimit.middleware.js';

const router = Router();

router.use(mapsLimiter);

router.get('/points', listPoints);
router.get('/points/:id', getPoint);
router.get('/rt-leaders', listRtLeaders);
router.get('/rt-leaders/:rtNumber', getRtLeader);
router.get('/summary', getSummary);

export default router;
