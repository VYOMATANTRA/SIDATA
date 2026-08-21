import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth.middleware.js';

export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Response | void => {
  const user = req.user;

  if (!user || typeof user === 'string' || !('role' in user) || typeof user.role !== 'string') {
    return res.status(401).json({ error: 'Akses ditolak. Pengguna belum terautentikasi.' });
  }

  if (user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ error: 'Akses ditolak. Membutuhkan hak akses Admin.' });
  }

  return next();
};
