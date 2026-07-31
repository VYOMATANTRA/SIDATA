import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../configs/index.js';

export interface AuthRequest extends Request {
  user?: string | jwt.JwtPayload;
}

export const verifyToken = (req: AuthRequest, res: Response, next: NextFunction): any => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Akses ditolak.' });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Format token tidak valid.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = decoded;

    next();
  } catch (error) {
    console.error('Error saat verifikasi token:', error);
    return res.status(403).json({ error: 'Token tidak valid atau sudah kedaluwarsa.' });
  }
};
