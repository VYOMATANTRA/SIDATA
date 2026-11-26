import type { Request, Response } from 'express';
import { getDashboard } from '../services/dashboard.service.js';

export const getDashboardHandler = async (_req: Request, res: Response): Promise<Response> => {
  try {
    return res.status(200).json({ dashboard: await getDashboard() });
  } catch (error) {
    console.error(
      'Error saat memuat dasbor admin:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};
