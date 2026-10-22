import type { Request, Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { extractRequestActor } from '../utils/actor.js';
import { extractRequestContext } from '../utils/requestContext.js';
import {
  ComparisonTemplateServiceError,
  listComparisonTemplates,
  getComparisonTemplateById,
  createComparisonTemplate,
  updateComparisonTemplate,
  deleteComparisonTemplate,
} from '../services/comparisonTemplates.service.js';

/**
 * Service errors carry their own status. Only the 422 acknowledgment flow adds `code` and
 * `warnings`, which the admin UI needs to render and echo back the exact flagged wording;
 * every other error stays a plain `{ error }`.
 */
function respondWithFailure(res: Response, error: unknown, logContext: string): Response {
  if (error instanceof ComparisonTemplateServiceError) {
    return res.status(error.statusCode).json({
      error: error.message,
      ...(error.code !== undefined ? { code: error.code } : {}),
      ...(error.warnings !== undefined ? { warnings: error.warnings } : {}),
    });
  }
  console.error(
    `Error saat ${logContext}:`,
    error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
  );
  return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
}

export const listComparisonTemplatesHandler = async (
  _req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const templates = await listComparisonTemplates();
    return res.status(200).json({ templates });
  } catch (error) {
    return respondWithFailure(res, error, 'mengambil daftar template perbandingan');
  }
};

export const getComparisonTemplateHandler = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const id = req.params['id'];
    if (typeof id !== 'string' || id.trim() === '') {
      return res.status(400).json({ error: 'ID template tidak valid' });
    }

    const template = await getComparisonTemplateById(id);
    if (!template) {
      return res.status(404).json({ error: 'Template tidak ditemukan' });
    }

    return res.status(200).json({ template });
  } catch (error) {
    return respondWithFailure(res, error, 'mengambil template perbandingan');
  }
};

export const createComparisonTemplateHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const actor = extractRequestActor(req);
    if (!actor) {
      return res.status(401).json({ error: 'Akses ditolak. Pengguna belum terautentikasi.' });
    }

    const template = await createComparisonTemplate(req.body, actor, extractRequestContext(req));

    return res.status(201).json({
      message: 'Template perbandingan berhasil dibuat',
      template,
    });
  } catch (error) {
    return respondWithFailure(res, error, 'membuat template perbandingan');
  }
};

export const updateComparisonTemplateHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const id = req.params['id'];
    if (typeof id !== 'string' || id.trim() === '') {
      return res.status(400).json({ error: 'ID template tidak valid' });
    }

    const actor = extractRequestActor(req);
    if (!actor) {
      return res.status(401).json({ error: 'Akses ditolak. Pengguna belum terautentikasi.' });
    }

    const template = await updateComparisonTemplate(
      id,
      req.body,
      actor,
      extractRequestContext(req),
    );

    return res.status(200).json({
      message: 'Template perbandingan berhasil diperbarui',
      template,
    });
  } catch (error) {
    return respondWithFailure(res, error, 'memperbarui template perbandingan');
  }
};

export const deleteComparisonTemplateHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const id = req.params['id'];
    if (typeof id !== 'string' || id.trim() === '') {
      return res.status(400).json({ error: 'ID template tidak valid' });
    }

    const actor = extractRequestActor(req);
    if (!actor) {
      return res.status(401).json({ error: 'Akses ditolak. Pengguna belum terautentikasi.' });
    }

    const template = await deleteComparisonTemplate(id, actor, extractRequestContext(req));

    return res.status(200).json({
      message: 'Template perbandingan berhasil dihapus',
      template,
    });
  } catch (error) {
    return respondWithFailure(res, error, 'menghapus template perbandingan');
  }
};
