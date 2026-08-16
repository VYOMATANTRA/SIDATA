import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth.middleware.js';
import prisma from '../utils/prisma.js';

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    const user = req.user;

    if (!user || typeof user === 'string' || !('id' in user) || typeof user.id !== 'string') {
      return res.status(401).json({ error: 'Akses ditolak. Pengguna belum terautentikasi.' });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { role: true },
    });

    if (!dbUser || dbUser.deletedAt != null) {
      return res.status(401).json({ error: 'Pengguna tidak ditemukan atau telah dinonaktifkan.' });
    }

    if (!dbUser.role || dbUser.role.name.toLowerCase() !== 'admin') {
      return res.status(403).json({ error: 'Akses ditolak. Membutuhkan hak akses Admin.' });
    }

    next();
  } catch (error) {
    console.error('Error saat verifikasi role admin:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};
