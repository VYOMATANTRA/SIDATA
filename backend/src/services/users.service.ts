import bcrypt from 'bcryptjs';
import zxcvbn from 'zxcvbn';
import prisma from '../utils/prisma.js';
import { normalizeEmail } from '../utils/validation.js';
import {
  buildAuditLog,
  AUDIT_ACTIONS,
  type AuditActor,
  type AuditRequestContext,
} from './audit.service.js';

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

export const createAdminUser = async (
  payload: {
    email?: unknown;
    roleId?: unknown;
    password?: unknown;
  },
  actor?: AuditActor | null | undefined,
  context?: AuditRequestContext | undefined,
) => {
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

  const strength = zxcvbn(password, [normalizedEmail]);
  if (strength.score < 2) {
    const suggestions = strength.feedback.suggestions
      ? [...strength.feedback.suggestions]
      : undefined;
    throw new UserServiceError('Password terlalu lemah atau umum digunakan.', 400, suggestions);
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

  const [newUser] = await prisma.$transaction([
    prisma.user.create({
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
    }),
    buildAuditLog({
      action: AUDIT_ACTIONS.USER_CREATED_BY_ADMIN,
      actor,
      target: { type: 'user', label: normalizedEmail },
      metadata: { roleId: targetRole.id, roleName: targetRole.name },
      context,
    }),
  ]);

  return newUser;
};

export const reactivateExistingUser = async (
  id: unknown,
  actor?: AuditActor | null | undefined,
  context?: AuditRequestContext | undefined,
) => {
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

  const [updatedUser] = await prisma.$transaction([
    prisma.user.update({
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
    }),
    buildAuditLog({
      action: AUDIT_ACTIONS.USER_REACTIVATED,
      actor,
      target: { type: 'user', id: targetUser.id, label: targetUser.email },
      context,
    }),
  ]);

  return updatedUser;
};

export const updateUserRoleService = async (params: {
  id: unknown;
  roleId: unknown;
  requestingUserId?: string | null | undefined;
  actor?: AuditActor | null | undefined;
  context?: AuditRequestContext | undefined;
}) => {
  const { id, roleId, requestingUserId, actor, context } = params;

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
    buildAuditLog({
      action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
      actor,
      target: { type: 'user', id: user.id, label: user.email },
      metadata: {
        fromRoleId: user.role.id,
        fromRoleName: user.role.name,
        toRoleId: targetRole.id,
        toRoleName: targetRole.name,
      },
      context,
    }),
  ]);

  return updatedUser;
};

export const changeUserPasswordService = async (params: {
  id: unknown;
  password: unknown;
  requestingUserId?: string | null | undefined;
  actor?: AuditActor | null | undefined;
  context?: AuditRequestContext | undefined;
}) => {
  const { id, password, requestingUserId, actor, context } = params;

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

  const strength = zxcvbn(password, [targetUser.email]);
  if (strength.score < 2) {
    const suggestions = strength.feedback.suggestions
      ? [...strength.feedback.suggestions]
      : undefined;
    throw new UserServiceError('Password terlalu lemah atau umum digunakan.', 400, suggestions);
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
    buildAuditLog({
      action: AUDIT_ACTIONS.USER_PASSWORD_RESET_BY_ADMIN,
      actor,
      target: { type: 'user', id: targetUser.id, label: targetUser.email },
      context,
    }),
  ]);
};

export const deleteUserService = async (params: {
  id: unknown;
  requestingUserId?: string | null | undefined;
  actor?: AuditActor | null | undefined;
  context?: AuditRequestContext | undefined;
}) => {
  const { id, requestingUserId, actor, context } = params;

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
    buildAuditLog({
      action: AUDIT_ACTIONS.USER_DEACTIVATED,
      actor,
      target: { type: 'user', id: targetUser.id, label: targetUser.email },
      context,
    }),
  ]);
};
