import { doubleCsrf } from 'csrf-csrf';
import { CSRF_SECRET } from '../configs/index.js';

const isProduction = process.env.NODE_ENV === 'production';

export const { doubleCsrfProtection, generateCsrfToken, invalidCsrfTokenError } = doubleCsrf({
  getSecret: () => CSRF_SECRET,
  getSessionIdentifier: (req) => req.ip ?? 'unknown',
  cookieName: 'csrf-token',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
  },
});
