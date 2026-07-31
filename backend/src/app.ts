import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { VITE_API_URL } from './configs/index.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';

const app = express();

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: VITE_API_URL,
    credentials: true,
  }),
);

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);

export default app;
