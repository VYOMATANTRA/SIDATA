import { Router } from 'express';
import { apiLimiter } from '../middlewares/rateLimit.middleware.js';

const router = Router();

router.get('/', apiLimiter, (req, res) => {
  res.json({ status: 'OK', message: 'Backend is running smoothly' });
});

export default router;
