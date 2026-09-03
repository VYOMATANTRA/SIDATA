import { Router } from 'express';
import {
  getUsers,
  getRoles,
  createUser,
  reactivateUser,
  changeUserPassword,
  updateUserRole,
  deleteUser,
} from '../controllers/users.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/role.middleware.js';
import {
  userManagementReadLimiter,
  userManagementWriteLimiter,
} from '../middlewares/rateLimit.middleware.js';

const router = Router();

router.get('/', userManagementReadLimiter, verifyToken, requireAdmin, getUsers);
router.get('/roles', userManagementReadLimiter, verifyToken, requireAdmin, getRoles);
router.post('/', userManagementWriteLimiter, verifyToken, requireAdmin, createUser);
router.patch(
  '/:id/reactivate',
  userManagementWriteLimiter,
  verifyToken,
  requireAdmin,
  reactivateUser,
);
router.patch(
  '/:id/password',
  userManagementWriteLimiter,
  verifyToken,
  requireAdmin,
  changeUserPassword,
);
router.patch('/:id/role', userManagementWriteLimiter, verifyToken, requireAdmin, updateUserRole);
router.delete('/:id', userManagementWriteLimiter, verifyToken, requireAdmin, deleteUser);

export default router;
