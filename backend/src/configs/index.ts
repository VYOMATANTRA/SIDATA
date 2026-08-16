import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(import.meta.dirname, '../../.env') });

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
export const COOKIE_ENCRYPTION_KEY = requireEnv('COOKIE_ENCRYPTION_KEY');

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

// TTL for the temporary oauth_state/oauth_verifier cookies (the OAuth handshake window).
// Optional — defaults to 300 seconds.
export const OAUTH_STATE_TTL_SECONDS = process.env.OAUTH_STATE_TTL_SECONDS
  ? Number(process.env.OAUTH_STATE_TTL_SECONDS)
  : 300;
export const OAUTH_PKCE_TTL_SECONDS = process.env.OAUTH_PKCE_TTL_SECONDS
  ? Number(process.env.OAUTH_PKCE_TTL_SECONDS)
  : 300;

// Cloudflare Turnstile Configuration
export const TURNSTILE_SECRET = requireEnv('TURNSTILE_SECRET');

// Resend API Mailer Configuration
export const RESEND_API_KEY = requireEnv('RESEND_API_KEY');
export const EMAIL_FROM = requireEnv('EMAIL_FROM');

// BMKG adm4 area code for weather forecast feature. Fixed to Kelurahan Manggar but overridable via env since it's an external identifier, not a secret.
export const WEATHER_ADM4 = process.env.WEATHER_ADM4 || '64.71.01.1001';

// How long a fresh BMKG forecast is served from cache before the next request re-fetches it.
// Optional — defaults to 1 hour (BMKG only refreshes twice a day).
export const WEATHER_CACHE_TTL_MS = process.env.WEATHER_CACHE_TTL_MS
  ? Number(process.env.WEATHER_CACHE_TTL_MS)
  : 60 * 60 * 1000;

// Backoff window after a failed BMKG refresh before the next fetch attempt is retried, while
// stale cached data is served in the meantime. Optional — defaults to 5 minutes.
export const WEATHER_STALE_RETRY_MS = process.env.WEATHER_STALE_RETRY_MS
  ? Number(process.env.WEATHER_STALE_RETRY_MS)
  : 5 * 60 * 1000;
