import bcrypt from 'bcryptjs';
import zxcvbn from 'zxcvbn';
import prisma from '../utils/prisma.js';
import {
  buildAuditLog,
  AUDIT_ACTIONS,
  type AuditActor,
  type AuditRequestContext,
} from './audit.service.js';

export class ProfileServiceError extends Error {
  statusCode: number;
  suggestions?: string[] | undefined;

  constructor(message: string, statusCode: number, suggestions?: string[] | undefined) {
    super(message);
    this.name = 'ProfileServiceError';
    this.statusCode = statusCode;
    this.suggestions = suggestions;
  }
}

export const changeOwnPasswordService = async (params: {
  userId?: string | undefined;
  currentPassword?: unknown;
  newPassword?: unknown;
  actor?: AuditActor | null | undefined;
  context?: AuditRequestContext | undefined;
}) => {
  const { userId, currentPassword, newPassword, actor, context } = params;

  if (!userId) {
    throw new ProfileServiceError('Akses ditolak.', 401);
  }

  if (!currentPassword || typeof currentPassword !== 'string') {
    throw new ProfileServiceError('Kata sandi saat ini wajib diisi.', 400);
  }
  if (!newPassword || typeof newPassword !== 'string') {
    throw new ProfileServiceError('Kata sandi baru wajib diisi.', 400);
  }

  if (newPassword.length < 8) {
    throw new ProfileServiceError('Kata sandi baru minimal harus 8 karakter (Standar NIST).', 400);
  }
  if (newPassword.length > 128) {
    throw new ProfileServiceError('Kata sandi baru terlalu panjang (maksimal 128 karakter).', 400);
  }

  if (currentPassword === newPassword) {
    throw new ProfileServiceError('Kata sandi baru tidak boleh sama dengan kata sandi lama.', 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      password_hash: true,
      auth_provider: true,
      deletedAt: true,
    },
  });

  if (!user || user.deletedAt != null) {
    throw new ProfileServiceError('Akses ditolak.', 401);
  }

  if (!user.password_hash) {
    throw new ProfileServiceError(
      'Akun Anda menggunakan autentikasi pihak ketiga (OAuth) dan tidak memiliki kata sandi lokal.',
      400,
    );
  }

  const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isCurrentPasswordValid) {
    throw new ProfileServiceError('Kredensial tidak valid.', 401);
  }

  const isNewSameAsOld = await bcrypt.compare(newPassword, user.password_hash);
  if (isNewSameAsOld) {
    throw new ProfileServiceError('Kata sandi baru tidak boleh sama dengan kata sandi lama.', 400);
  }

  const strength = zxcvbn(newPassword, [user.email]);
  if (strength.score < 2) {
    const suggestions = strength.feedback.suggestions
      ? [...strength.feedback.suggestions]
      : undefined;
    throw new ProfileServiceError(
      'Kata sandi baru terlalu lemah atau umum digunakan.',
      400,
      suggestions,
    );
  }

  const saltRounds = 10;
  const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        password_hash: newPasswordHash,
        requires_password_change: false,
      },
    }),
    prisma.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true },
    }),
    buildAuditLog({
      action: AUDIT_ACTIONS.PROFILE_PASSWORD_CHANGED,
      actor: actor ?? { id: userId, email: user.email },
      target: { type: 'user', id: userId, label: user.email },
      context,
    }),
  ]);
};
