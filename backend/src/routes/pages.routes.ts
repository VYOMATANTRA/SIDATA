import { Router } from 'express';
import { listPages, getPage } from '../controllers/pages.controller.js';
import { pagesLimiter } from '../middlewares/rateLimit.middleware.js';

const router = Router();

router.get('/', pagesLimiter, listPages);
router.get('/:slug', pagesLimiter, getPage);

export default router;
