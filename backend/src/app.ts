import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { CORS_ORIGIN, TRUST_PROXY } from './configs/index.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import profileRoutes from './routes/profile.routes.js';
import weatherRoutes from './routes/weather.routes.js';
import mapsRoutes from './routes/maps.routes.js';
<<<<<<< HEAD
=======
import auditRoutes from './routes/audit.routes.js';
import settingsRoutes from './routes/settings.routes.js';
>>>>>>> main
import { doubleCsrfProtection, invalidCsrfTokenError } from './middlewares/csrf.middleware.js';

const app = express();

// Without this, req.ip resolves to the reverse proxy's address once deployed behind one
// (Docker on a VPS, per AGENTS.md) — which would misattribute every rate-limiter bucket, CSRF
// session key, and audit-log ipAddress to the proxy instead of the real client. Unset locally,
// where there is no proxy in front of the dev server.
if (TRUST_PROXY) {
  const parsed: boolean | number | string =
    TRUST_PROXY === 'true' ? true : TRUST_PROXY === 'false' ? false : TRUST_PROXY;
  app.set('trust proxy', /^\d+$/.test(TRUST_PROXY) ? Number(TRUST_PROXY) : parsed);
}

app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
  }),
);
app.use(doubleCsrfProtection);

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/maps', mapsRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/settings', settingsRoutes);

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err === invalidCsrfTokenError) {
    return res.status(403).json({ error: 'CSRF token tidak valid' });
  }

  if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ error: 'CSRF token tidak valid' });
  }

  return next(err);
});

export default app;
