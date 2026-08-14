// Preloads test environment variables before modules are imported during unit test execution.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/sidata_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-12345';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret-key-12345';
process.env.CSRF_SECRET = process.env.CSRF_SECRET || 'test-csrf-secret-key-12345';
process.env.COOKIE_ENCRYPTION_KEY =
  process.env.COOKIE_ENCRYPTION_KEY || 'test-cookie-encryption-secret-key-12345';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-google-client-secret';
process.env.GOOGLE_CALLBACK_URL =
  process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback';
process.env.GOOGLE_OAUTH_SUCCESS_REDIRECT =
  process.env.GOOGLE_OAUTH_SUCCESS_REDIRECT || 'http://localhost:5173/auth/callback';
process.env.GOOGLE_OAUTH_FAILURE_REDIRECT =
  process.env.GOOGLE_OAUTH_FAILURE_REDIRECT || 'http://localhost:5173/login?error=oauth_failed';
process.env.TURNSTILE_SECRET =
  process.env.TURNSTILE_SECRET || '1x0000000000000000000000000000000AA';
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test_key';
process.env.EMAIL_FROM = process.env.EMAIL_FROM || 'SIDATA Test <onboarding@resend.dev>';
