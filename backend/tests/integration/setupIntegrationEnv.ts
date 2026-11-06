// Preloaded before any integration test module. Deliberately separate from
// src/__tests__/setupEnv.ts: these tests need a real MySQL and must never fall back
// to the developer's DATABASE_URL.
const integrationUrl = process.env.INTEGRATION_DATABASE_URL;

if (!integrationUrl) {
  throw new Error(
    'INTEGRATION_DATABASE_URL is required. Run them with `docker compose -f docker-compose.test.yml run --rm backend-integration`.',
  );
}

const databaseName = new URL(integrationUrl).pathname.slice(1);
if (!/test/i.test(databaseName)) {
  throw new Error(
    `Refusing to run integration tests against "${databaseName}": the database name must contain "test".`,
  );
}

process.env.DATABASE_URL = integrationUrl;
process.env.NODE_ENV ??= 'test';

const inertDefaults: Record<string, string> = {
  JWT_SECRET: 'integration-jwt-secret',
  JWT_REFRESH_SECRET: 'integration-jwt-refresh-secret',
  CSRF_SECRET: 'integration-csrf-secret',
  COOKIE_ENCRYPTION_KEY: 'integration-cookie-encryption-key',
  CORS_ORIGIN: 'http://localhost:5173',
  GOOGLE_CLIENT_ID: 'integration-google-client-id',
  GOOGLE_CLIENT_SECRET: 'integration-google-client-secret',
  GOOGLE_CALLBACK_URL: 'http://localhost:3000/api/auth/google/callback',
  GOOGLE_OAUTH_SUCCESS_REDIRECT: 'http://localhost:5173/auth/callback',
  GOOGLE_OAUTH_FAILURE_REDIRECT: 'http://localhost:5173/login?error=oauth_failed',
  TURNSTILE_SECRET: '1x0000000000000000000000000000000AA',
  RESEND_API_KEY: 're_integration_key',
  EMAIL_FROM: 'SIDATA Integration <integration@example.com>',
};

for (const [key, value] of Object.entries(inertDefaults)) {
  process.env[key] ??= value;
}
