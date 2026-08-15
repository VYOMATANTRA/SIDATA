import { Router } from 'express';
import {
  getUsers,
  getRoles,
  createUser,
  updateUserRole,
  deleteUser,
} from '../controllers/users.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/role.middleware.js';

const router = Router();

router.use(verifyToken, requireAdmin);

router.get('/', getUsers);
router.get('/roles', getRoles);
router.post('/', createUser);
router.patch('/:id/role', updateUserRole);
router.delete('/:id', deleteUser);

export default router;
