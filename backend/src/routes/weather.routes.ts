import { Router } from 'express';
import { getForecast } from '../controllers/weather.controller.js';
import { weatherLimiter } from '../middlewares/rateLimit.middleware.js';

const router = Router();

router.use(weatherLimiter);

router.get('/', getForecast);

export default router;
