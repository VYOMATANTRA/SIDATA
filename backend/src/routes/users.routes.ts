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

router.use(verifyToken, requireAdmin);

router.get('/', userManagementReadLimiter, getUsers);
router.get('/roles', userManagementReadLimiter, getRoles);
router.post('/', userManagementWriteLimiter, createUser);
router.patch('/:id/reactivate', userManagementWriteLimiter, reactivateUser);
router.patch('/:id/password', userManagementWriteLimiter, changeUserPassword);
router.patch('/:id/role', userManagementWriteLimiter, updateUserRole);
router.delete('/:id', userManagementWriteLimiter, deleteUser);

export default router;
