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
  MAX_LIST_PAGE,
  MAX_LIST_PAGE_SIZE,
} from '../services/indicators.service.js';

const MAX_SECTION_ID_LENGTH = 191;

function parseBoundedInt(raw: unknown, name: string, min: number, max: number): number | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string') {
    throw new IndicatorServiceError(`Parameter ${name} tidak valid.`, 400);
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new IndicatorServiceError(`Parameter ${name} harus berupa bilangan bulat.`, 400);
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new IndicatorServiceError(
      `Parameter ${name} harus berada di antara ${min} dan ${max}.`,
      400,
    );
  }
  return value;
}

function parseListQuery(query: Request['query']) {
  const rawSectionId = query['sectionId'];
  let sectionId: string | undefined;
  if (rawSectionId !== undefined) {
    if (typeof rawSectionId !== 'string') {
      throw new IndicatorServiceError('Parameter sectionId tidak valid.', 400);
    }
    const trimmed = rawSectionId.trim();
    if (trimmed !== '') {
      if (trimmed.length > MAX_SECTION_ID_LENGTH) {
        throw new IndicatorServiceError(
          `Parameter sectionId terlalu panjang (maksimal ${MAX_SECTION_ID_LENGTH} karakter).`,
          400,
        );
      }
      sectionId = trimmed;
    }
  }

  const rawIncludeStale = query['includeStale'];
  let includeStale = true;
  if (rawIncludeStale !== undefined) {
    if (rawIncludeStale !== 'true' && rawIncludeStale !== 'false') {
      throw new IndicatorServiceError(`Parameter includeStale harus 'true' atau 'false'.`, 400);
    }
    includeStale = rawIncludeStale === 'true';
  }

  const page = parseBoundedInt(query['page'], 'page', 1, MAX_LIST_PAGE);
  const pageSize = parseBoundedInt(query['pageSize'], 'pageSize', 1, MAX_LIST_PAGE_SIZE);
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
    if (error instanceof IndicatorServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
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
