import type { Response } from 'express';
import bcrypt from 'bcryptjs';
import zxcvbn from 'zxcvbn';
import prisma from '../utils/prisma.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { normalizeEmail } from '../utils/validation.js';

export const getUsers = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        auth_provider: true,
        email_verified: true,
        requires_password_change: true,
        deletedAt: true,
        roleId: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ users });
  } catch (error) {
    console.error('Error saat mengambil daftar pengguna:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const getRoles = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const roles = await prisma.role.findMany({
      orderBy: { name: 'asc' },
    });
    return res.status(200).json({ roles });
  } catch (error) {
    console.error('Error saat mengambil daftar role:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const createUser = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const { email, roleId, password } = req.body;

    if (!email || !roleId || !password) {
      return res.status(400).json({ error: 'Email, Role, dan Password wajib diisi.' });
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

    const targetRole = await prisma.role.findUnique({
      where: { id: roleId },
    });
    if (!targetRole) {
      return res.status(404).json({ error: 'Role yang dipilih tidak ditemukan.' });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res.status(409).json({ error: 'Email ini sudah dipakai' });
    }

    const newUser = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password_hash: passwordHash,
        auth_provider: 'local',
        email_verified: true,
        requires_password_change: true,
        roleId: targetRole.id,
      },
      select: {
        id: true,
        email: true,
        auth_provider: true,
        email_verified: true,
        requires_password_change: true,
        deletedAt: true,
        role: {
          select: { id: true, name: true },
        },
        createdAt: true,
      },
    });

    return res.status(201).json({
      message: 'Pengguna berhasil dibuat.',
      user: newUser,
    });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
      return res.status(409).json({ error: 'Email ini sudah dipakai' });
    }

    console.error('Error saat membuat pengguna:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const reactivateUser = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'ID pengguna tidak valid.' });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
    }

    if (targetUser.deletedAt == null) {
      return res.status(400).json({ error: 'Pengguna sudah dalam status aktif.' });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { deletedAt: null },
      select: {
        id: true,
        email: true,
        auth_provider: true,
        email_verified: true,
        requires_password_change: true,
        deletedAt: true,
        roleId: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
      },
    });

    return res.status(200).json({
      message: 'Pengguna berhasil diaktifkan kembali.',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Error saat mengaktifkan kembali pengguna:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const updateUserRole = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const { roleId } = req.body;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'ID pengguna tidak valid.' });
    }

    if (!roleId || typeof roleId !== 'string') {
      return res.status(400).json({ error: 'Role ID wajib diisi.' });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });

    if (!user || user.deletedAt != null) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan atau telah dinonaktifkan.' });
    }

    const newRole = await prisma.role.findUnique({
      where: { id: roleId },
    });
    if (!newRole) {
      return res.status(404).json({ error: 'Role tidak ditemukan.' });
    }

    const requestingUserId =
      typeof req.user === 'object' && req.user !== null ? (req.user as { id?: string }).id : null;

    const isDemotingAdmin =
      user.role.name.toLowerCase() === 'admin' && newRole.name.toLowerCase() !== 'admin';

    if (isDemotingAdmin) {
      if (requestingUserId && requestingUserId === id) {
        return res
          .status(400)
          .json({ error: 'Anda tidak dapat menurunkan role akun Anda sendiri.' });
      }

      const adminCount = await prisma.user.count({
        where: {
          deletedAt: null,
          role: { name: 'admin' },
        },
      });

      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Tidak dapat mengubah role Admin terakhir.' });
      }
    }

    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { roleId },
        select: {
          id: true,
          email: true,
          auth_provider: true,
          deletedAt: true,
          roleId: true,
          role: { select: { id: true, name: true } },
        },
      }),
      prisma.refreshToken.updateMany({
        where: { userId: id },
        data: { isRevoked: true },
      }),
    ]);

    return res.status(200).json({
      message: 'Role pengguna berhasil diperbarui.',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Error saat memperbarui role pengguna:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const changeUserPassword = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'ID pengguna tidak valid.' });
    }

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password baru wajib diisi.' });
    }

    const requestingUserId =
      typeof req.user === 'object' && req.user !== null ? (req.user as { id?: string }).id : null;

    if (requestingUserId && requestingUserId === id) {
      return res.status(400).json({
        error: 'Anda tidak dapat mengatur ulang kata sandi akun Anda sendiri melalui menu ini.',
      });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
    }

    if (targetUser.deletedAt != null) {
      return res.status(400).json({ error: 'Pengguna dalam status nonaktif.' });
    }

    if (targetUser.role?.name?.toLowerCase() === 'admin') {
      return res
        .status(403)
        .json({ error: 'Admin tidak dapat mengatur ulang kata sandi sesama akun Admin.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password minimal harus 8 karakter (Standar NIST).' });
    }
    if (password.length > 128) {
      return res.status(400).json({ error: 'Password terlalu panjang (maksimal 128 karakter).' });
    }

    const passwordEvaluation = zxcvbn(password, [targetUser.email]);
    if (passwordEvaluation.score < 2) {
      return res.status(400).json({
        error: 'Password terlalu lemah atau umum digunakan.',
        suggestions: passwordEvaluation.feedback.suggestions,
      });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: {
          password_hash: passwordHash,
          requires_password_change: true,
          auth_provider: 'local',
          provider_id: null,
        },
      }),
      prisma.refreshToken.updateMany({
        where: { userId: id },
        data: { isRevoked: true },
      }),
    ]);

    return res.status(200).json({ message: 'Password pengguna berhasil diperbarui.' });
  } catch (error) {
    console.error('Error saat mengubah password pengguna:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const deleteUser = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'ID pengguna tidak valid.' });
    }

    const requestingUserId =
      typeof req.user === 'object' && req.user !== null ? (req.user as { id?: string }).id : null;

    if (requestingUserId && requestingUserId === id) {
      return res.status(400).json({ error: 'Anda tidak dapat menonaktifkan akun Anda sendiri.' });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
    }

    if (targetUser.deletedAt != null) {
      return res.status(400).json({ error: 'Pengguna sudah dalam status nonaktif.' });
    }

    if (targetUser.role.name.toLowerCase() === 'admin') {
      return res.status(403).json({ error: 'Admin tidak dapat menonaktifkan sesama akun Admin.' });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
      prisma.refreshToken.updateMany({
        where: { userId: id },
        data: { isRevoked: true },
      }),
    ]);

    return res.status(200).json({ message: 'Pengguna berhasil dinonaktifkan.' });
  } catch (error) {
    console.error('Error saat menghapus pengguna:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};
