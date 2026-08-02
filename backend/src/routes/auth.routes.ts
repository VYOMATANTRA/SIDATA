import { Router } from 'express';
import {
  register,
  login,
  refreshToken,
  logout,
  getMe,
  getCsrfToken,
} from '../controllers/auth.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/csrf-token', getCsrfToken);
router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refreshToken);
router.post('/logout', logout);

router.get('/me', verifyToken, getMe);

export default router;
