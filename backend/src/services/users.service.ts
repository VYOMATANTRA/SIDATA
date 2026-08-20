import bcrypt from 'bcryptjs';
import zxcvbn from 'zxcvbn';
import prisma from '../utils/prisma.js';
import { normalizeEmail } from '../utils/validation.js';

export class UserServiceError extends Error {
  statusCode: number;
  suggestions?: string[] | undefined;

  constructor(message: string, statusCode: number, suggestions?: string[] | undefined) {
    super(message);
    this.name = 'UserServiceError';
    this.statusCode = statusCode;
    this.suggestions = suggestions;
  }
}

export const getUsersList = async () => {
  return prisma.user.findMany({
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
};

export const getRolesList = async () => {
  return prisma.role.findMany({
    orderBy: { name: 'asc' },
  });
};

export const createAdminUser = async (payload: {
  email?: unknown;
  roleId?: unknown;
  password?: unknown;
}) => {
  const { email, roleId, password } = payload;

  if (!email || !roleId || !password) {
    throw new UserServiceError('Email, Role, dan Password wajib diisi.', 400);
  }

  if (typeof email !== 'string' || typeof roleId !== 'string' || typeof password !== 'string') {
    throw new UserServiceError('Format data tidak valid.', 400);
  }

  let normalizedEmail: string;
  try {
    normalizedEmail = normalizeEmail(email);
  } catch (error) {
    throw new UserServiceError(
      error instanceof Error ? error.message : 'Format email tidak valid',
      400,
    );
  }

  if (password.length < 8) {
    throw new UserServiceError('Password minimal harus 8 karakter (Standar NIST).', 400);
  }
  if (password.length > 128) {
    throw new UserServiceError('Password terlalu panjang (maksimal 128 karakter).', 400);
  }

  const passwordEvaluation = zxcvbn(password, [normalizedEmail]);
  if (passwordEvaluation.score < 2) {
    throw new UserServiceError(
      'Password terlalu lemah atau umum digunakan.',
      400,
      passwordEvaluation.feedback.suggestions,
    );
  }

  const targetRole = await prisma.role.findUnique({
    where: { id: roleId },
  });
  if (!targetRole) {
    throw new UserServiceError('Role yang dipilih tidak ditemukan.', 404);
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    if (existingUser.deletedAt != null) {
      throw new UserServiceError(
        'Akun dengan email ini telah dinonaktifkan. Gunakan fitur aktivasi kembali akun untuk mengaktifkannya.',
        409,
      );
    }
    throw new UserServiceError('Email ini sudah dipakai', 409);
  }

  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

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

  return newUser;
};

export const reactivateExistingUser = async (id: unknown) => {
  if (!id || typeof id !== 'string') {
    throw new UserServiceError('ID pengguna tidak valid.', 400);
  }

  const targetUser = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });

  if (!targetUser) {
    throw new UserServiceError('Pengguna tidak ditemukan.', 404);
  }

  if (targetUser.deletedAt == null) {
    throw new UserServiceError('Pengguna sudah dalam status aktif.', 400);
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

  return updatedUser;
};

export const updateUserRoleService = async (params: {
  id: unknown;
  roleId: unknown;
  requestingUserId?: string | null | undefined;
}) => {
  const { id, roleId, requestingUserId } = params;

  if (!id || typeof id !== 'string') {
    throw new UserServiceError('ID pengguna tidak valid.', 400);
  }

  if (!roleId || typeof roleId !== 'string') {
    throw new UserServiceError('Role ID wajib diisi.', 400);
  }

  const user = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });

  if (!user || user.deletedAt != null) {
    throw new UserServiceError('Pengguna tidak ditemukan atau telah dinonaktifkan.', 404);
  }

  const targetRole = await prisma.role.findUnique({
    where: { id: roleId },
  });

  if (!targetRole) {
    throw new UserServiceError('Role tidak ditemukan.', 404);
  }

  const isCurrentAdmin = user.role.name.toLowerCase() === 'admin';
  const isTargetAdmin = targetRole.name.toLowerCase() === 'admin';

  if (isCurrentAdmin && !isTargetAdmin) {
    if (requestingUserId && requestingUserId === id) {
      throw new UserServiceError('Anda tidak dapat menurunkan role akun Anda sendiri.', 400);
    }

    const adminCount = await prisma.user.count({
      where: {
        deletedAt: null,
        role: { name: 'admin' },
      },
    });

    if (adminCount <= 1) {
      throw new UserServiceError('Tidak dapat mengubah role Admin terakhir.', 400);
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

  return updatedUser;
};

export const changeUserPasswordService = async (params: {
  id: unknown;
  password: unknown;
  requestingUserId?: string | null | undefined;
}) => {
  const { id, password, requestingUserId } = params;

  if (!id || typeof id !== 'string') {
    throw new UserServiceError('ID pengguna tidak valid.', 400);
  }

  if (!password || typeof password !== 'string') {
    throw new UserServiceError('Password baru wajib diisi.', 400);
  }

  if (requestingUserId && requestingUserId === id) {
    throw new UserServiceError(
      'Anda tidak dapat mengatur ulang kata sandi akun Anda sendiri melalui menu ini.',
      400,
    );
  }

  const targetUser = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });

  if (!targetUser) {
    throw new UserServiceError('Pengguna tidak ditemukan.', 404);
  }

  if (targetUser.deletedAt != null) {
    throw new UserServiceError('Pengguna dalam status nonaktif.', 400);
  }

  if (targetUser.role?.name?.toLowerCase() === 'admin') {
    throw new UserServiceError(
      'Admin tidak dapat mengatur ulang kata sandi sesama akun Admin.',
      403,
    );
  }

  if (password.length < 8) {
    throw new UserServiceError('Password minimal harus 8 karakter (Standar NIST).', 400);
  }
  if (password.length > 128) {
    throw new UserServiceError('Password terlalu panjang (maksimal 128 karakter).', 400);
  }

  const passwordEvaluation = zxcvbn(password, [targetUser.email]);
  if (passwordEvaluation.score < 2) {
    throw new UserServiceError(
      'Password terlalu lemah atau umum digunakan.',
      400,
      passwordEvaluation.feedback.suggestions,
    );
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
};

export const deleteUserService = async (params: {
  id: unknown;
  requestingUserId?: string | null | undefined;
}) => {
  const { id, requestingUserId } = params;

  if (!id || typeof id !== 'string') {
    throw new UserServiceError('ID pengguna tidak valid.', 400);
  }

  if (requestingUserId && requestingUserId === id) {
    throw new UserServiceError('Anda tidak dapat menonaktifkan akun Anda sendiri.', 400);
  }

  const targetUser = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });

  if (!targetUser) {
    throw new UserServiceError('Pengguna tidak ditemukan.', 404);
  }

  if (targetUser.deletedAt != null) {
    throw new UserServiceError('Pengguna sudah dalam status nonaktif.', 400);
  }

  if (targetUser.role.name.toLowerCase() === 'admin') {
    throw new UserServiceError('Admin tidak dapat menonaktifkan sesama akun Admin.', 403);
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
};
