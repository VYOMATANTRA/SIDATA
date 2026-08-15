import type { Response } from 'express';
import prisma from './prisma.js';
import { generateAccessToken, generateRefreshToken } from './jwt.js';

export interface UserSessionPayload {
  id: string;
  email: string;
  role: string;
}

export const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';

/**
 * Shared cookie attributes for the refresh token cookie. `path: '/'` is required — without
 * it, the browser derives a default path from the *request* directory (RFC 6265), which
 * differs between where the cookie is set (e.g. /api/auth/login -> /api/auth, or
 * /api/auth/google/callback -> /api/auth/google) and where it needs to be sent
 * (/api/auth/refresh, /api/auth/logout). res.clearCookie must be called with this exact
 * same object, or it targets the wrong cookie and silently fails to clear it.
 */
export const REFRESH_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

/**
 * Issues JWT Access Token and HTTP-only Refresh Token cookie,
 * persisting the refresh token record in the database.
 */
export async function issueSession(
  res: Response,
  user: UserSessionPayload,
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = generateAccessToken({
    id: user.id,
    email: user.email,
    role: user.role,
  });

  const refreshToken = generateRefreshToken(user.id);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 1);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: refreshToken,
      expiresAt,
    },
  });

  res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    ...REFRESH_TOKEN_COOKIE_OPTIONS,
    maxAge: 24 * 60 * 60 * 1000,
  });

  return { accessToken, refreshToken };
}
