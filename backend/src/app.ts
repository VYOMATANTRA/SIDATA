import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { CORS_ORIGIN } from './configs/index.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import weatherRoutes from './routes/weather.routes.js';
import { doubleCsrfProtection, invalidCsrfTokenError } from './middlewares/csrf.middleware.js';

const app = express();

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
app.use('/api/weather', weatherRoutes);

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
