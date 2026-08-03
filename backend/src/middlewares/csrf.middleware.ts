import { doubleCsrf } from 'csrf-csrf';
import type { HttpError } from 'http-errors';
import { CSRF_SECRET } from '../configs/index.js';

const isProduction = process.env.NODE_ENV === 'production';

const {
  doubleCsrfProtection,
  generateCsrfToken,
  invalidCsrfTokenError: invalidCsrfTokenErrorInternal,
} = doubleCsrf({
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

export { doubleCsrfProtection, generateCsrfToken };
export const invalidCsrfTokenError: HttpError = invalidCsrfTokenErrorInternal;
