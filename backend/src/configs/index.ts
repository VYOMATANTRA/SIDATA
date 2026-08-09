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
export const GOOGLE_CLIENT_ID = requireEnv('GOOGLE_CLIENT_ID');
export const GOOGLE_CLIENT_SECRET = requireEnv('GOOGLE_CLIENT_SECRET');
export const GOOGLE_CALLBACK_URL = requireEnv('GOOGLE_CALLBACK_URL');
export const GOOGLE_OAUTH_SUCCESS_REDIRECT = requireEnv('GOOGLE_OAUTH_SUCCESS_REDIRECT');
export const GOOGLE_OAUTH_FAILURE_REDIRECT = requireEnv('GOOGLE_OAUTH_FAILURE_REDIRECT');

// Cloudflare Turnstile Configuration
export const TURNSTILE_SECRET = requireEnv('TURNSTILE_SECRET');

// Resend & SMTP Mailer Configuration
export const RESEND_API_KEY = requireEnv('RESEND_API_KEY');
export const SMTP_HOST = requireEnv('SMTP_HOST');
export const SMTP_PORT = Number(requireEnv('SMTP_PORT'));
export const SMTP_USER = requireEnv('SMTP_USER');
export const SMTP_PASS = requireEnv('SMTP_PASS');
export const SMTP_FROM = requireEnv('SMTP_FROM');
