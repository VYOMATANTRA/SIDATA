import type { Request, Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { extractRequestActor } from '../utils/actor.js';
import { extractRequestContext } from '../utils/requestContext.js';
import {
  IndicatorServiceError,
  listIndicators,
  getIndicatorById,
  createIndicator,
  updateIndicator,
  deleteIndicator,
} from '../services/indicators.service.js';

function parseListQuery(query: Request['query']) {
  const sectionId =
    typeof query['sectionId'] === 'string' && query['sectionId'].trim() !== ''
      ? query['sectionId'].trim()
      : undefined;
  const includeStale = query['includeStale'] === 'false' ? false : true;
  const page = typeof query['page'] === 'string' ? Number(query['page']) : undefined;
  const pageSize = typeof query['pageSize'] === 'string' ? Number(query['pageSize']) : undefined;
  return {
    ...(sectionId ? { sectionId } : {}),
    includeStale,
    ...(page !== undefined ? { page } : {}),
    ...(pageSize !== undefined ? { pageSize } : {}),
  };
}

export const listIndicatorsHandler = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const result = await listIndicators(parseListQuery(req.query));
    return res.status(200).json(result);
  } catch (error) {
    console.error(
      'Error saat mengambil daftar indikator:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const getIndicatorHandler = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const id = req.params['id'];
    if (typeof id !== 'string' || id.trim() === '') {
      return res.status(400).json({ error: 'ID indikator tidak valid' });
    }

    const indicator = await getIndicatorById(id);
    if (!indicator) {
      return res.status(404).json({ error: 'Indikator tidak ditemukan' });
    }

    return res.status(200).json({ indicator });
  } catch (error) {
    console.error(
      'Error saat mengambil indikator:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const createIndicatorHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const actor = extractRequestActor(req);
    if (!actor) {
      return res.status(401).json({ error: 'Akses ditolak. Pengguna belum terautentikasi.' });
    }

    const indicator = await createIndicator(req.body, actor, extractRequestContext(req));

    return res.status(201).json({
      message: 'Indikator berhasil dibuat',
      indicator,
    });
  } catch (error) {
    if (error instanceof IndicatorServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(
      'Error saat membuat indikator:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const updateIndicatorHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const id = req.params['id'];
    if (typeof id !== 'string' || id.trim() === '') {
      return res.status(400).json({ error: 'ID indikator tidak valid' });
    }

    const actor = extractRequestActor(req);
    if (!actor) {
      return res.status(401).json({ error: 'Akses ditolak. Pengguna belum terautentikasi.' });
    }

    const indicator = await updateIndicator(id, req.body, actor, extractRequestContext(req));

    return res.status(200).json({
      message: 'Indikator berhasil diperbarui',
      indicator,
    });
  } catch (error) {
    if (error instanceof IndicatorServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(
      'Error saat memperbarui indikator:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const deleteIndicatorHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const id = req.params['id'];
    if (typeof id !== 'string' || id.trim() === '') {
      return res.status(400).json({ error: 'ID indikator tidak valid' });
    }

    const actor = extractRequestActor(req);
    if (!actor) {
      return res.status(401).json({ error: 'Akses ditolak. Pengguna belum terautentikasi.' });
    }

    const indicator = await deleteIndicator(id, actor, extractRequestContext(req));

    return res.status(200).json({
      message: 'Indikator berhasil dihapus',
      indicator,
    });
  } catch (error) {
    if (error instanceof IndicatorServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(
      'Error saat menghapus indikator:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};
