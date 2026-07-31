import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../utils/prisma.js';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt.js';

export const register = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { email, password } = req.body;

    // 1. Validasi input dasar
    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan password wajib diisi' });
    }

    // 2. Cek apakah email sudah pernah terdaftar
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(409).json({ error: 'Email sudah terdaftar' });
    }

    // 3. Enkripsi (hash) password menggunakan bcrypt
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 4. Cari UUID untuk role default ('user')
    const userRole = await prisma.role.findUnique({
      where: { name: 'user' },
    });

    if (!userRole) {
      return res.status(500).json({ error: 'Role default tidak ditemukan di server' });
    }

    // 5. Simpan user baru ke database
    const newUser = await prisma.user.create({
      data: {
        email,
        password_hash: passwordHash,
        auth_provider: 'local',
        roleId: userRole.id,
      },
      // Pilih data yang ingin dikembalikan (jangan kembalikan password_hash)
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

    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan password wajib diisi' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
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
