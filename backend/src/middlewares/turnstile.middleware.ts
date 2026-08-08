import type { Request, Response, NextFunction } from 'express';
import { verifyTurnstileToken } from '../utils/turnstile.js';
import { TURNSTILE_SECRET } from '../configs/index.js';

export const requireTurnstile = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> => {
  // Skip if TURNSTILE_SECRET is empty in development
  if (!TURNSTILE_SECRET) {
    return next();
  }

  const turnstileToken =
    req.body?.['cf-turnstile-response'] ||
    req.body?.turnstileToken ||
    req.headers['x-turnstile-token'];

  const isValid = await verifyTurnstileToken(
    typeof turnstileToken === 'string' ? turnstileToken : undefined,
    req.ip,
  );

  if (!isValid) {
    return res
      .status(400)
      .json({ error: 'Verifikasi anti-bot (Turnstile) gagal. Silakan coba lagi.' });
  }

  return next();
};
