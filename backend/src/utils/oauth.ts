import { OAuth2Client } from 'google-auth-library';
import crypto from 'node:crypto';
import type { Response } from 'express';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL } from '../configs/index.js';

export interface GoogleUserProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string | undefined;
  picture?: string | undefined;
}

export function getOAuth2Client(): OAuth2Client {
  return new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL);
}

export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function setOAuthCookies(res: Response, options: { state: string; verifier: string }): void {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    maxAge: 5 * 60 * 1000, // 5 minutes
  };

  res.cookie('oauth_state', options.state, cookieOptions);
  res.cookie('oauth_verifier', options.verifier, cookieOptions);
}

export function clearOAuthCookies(res: Response): void {
  const isProd = process.env.NODE_ENV === 'production';
  const clearOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
  };

  res.clearCookie('oauth_state', clearOptions);
  res.clearCookie('oauth_verifier', clearOptions);
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleUserProfile> {
  const client = getOAuth2Client();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload) {
    throw new Error('ID Token payload tidak valid dari Google');
  }

  if (!payload.sub || !payload.email) {
    throw new Error('Identitas email/sub dari Google tidak ditemukan');
  }

  if (!payload.email_verified) {
    throw new Error('Email Google belum terverifikasi');
  }

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    email_verified: payload.email_verified,
    name: payload.name,
    picture: payload.picture,
  };
}
