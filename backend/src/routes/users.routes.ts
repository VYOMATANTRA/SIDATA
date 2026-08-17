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
import { userManagementLimiter } from '../middlewares/rateLimit.middleware.js';

const router = Router();

router.use(userManagementLimiter, verifyToken, requireAdmin);

router.get('/', getUsers);
router.get('/roles', getRoles);
router.post('/', createUser);
router.patch('/:id/reactivate', reactivateUser);
router.patch('/:id/password', changeUserPassword);
router.patch('/:id/role', updateUserRole);
router.delete('/:id', deleteUser);

export default router;
