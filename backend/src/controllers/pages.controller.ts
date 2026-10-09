import type { Request, Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { extractRequestActor } from '../utils/actor.js';
import { extractRequestContext } from '../utils/requestContext.js';
import {
  getPages,
  getPageBySlug,
  createPage,
  deletePage,
  PageServiceError,
  PAGE_SLUG_PATTERN,
} from '../services/pages.service.js';

export { PAGE_SLUG_PATTERN };

export const listPages = async (_req: Request, res: Response): Promise<Response> => {
  try {
    const pages = await getPages();
    return res.status(200).json({ pages, total: pages.length });
  } catch (error) {
    console.error('Error saat mengambil daftar halaman:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const getPage = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { slug } = req.params;
    if (typeof slug !== 'string' || !PAGE_SLUG_PATTERN.test(slug)) {
      return res.status(400).json({ error: 'Slug halaman tidak valid' });
    }

    const page = await getPageBySlug(slug);
    if (!page) {
      return res.status(404).json({ error: 'Halaman tidak ditemukan' });
    }

    return res.status(200).json({ page });
  } catch (error) {
    console.error('Error saat mengambil detail halaman:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const createPageHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const actor = extractRequestActor(req);
    if (!actor) {
      return res.status(401).json({ error: 'Akses ditolak. Pengguna belum terautentikasi.' });
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Payload halaman harus berupa objek JSON' });
    }

    const created = await createPage(req.body, actor, extractRequestContext(req));

    return res.status(201).json({
      page: created,
    });
  } catch (error) {
    if (error instanceof PageServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(
      'Error saat menambahkan halaman:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const deletePageHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const actor = extractRequestActor(req);
    if (!actor) {
      return res.status(401).json({ error: 'Akses ditolak. Pengguna belum terautentikasi.' });
    }

    const { slug } = req.params;
    if (typeof slug !== 'string' || !PAGE_SLUG_PATTERN.test(slug)) {
      return res.status(400).json({ error: 'Slug halaman tidak valid' });
    }

    const deleted = await deletePage(slug, actor, extractRequestContext(req));

    return res.status(200).json({
      message: 'Halaman berhasil dihapus',
      page: deleted,
    });
  } catch (error) {
    if (error instanceof PageServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(
      'Error saat menghapus halaman:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};
