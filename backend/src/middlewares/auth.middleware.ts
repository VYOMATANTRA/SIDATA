import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../configs/index.js';
import type { TokenPayload } from '../utils/jwt.js';
import prisma from '../utils/prisma.js';

export interface AuthRequest extends Request {
  user?: TokenPayload | jwt.JwtPayload;
}

export const verifyToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<Response | void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Akses ditolak.' });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Format token tidak valid.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload & jwt.JwtPayload;

    if (decoded && decoded.scope === 'first_login_only') {
      return res.status(403).json({
        error:
          'Token setup tidak dapat digunakan untuk mengakses endpoint ini. Silakan selesaikan pembuatan kata sandi terlebih dahulu.',
      });
    }

    if (
      !decoded ||
      typeof decoded !== 'object' ||
      !('id' in decoded) ||
      typeof decoded.id !== 'string'
    ) {
      return res.status(401).json({ error: 'Token tidak valid.' });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { role: true },
    });

    if (!dbUser || dbUser.deletedAt != null) {
      return res.status(401).json({ error: 'Pengguna tidak ditemukan atau telah dinonaktifkan.' });
    }

    req.user = {
      id: dbUser.id,
      email: dbUser.email,
      role: dbUser.role.name,
    };

    next();
  } catch (error) {
    console.error('Error saat verifikasi token:', error);
    return res.status(403).json({ error: 'Token tidak valid atau sudah kedaluwarsa.' });
  }
};
