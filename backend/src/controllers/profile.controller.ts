import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import type { TokenPayload } from '../utils/jwt.js';
import { REFRESH_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_OPTIONS } from '../utils/session.js';
import { ProfileServiceError, changeOwnPasswordService } from '../services/profile.service.js';

/**
 * POST /api/profile/change-password
 *
 * Allows a logged-in user to change their own password by supplying their
 * current password and a new one. Identity is taken exclusively from the
 * verified JWT — never from the request body — to prevent IDOR.
 */
export const changeOwnPassword = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const jwtUser = req.user as TokenPayload | undefined;
    const userId = jwtUser?.id;
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: unknown;
      newPassword?: unknown;
    };

    await changeOwnPasswordService({ userId, currentPassword, newPassword });

    // Clear refresh token cookie on this response
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_OPTIONS);

    return res.status(200).json({
      message: 'Kata sandi berhasil diperbarui. Silakan login kembali.',
      sessionInvalidated: true,
    });
  } catch (error) {
    if (error instanceof ProfileServiceError) {
      return res.status(error.statusCode).json({
        error: error.message,
        ...(error.suggestions ? { suggestions: error.suggestions } : {}),
      });
    }

    console.error(
      'Error saat mengubah kata sandi:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server.',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server.' });
  }
};
