import type { Request, Response } from 'express';
import { getManggarForecast } from '../services/weather.service.js';
import { getFastPublicSettings } from '../services/settings.service.js';
import { WEATHER_ADM4 } from '../configs/index.js';

export const getForecast = async (req: Request, res: Response): Promise<Response> => {
  try {
    let adm4 = WEATHER_ADM4;
    try {
      const settings = await getFastPublicSettings({ timeoutMs: 150 });
      if (typeof settings.weatherAdm4 === 'string' && settings.weatherAdm4.trim()) {
        adm4 = settings.weatherAdm4.trim();
      }
    } catch {
      // Non-blocking: fallback to default WEATHER_ADM4
    }

    const result = await getManggarForecast(adm4);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error saat mengambil data cuaca:', error);
    return res.status(502).json({ error: 'Gagal mengambil data cuaca dari BMKG' });
  }
};
