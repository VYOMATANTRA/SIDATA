import type { Response } from 'express';
import bcrypt from 'bcryptjs';
import zxcvbn from 'zxcvbn';
import prisma from '../utils/prisma.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import type { TokenPayload } from '../utils/jwt.js';
import { REFRESH_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_OPTIONS } from '../utils/session.js';

/**
 * POST /api/profile/change-password
 *
 * Allows a logged-in user to change their own password by supplying their
 * current password and a new one. Identity is taken exclusively from the
 * verified JWT — never from the request body — to prevent IDOR.
 *
 * Security properties:
 *  - bcrypt.compare is constant-time → no timing oracle on wrong passwords
 *  - Old == New password is rejected before hashing to avoid silent no-ops
 *  - OAuth-only accounts (no password_hash) are rejected explicitly
 *  - Password hash swap + session revocation are performed in one atomic transaction
 *  - All refresh tokens are revoked; the refresh token cookie is cleared
 *  - Access token remains valid until natural expiry (~15 min) — accepted trade-off
 */
export const changeOwnPassword = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    // ── 1. Extract identity from JWT (never from body) ──────────────────────
    const jwtUser = req.user as TokenPayload | undefined;
    if (!jwtUser?.id) {
      return res.status(401).json({ error: 'Akses ditolak.' });
    }
    const userId = jwtUser.id;

    // ── 2. Validate request body ─────────────────────────────────────────────
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: unknown;
      newPassword?: unknown;
    };

    if (!currentPassword || typeof currentPassword !== 'string') {
      return res.status(400).json({ error: 'Kata sandi saat ini wajib diisi.' });
    }
    if (!newPassword || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'Kata sandi baru wajib diisi.' });
    }

    // ── 3. New password strength validation (before any DB call) ─────────────
    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ error: 'Kata sandi baru minimal harus 8 karakter (Standar NIST).' });
    }
    if (newPassword.length > 128) {
      return res
        .status(400)
        .json({ error: 'Kata sandi baru terlalu panjang (maksimal 128 karakter).' });
    }

    // Early same-password check (string-level, before bcrypt round-trips)
    // bcrypt check below is the authoritative guard; this catches the trivial case cheaply.
    if (currentPassword === newPassword) {
      return res
        .status(400)
        .json({ error: 'Kata sandi baru tidak boleh sama dengan kata sandi lama.' });
    }

    // ── 4. Fetch user from DB (verifyToken already confirmed existence + active status,
    //       but we need password_hash which is not on the JWT payload) ─────────
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

    // Defensive: middleware already blocks deleted users, but guard explicitly
    if (!user || user.deletedAt != null) {
      return res.status(401).json({ error: 'Akses ditolak.' });
    }

    // ── 5. Reject OAuth-only accounts (no local password set) ────────────────
    if (!user.password_hash) {
      return res.status(400).json({
        error:
          'Akun Anda menggunakan autentikasi pihak ketiga (OAuth) dan tidak memiliki kata sandi lokal.',
      });
    }

    // ── 6. Verify current password (constant-time bcrypt compare) ─────────────
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isCurrentPasswordValid) {
      // Intentionally identical message to login failures — no info leak
      return res.status(401).json({ error: 'Kredensial tidak valid.' });
    }

    // ── 7. Authoritative same-password guard (bcrypt-level) ──────────────────
    //       Catches the case where currentPassword and newPassword are different
    //       strings that hash to the same stored hash (e.g. bcrypt truncation edge-cases).
    const isNewSameAsOld = await bcrypt.compare(newPassword, user.password_hash);
    if (isNewSameAsOld) {
      return res
        .status(400)
        .json({ error: 'Kata sandi baru tidak boleh sama dengan kata sandi lama.' });
    }

    // ── 8. zxcvbn strength check (use email as user-context to penalise it) ──
    const passwordEvaluation = zxcvbn(newPassword, [user.email]);
    if (passwordEvaluation.score < 2) {
      return res.status(400).json({
        error: 'Kata sandi baru terlalu lemah atau umum digunakan.',
        suggestions: passwordEvaluation.feedback.suggestions,
      });
    }

    // ── 9. Hash the new password ─────────────────────────────────────────────
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // ── 10. Atomic transaction: swap hash + clear requires_password_change flag
    //         + revoke all refresh tokens for this user ──────────────────────
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
    ]);

    // ── 11. Clear the refresh token cookie on this response ──────────────────
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_OPTIONS);

    // ── 12. Respond ───────────────────────────────────────────────────────────
    return res.status(200).json({
      message: 'Kata sandi berhasil diperbarui. Silakan login kembali.',
      sessionInvalidated: true,
    });
  } catch (error) {
    console.error('Error saat mengubah kata sandi:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan internal server.' });
  }
};
