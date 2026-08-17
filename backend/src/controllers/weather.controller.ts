import type { Request, Response } from 'express';
import { getManggarForecast } from '../services/weather.service.js';

export const getForecast = async (req: Request, res: Response): Promise<Response> => {
  try {
    const result = await getManggarForecast();
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error saat mengambil data cuaca:', error);
    return res.status(502).json({ error: 'Gagal mengambil data cuaca dari BMKG' });
  }
};
