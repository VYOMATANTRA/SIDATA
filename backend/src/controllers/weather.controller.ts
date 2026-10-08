import type { Request, Response } from 'express';
import { getManggarForecast } from '../services/weather.service.js';
import { getFastPublicSettings } from '../services/settings.service.js';
import { WEATHER_ADM4 } from '../configs/index.js';

export const getForecast = async (req: Request, res: Response): Promise<Response> => {
  try {
    const settings = await getFastPublicSettings({ timeoutMs: 150 });
    const adm4 =
      typeof settings.weatherAdm4 === 'string' && settings.weatherAdm4.trim()
        ? settings.weatherAdm4.trim()
        : WEATHER_ADM4;

    const result = await getManggarForecast(adm4);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error saat mengambil data cuaca:', error);
    return res.status(502).json({ error: 'Gagal mengambil data cuaca dari BMKG' });
  }
};
