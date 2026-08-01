import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma.js';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt.js';
import jwt from 'jsonwebtoken';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import zxcvbn from 'zxcvbn';
import { JWT_REFRESH_SECRET } from '../configs/index.js';
import { normalizeEmail } from '../utils/validation.js';

export const register = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { email, password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password wajib diisi' });
    }

    let normalizedEmail: string;

    try {
      normalizedEmail = normalizeEmail(email);
    } catch (error) {
      return res
        .status(400)
        .json({ error: error instanceof Error ? error.message : 'Format email tidak valid' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password minimal harus 8 karakter (Standar NIST).' });
    }
    if (password.length > 128) {
      return res.status(400).json({ error: 'Password terlalu panjang (maksimal 128 karakter).' });
    }

    const passwordEvaluation = zxcvbn(password, [normalizedEmail]);

    if (passwordEvaluation.score < 2) {
      return res.status(400).json({
        error: 'Password terlalu lemah atau umum digunakan.',
        suggestions: passwordEvaluation.feedback.suggestions,
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res.status(409).json({ error: 'Email sudah terdaftar' });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const userRole = await prisma.role.findUnique({
      where: { name: 'user' },
    });

    if (!userRole) {
      return res.status(500).json({ error: 'Role default tidak ditemukan di server' });
    }

    const newUser = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password_hash: passwordHash,
        auth_provider: 'local',
        roleId: userRole.id,
      },
      select: {
        id: true,
        email: true,
        auth_provider: true,
        role: {
          select: {
            name: true,
          },
        },
        createdAt: true,
      },
    });

    return res.status(201).json({
      message: 'Registrasi berhasil',
      user: newUser,
    });
  } catch (error) {
    console.error('Error saat registrasi:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const login = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { email, password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password wajib diisi' });
    }

    let normalizedEmail: string;

    try {
      normalizedEmail = normalizeEmail(email);
    } catch (error) {
      return res.status(400).json({ error: 'Format email tidak valid' });
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { role: true },
    });

    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Kredensial tidak valid' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Kredensial tidak valid' });
    }

    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role.name,
    });

    const refreshToken = generateRefreshToken(user.id);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 1);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: expiresAt,
      },
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Hanya HTTPS di production
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      message: 'Login berhasil',
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role.name,
      },
    });
  } catch (error) {
    console.error('Error saat login:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const refreshToken = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const token = req.cookies?.refreshToken;

    if (!token) {
      return res.status(401).json({ error: 'Refresh token tidak ditemukan' });
    }

    const existingToken = await prisma.refreshToken.findUnique({
      where: { token },
      include: { user: { include: { role: true } } },
    });

    if (!existingToken) {
      return res.status(403).json({ error: 'Refresh token tidak valid' });
    }

    if (existingToken.isRevoked) {
      return res.status(403).json({ error: 'Refresh token sudah dicabut' });
    }

    if (new Date() > existingToken.expiresAt) {
      await prisma.refreshToken.update({
        where: { id: existingToken.id },
        data: { isRevoked: true },
      });
      return res
        .status(403)
        .json({ error: 'Refresh token sudah kedaluwarsa, silakan login ulang' });
    }

    const payload = jwt.verify(token, JWT_REFRESH_SECRET) as { id: string };

    if (!payload || payload.id !== existingToken.userId) {
      return res.status(403).json({ error: 'Token tidak cocok' });
    }

    const newAccessToken = generateAccessToken({
      id: existingToken.user.id,
      email: existingToken.user.email,
      role: existingToken.user.role.name,
    });

    return res.status(200).json({
      message: 'Token berhasil diperbarui',
      accessToken: newAccessToken,
    });
  } catch (error) {
    console.error('Error saat memperbarui token:', error);
    return res.status(403).json({ error: 'Refresh token tidak valid atau kedaluwarsa' });
  }
};

export const logout = async (req: Request, res: Response): Promise<any> => {
  try {
    const token = req.cookies?.refreshToken;

    if (!token) {
      return res.status(204).send(); // 204 No Content
    }

    await prisma.refreshToken.updateMany({
      where: { token },
      data: { isRevoked: true },
    });

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    return res.status(200).json({ message: 'Logout berhasil' });
  } catch (error) {
    console.error('Error saat logout:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server saat logout' });
  }
};

//Dummy endpoint, for testing purposes
export const getMe = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    return res.status(200).json({
      message: 'Berhasil mengakses profil',
      user: req.user,
    });
  } catch (error) {
    console.error('Error saat mengambil profil:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server' });
  }
};
