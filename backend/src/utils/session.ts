import type { Response } from 'express';
import prisma from './prisma.js';
import { generateAccessToken, generateRefreshToken } from './jwt.js';

export interface UserSessionPayload {
  id: string;
  email: string;
  role: string;
}

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

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
  });

  return { accessToken, refreshToken };
}
