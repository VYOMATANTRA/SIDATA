import type { Request, Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { extractRequestActor } from '../utils/actor.js';
import { extractRequestContext } from '../utils/requestContext.js';
import {
  INDICATOR_TABLE_KINDS,
  IndicatorTableServiceError,
  listIndicatorTables,
  getIndicatorTableById,
  getIndicatorTableBySlug,
  createIndicatorTable,
  updateIndicatorTable,
  deleteIndicatorTable,
  createIndicatorTableRow,
  updateIndicatorTableRow,
  deleteIndicatorTableRow,
  MAX_TABLE_LIST_PAGE,
  MAX_TABLE_LIST_PAGE_SIZE,
  type IndicatorTableKind,
} from '../services/indicatorTables.service.js';

const MAX_SECTION_ID_LENGTH = 191;

function parseBoundedInt(raw: unknown, name: string, min: number, max: number): number | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string') {
    throw new IndicatorTableServiceError(`Parameter ${name} tidak valid.`, 400);
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new IndicatorTableServiceError(`Parameter ${name} harus berupa bilangan bulat.`, 400);
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new IndicatorTableServiceError(
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
      throw new IndicatorTableServiceError('Parameter sectionId tidak valid.', 400);
    }
    const trimmed = rawSectionId.trim();
    if (trimmed !== '') {
      if (trimmed.length > MAX_SECTION_ID_LENGTH) {
        throw new IndicatorTableServiceError(
          `Parameter sectionId terlalu panjang (maksimal ${MAX_SECTION_ID_LENGTH} karakter).`,
          400,
        );
      }
      sectionId = trimmed;
    }
  }

  const rawKind = query['kind'];
  let kind: IndicatorTableKind | undefined;
  if (rawKind !== undefined) {
    if (
      typeof rawKind !== 'string' ||
      !(INDICATOR_TABLE_KINDS as readonly string[]).includes(rawKind.trim())
    ) {
      throw new IndicatorTableServiceError(
        `Parameter kind harus salah satu dari: ${INDICATOR_TABLE_KINDS.join(', ')}.`,
        400,
      );
    }
    kind = rawKind.trim() as IndicatorTableKind;
  }

  const page = parseBoundedInt(query['page'], 'page', 1, MAX_TABLE_LIST_PAGE);
  const pageSize = parseBoundedInt(query['pageSize'], 'pageSize', 1, MAX_TABLE_LIST_PAGE_SIZE);
  return {
    ...(sectionId ? { sectionId } : {}),
    ...(kind ? { kind } : {}),
    ...(page !== undefined ? { page } : {}),
    ...(pageSize !== undefined ? { pageSize } : {}),
  };
}

function requireValidKey(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new IndicatorTableServiceError('ID atau slug tabel tidak valid', 400);
  }
  return value;
}

function requireValidRowId(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new IndicatorTableServiceError('ID baris tabel tidak valid', 400);
  }
  return value;
}

function requireActor(req: AuthRequest) {
  const actor = extractRequestActor(req);
  if (!actor) {
    throw new IndicatorTableServiceError('Akses ditolak. Pengguna belum terautentikasi.', 401);
  }
  return actor;
}

export const listIndicatorTablesHandler = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const result = await listIndicatorTables(parseListQuery(req.query));
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof IndicatorTableServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(
      'Error saat mengambil daftar tabel indikator:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const getIndicatorTableHandler = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    // Slug is the stable public key (stat pages fetch by slug); ids work too for admin flows.
    // Slugs are kebab-case and ids are uuids, so the two namespaces do not collide.
    const key = requireValidKey(req.params['key']);
    const table = (await getIndicatorTableBySlug(key)) ?? (await getIndicatorTableById(key));
    if (!table) {
      return res.status(404).json({ error: 'Tabel indikator tidak ditemukan' });
    }

    return res.status(200).json({ table });
  } catch (error) {
    if (error instanceof IndicatorTableServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(
      'Error saat mengambil tabel indikator:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const createIndicatorTableHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const actor = requireActor(req);
    const table = await createIndicatorTable(req.body, actor, extractRequestContext(req));

    return res.status(201).json({
      message: 'Tabel indikator berhasil dibuat',
      table,
    });
  } catch (error) {
    if (error instanceof IndicatorTableServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(
      'Error saat membuat tabel indikator:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const updateIndicatorTableHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const id = requireValidKey(req.params['id']);
    const actor = requireActor(req);
    const table = await updateIndicatorTable(id, req.body, actor, extractRequestContext(req));

    return res.status(200).json({
      message: 'Tabel indikator berhasil diperbarui',
      table,
    });
  } catch (error) {
    if (error instanceof IndicatorTableServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(
      'Error saat memperbarui tabel indikator:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const deleteIndicatorTableHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const id = requireValidKey(req.params['id']);
    const actor = requireActor(req);
    const table = await deleteIndicatorTable(id, actor, extractRequestContext(req));

    return res.status(200).json({
      message: 'Tabel indikator berhasil dihapus',
      table,
    });
  } catch (error) {
    if (error instanceof IndicatorTableServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(
      'Error saat menghapus tabel indikator:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const createIndicatorTableRowHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const id = requireValidKey(req.params['id']);
    const actor = requireActor(req);
    const row = await createIndicatorTableRow(id, req.body, actor, extractRequestContext(req));

    return res.status(201).json({
      message: 'Baris tabel berhasil dibuat',
      row,
    });
  } catch (error) {
    if (error instanceof IndicatorTableServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(
      'Error saat membuat baris tabel:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const updateIndicatorTableRowHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const rowId = requireValidRowId(req.params['rowId']);
    const actor = requireActor(req);
    const row = await updateIndicatorTableRow(rowId, req.body, actor, extractRequestContext(req));

    return res.status(200).json({
      message: 'Baris tabel berhasil diperbarui',
      row,
    });
  } catch (error) {
    if (error instanceof IndicatorTableServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(
      'Error saat memperbarui baris tabel:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const deleteIndicatorTableRowHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const rowId = requireValidRowId(req.params['rowId']);
    const actor = requireActor(req);
    const row = await deleteIndicatorTableRow(rowId, actor, extractRequestContext(req));

    return res.status(200).json({
      message: 'Baris tabel berhasil dihapus',
      row,
    });
  } catch (error) {
    if (error instanceof IndicatorTableServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(
      'Error saat menghapus baris tabel:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};
