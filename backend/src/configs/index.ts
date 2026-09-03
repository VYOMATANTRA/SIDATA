import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(import.meta.dirname, '../../../.env') });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. See root .env.example.`);
  }
  return value;
}

function optionalNumberEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const value = Number(raw);
  if (Number.isNaN(value)) {
    throw new Error(`Invalid environment variable ${name}: "${raw}" is not a number.`);
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

// BMKG public API base URL. Optional — defaults to the production endpoint; overridable for
// testing against a mock/staging endpoint.
export const BMKG_BASE_URL =
  process.env.BMKG_BASE_URL || 'https://api.bmkg.go.id/publik/prakiraan-cuaca';

// BMKG adm4 area code for weather forecast feature. Fixed to Kelurahan Manggar but overridable via env since it's an external identifier, not a secret.
export const WEATHER_ADM4 = process.env.WEATHER_ADM4 || '64.71.01.1001';

// How long a fresh BMKG forecast is served from cache before the next request re-fetches it.
// Optional — defaults to 1 hour (BMKG only refreshes twice a day).
export const WEATHER_CACHE_TTL_MS = optionalNumberEnv('WEATHER_CACHE_TTL_MS', 60 * 60 * 1000);

// Backoff window after a failed BMKG refresh before the next fetch attempt is retried, while
// stale cached data is served in the meantime. Optional — defaults to 5 minutes.
export const WEATHER_STALE_RETRY_MS = optionalNumberEnv('WEATHER_STALE_RETRY_MS', 5 * 60 * 1000);

// Max time to wait for a single BMKG API request before aborting. Optional — defaults to 10s.
export const WEATHER_FETCH_TIMEOUT_MS = optionalNumberEnv('WEATHER_FETCH_TIMEOUT_MS', 10_000);

// Express `trust proxy` setting (see app.ts) — how many reverse-proxy hops to trust for
// X-Forwarded-* headers, needed for req.ip (and therefore rate-limiter keying, CSRF session
// keying, and the ipAddress recorded on every audit log row) to reflect the real client behind
// the Docker/VPS deploy target. Optional — Express's default (trust proxy disabled) applies
// when unset, which is correct for local/non-proxied dev. Accepts 'true'/'false', a hop count
// (e.g. '1'), or any string Express's own trust-proxy parser understands (e.g. 'loopback').
export const TRUST_PROXY = process.env.TRUST_PROXY;

// Privileged DB connection used ONLY by backend/scripts/ (retention pruning, the audit_logs
// grant script) — never by the running server (src/app.ts never imports this). Keeping it
// separate from DATABASE_URL is what makes the audit_logs no-DELETE grant meaningful: the app's
// runtime connection physically cannot delete a row even if application code tried. Optional at
// boot — only the pruning script needs it, and that script fails loudly rather than silently
// falling back to DATABASE_URL if it's unset. See backend/scripts/prune-audit-logs.ts and
// backend/scripts/grants/audit-logs-grants.sql.
export const AUDIT_ADMIN_DATABASE_URL = process.env.AUDIT_ADMIN_DATABASE_URL;
