import type { Request, Response } from 'express';
import {
  getSpatialPoints,
  getSpatialPointsAsGeoJson,
  getSpatialPointById,
  getRtLeaders,
  getRtLeaderByRtNumber,
  getMapSummary,
} from '../services/maps.service.js';
import type { SpatialPointType } from '../../generated/prisma/client.js';

const VALID_SPATIAL_TYPES: SpatialPointType[] = ['ketua_rt', 'bank_sampah', 'fasilitas_umum'];

export const listPoints = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { type, rt, format } = req.query;

    let parsedType: SpatialPointType | undefined;
    if (typeof type === 'string' && type.trim() !== '') {
      if (!VALID_SPATIAL_TYPES.includes(type as SpatialPointType)) {
        return res.status(400).json({
          error: `Tipe titik spasial tidak valid. Pilihan yang valid: ${VALID_SPATIAL_TYPES.join(', ')}`,
        });
      }
      parsedType = type as SpatialPointType;
    }

    let parsedRtNumber: number | undefined;
    if (typeof rt === 'string' && rt.trim() !== '') {
      const parsed = parseInt(rt, 10);
      if (Number.isNaN(parsed) || parsed <= 0) {
        return res.status(400).json({ error: 'Nomor RT harus berupa angka positif' });
      }
      parsedRtNumber = parsed;
    }

    const filter = {
      type: parsedType,
      rtNumber: parsedRtNumber,
    };

    if (format === 'geojson') {
      const geojson = await getSpatialPointsAsGeoJson(filter);
      return res.status(200).json(geojson);
    }

    const points = await getSpatialPoints(filter);
    return res.status(200).json({ points, total: points.length });
  } catch (error) {
    console.error('Error saat mengambil daftar titik spasial:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const getPoint = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'ID titik spasial wajib diisi' });
    }

    const point = await getSpatialPointById(id);
    if (!point) {
      return res.status(404).json({ error: 'Titik spasial tidak ditemukan' });
    }

    return res.status(200).json({ point });
  } catch (error) {
    console.error('Error saat mengambil detail titik spasial:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const listRtLeaders = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { search, rt, limit, offset, page } = req.query;

    let parsedRtNumber: number | undefined;
    if (typeof rt === 'string' && rt.trim() !== '') {
      const parsed = parseInt(rt, 10);
      if (Number.isNaN(parsed) || parsed <= 0) {
        return res.status(400).json({ error: 'Nomor RT harus berupa angka positif' });
      }
      parsedRtNumber = parsed;
    }

    let parsedLimit: number | undefined;
    if (typeof limit === 'string') {
      const l = parseInt(limit, 10);
      if (!Number.isNaN(l) && l > 0) {
        parsedLimit = l;
      }
    }

    let parsedOffset: number | undefined;
    if (typeof offset === 'string') {
      const o = parseInt(offset, 10);
      if (!Number.isNaN(o) && o >= 0) {
        parsedOffset = o;
      }
    } else if (typeof page === 'string' && parsedLimit) {
      const p = parseInt(page, 10);
      if (!Number.isNaN(p) && p > 0) {
        parsedOffset = (p - 1) * parsedLimit;
      }
    }

    const result = await getRtLeaders({
      search: typeof search === 'string' ? search : undefined,
      rtNumber: parsedRtNumber,
      limit: parsedLimit,
      offset: parsedOffset,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error saat mengambil daftar Ketua RT:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const getRtLeader = async (req: Request, res: Response): Promise<Response> => {
  try {
    const rtParam = req.params['rtNumber'];
    const rtNumberStr = typeof rtParam === 'string' ? rtParam : '';
    const parsed = parseInt(rtNumberStr, 10);

    if (Number.isNaN(parsed) || parsed <= 0) {
      return res.status(400).json({ error: 'Nomor RT harus berupa angka positif' });
    }

    const leader = await getRtLeaderByRtNumber(parsed);
    if (!leader) {
      return res.status(404).json({ error: 'Ketua RT tidak ditemukan' });
    }

    return res.status(200).json({ leader });
  } catch (error) {
    console.error('Error saat mengambil data Ketua RT:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const getSummary = async (req: Request, res: Response): Promise<Response> => {
  try {
    const summary = await getMapSummary();
    return res.status(200).json(summary);
  } catch (error) {
    console.error('Error saat mengambil ringkasan peta:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};
