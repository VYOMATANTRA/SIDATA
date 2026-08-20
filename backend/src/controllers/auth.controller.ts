import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma.js';
import { generateAccessToken, generateSetupToken } from '../utils/jwt.js';
import {
  issueSession,
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_OPTIONS,
} from '../utils/session.js';
import jwt from 'jsonwebtoken';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { generateCsrfToken } from '../middlewares/csrf.middleware.js';
import zxcvbn from 'zxcvbn';
import { JWT_SECRET, JWT_REFRESH_SECRET } from '../configs/index.js';
import { normalizeEmail } from '../utils/validation.js';
import { generate6DigitOtp, hashOtp, getOtpExpiration } from '../utils/otp.js';
import { sendOtpEmail } from '../utils/mailer.js';

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
      if (existingUser.deletedAt != null) {
        return res.status(409).json({
          error:
            'Akun dengan email ini telah dinonaktifkan. Silakan hubungi Administrator untuk mengaktifkan kembali akun Anda.',
        });
      }
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
        email_verified: false,
        requires_password_change: false,
        roleId: userRole.id,
      },
      select: {
        id: true,
        email: true,
        auth_provider: true,
        email_verified: true,
        role: {
          select: {
            name: true,
          },
        },
        createdAt: true,
      },
    });

    const otp = generate6DigitOtp();
    const hashedOtp = hashOtp(otp);
    const expiresAt = getOtpExpiration(15);

    const emailSent = await sendOtpEmail({ to: normalizedEmail, otp });

    if (emailSent) {
      await prisma.emailOtp.create({
        data: {
          userId: newUser.id,
          otpHash: hashedOtp,
          expiresAt,
        },
      });
    }

    return res.status(201).json({
      message: emailSent
        ? 'Registrasi berhasil. Kode OTP verifikasi telah dikirim ke email Anda.'
        : 'Registrasi berhasil, tetapi gagal mengirim email OTP. Silakan tekan tombol kirim ulang OTP.',
      email: normalizedEmail,
      requiresOtp: true,
      otpSent: emailSent,
    });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
      return res.status(409).json({ error: 'Email sudah terdaftar' });
    }

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
      return res
        .status(400)
        .json({ error: error instanceof Error ? error.message : 'Format email tidak valid' });
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { role: true },
    });

    if (!user || user.deletedAt != null || !user.password_hash) {
      return res.status(401).json({ error: 'Kredensial tidak valid' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Kredensial tidak valid' });
    }

    if (!user.email_verified) {
      return res.status(403).json({
        error:
          'Email Anda belum diverifikasi. Silakan masukkan kode OTP yang dikirim ke email Anda.',
        requiresOtp: true,
        email: user.email,
      });
    }

    if (user.requires_password_change) {
      const setupToken = generateSetupToken(user.id);
      return res.status(200).json({
        status: 'REQUIRES_PASSWORD_CHANGE',
        mustChangePassword: true,
        setupToken,
        message: 'Anda harus mengganti kata sandi pada login pertama.',
      });
    }

    const { accessToken } = await issueSession(res, {
      id: user.id,
      email: user.email,
      role: user.role.name,
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

export const firstLoginPassword = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { setupToken: bodySetupToken, newPassword } = req.body;
    const authHeader = req.headers.authorization;
    const bearerToken =
      authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    const setupToken = bodySetupToken || bearerToken;

    if (!setupToken) {
      return res.status(401).json({ error: 'Token setup tidak ditemukan.' });
    }

    if (!newPassword) {
      return res.status(400).json({ error: 'Kata sandi baru wajib diisi.' });
    }

    let decoded: jwt.JwtPayload;
    try {
      const verified = jwt.verify(setupToken, JWT_SECRET);
      if (typeof verified === 'string' || !verified) {
        return res.status(403).json({ error: 'Token setup tidak valid.' });
      }
      decoded = verified;
    } catch {
      return res.status(403).json({ error: 'Token setup tidak valid atau sudah kedaluwarsa.' });
    }

    if (!decoded || decoded.scope !== 'first_login_only' || typeof decoded.id !== 'string') {
      return res.status(403).json({ error: 'Token setup tidak valid.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { role: true },
    });

    if (!user || user.deletedAt != null) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan atau telah dinonaktifkan.' });
    }

    if (user.auth_provider !== 'local') {
      return res.status(403).json({
        error:
          'Akun ini menggunakan autentikasi pihak ketiga dan tidak dapat mengatur kata sandi lokal.',
      });
    }

    if (!user.requires_password_change) {
      return res.status(403).json({ error: 'Token setup tidak valid atau sudah digunakan.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password minimal harus 8 karakter (Standar NIST).' });
    }
    if (newPassword.length > 128) {
      return res.status(400).json({ error: 'Password terlalu panjang (maksimal 128 karakter).' });
    }

    const passwordEvaluation = zxcvbn(newPassword, [user.email]);
    if (passwordEvaluation.score < 2) {
      return res.status(400).json({
        error: 'Password terlalu lemah atau umum digunakan.',
        suggestions: passwordEvaluation.feedback.suggestions,
      });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash: passwordHash,
        requires_password_change: false,
      },
    });

    const { accessToken } = await issueSession(res, {
      id: user.id,
      email: user.email,
      role: user.role.name,
    });

    return res.status(200).json({
      message: 'Kata sandi berhasil diperbarui.',
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role.name,
      },
    });
  } catch (error) {
    console.error('Error saat pembaruan kata sandi login pertama:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const getCsrfToken = async (req: Request, res: Response): Promise<Response> => {
  const csrfToken = generateCsrfToken(req, res);

  return res.status(200).json({ csrfToken });
};

export const refreshToken = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const token = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];

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

    if (existingToken.isRevoked || existingToken.user.deletedAt != null) {
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
      user: {
        id: existingToken.user.id,
        email: existingToken.user.email,
        role: existingToken.user.role.name,
      },
    });
  } catch (error) {
    console.error('Error saat memperbarui token:', error);
    return res.status(403).json({ error: 'Refresh token tidak valid atau kedaluwarsa' });
  }
};

export const logout = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const token = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];

    if (!token) {
      return res.status(204).send(); // 204 No Content
    }

    await prisma.refreshToken.updateMany({
      where: { token },
      data: { isRevoked: true },
    });

    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_OPTIONS);

    return res.status(200).json({ message: 'Logout berhasil' });
  } catch (error) {
    console.error('Error saat logout:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server saat logout' });
  }
};

//Dummy endpoint, for testing purposes
export const getMe = async (req: AuthRequest, res: Response): Promise<Response | void> => {
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
