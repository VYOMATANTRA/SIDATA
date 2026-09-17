import type { Request, Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { extractRequestActor } from '../utils/actor.js';
import { extractRequestContext } from '../utils/requestContext.js';
import {
  ContentBlockServiceError,
  getAllContentBlocks,
  getContentBlockBySlug,
  updateContentBlock,
} from '../services/contentBlocks.service.js';

export const getContentBlocksHandler = async (
  _req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const blocks = await getAllContentBlocks();
    return res.status(200).json({ blocks });
  } catch (error) {
    console.error(
      'Error saat mengambil daftar content blocks:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const getContentBlockBySlugHandler = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const slug = req.params['slug'];
    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ error: 'Slug tidak valid' });
    }

    const block = await getContentBlockBySlug(slug);
    if (!block) {
      return res.status(404).json({ error: `Blok konten dengan slug '${slug}' tidak ditemukan` });
    }

    return res.status(200).json({ block });
  } catch (error) {
    console.error(
      'Error saat mengambil content block berdasarkan slug:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const updateContentBlockHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const slug = req.params['slug'];
    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ error: 'Slug tidak valid' });
    }

    const actor = extractRequestActor(req);
    if (!actor) {
      return res.status(401).json({ error: 'Akses ditolak. Pengguna belum terautentikasi.' });
    }

    const updated = await updateContentBlock(slug, req.body, actor, extractRequestContext(req));

    return res.status(200).json({
      message: 'Blok konten berhasil diperbarui',
      block: updated,
    });
  } catch (error) {
    if (error instanceof ContentBlockServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(
      'Error saat memperbarui content block:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};
