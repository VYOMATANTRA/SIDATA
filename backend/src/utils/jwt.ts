import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { JWT_SECRET, JWT_REFRESH_SECRET } from '../configs/index.js';

export interface TokenPayload {
  id: string;
  email: string;
  role: string;
  scope?: string;
}

export const generateAccessToken = (payload: TokenPayload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
};

export const generateSetupToken = (userId: string) => {
  return jwt.sign({ id: userId, scope: 'first_login_only' }, JWT_SECRET, { expiresIn: '10m' });
};

export const generateRefreshToken = (userId: string) => {
  // jti makes each token unique even when issued for the same user within the same
  // second (identical iat/exp), which would otherwise collide against the `token`
  // column's UNIQUE constraint on refresh_tokens.
  const jti = crypto.randomBytes(16).toString('hex');
  return jwt.sign({ id: userId, jti }, JWT_REFRESH_SECRET, { expiresIn: '1d' });
};
