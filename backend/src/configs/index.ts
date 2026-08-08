import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. See backend/.env.example.`);
  }
  return value;
}

export const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

export const DATABASE_URL = requireEnv('DATABASE_URL');

export const JWT_SECRET = requireEnv('JWT_SECRET');
export const JWT_REFRESH_SECRET = requireEnv('JWT_REFRESH_SECRET');
export const CSRF_SECRET = requireEnv('CSRF_SECRET');

// Origin allowed to make credentialed requests to this API — the frontend's own URL
// (e.g. http://localhost:5173 locally). Do NOT reuse VITE_API_URL here: that variable
// names the backend URL the frontend calls, not an origin the backend should trust.
export const CORS_ORIGIN = requireEnv('CORS_ORIGIN');

// Google OAuth Configuration
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
export const GOOGLE_CALLBACK_URL =
  process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback';
export const GOOGLE_OAUTH_SUCCESS_REDIRECT =
  process.env.GOOGLE_OAUTH_SUCCESS_REDIRECT || 'http://localhost:5173/auth/callback';
export const GOOGLE_OAUTH_FAILURE_REDIRECT =
  process.env.GOOGLE_OAUTH_FAILURE_REDIRECT || 'http://localhost:5173/login?error=oauth_failed';

// Cloudflare Turnstile Configuration
export const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || '';

// SMTP Mailer Configuration
export const SMTP_HOST = process.env.SMTP_HOST || '';
export const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
export const SMTP_USER = process.env.SMTP_USER || '';
export const SMTP_PASS = process.env.SMTP_PASS || '';
export const SMTP_FROM =
  process.env.SMTP_FROM || 'SIDATA Kelurahan Manggar <noreply@sidata.manggar.id>';
