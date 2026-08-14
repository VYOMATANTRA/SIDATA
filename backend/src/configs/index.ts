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

// BMKG adm4 area code for weather forecast feature. Fixed to Kelurahan Manggar but overridable via env since it's an external identifier, not a secret.
export const WEATHER_ADM4 = process.env.WEATHER_ADM4 || '64.71.01.1001';
