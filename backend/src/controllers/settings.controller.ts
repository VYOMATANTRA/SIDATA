import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { extractRequestActor } from '../utils/actor.js';
import { extractRequestContext } from '../utils/requestContext.js';
import {
  SettingsServiceError,
  getAuditRetentionSettings,
  updateAuditRetentionSettings,
} from '../services/settings.service.js';

export const getAuditRetention = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const settings = await getAuditRetentionSettings();
    return res.status(200).json({ retention: settings });
  } catch (error) {
    console.error(
      'Error saat mengambil pengaturan retensi audit log:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const updateAuditRetention = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const actor = extractRequestActor(req);
    if (!actor) {
      return res.status(401).json({ error: 'Akses ditolak. Pengguna belum terautentikasi.' });
    }

    const settings = await updateAuditRetentionSettings({
      payload: req.body,
      actor,
      context: extractRequestContext(req),
    });

    return res.status(200).json({
      message: 'Pengaturan retensi audit log berhasil diperbarui.',
      retention: settings,
    });
  } catch (error) {
    if (error instanceof SettingsServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(
      'Error saat memperbarui pengaturan retensi audit log:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};
