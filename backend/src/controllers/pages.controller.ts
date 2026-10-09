import type { Request, Response } from 'express';
import { getPages, getPageBySlug } from '../services/pages.service.js';

export const PAGE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
