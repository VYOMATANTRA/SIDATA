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

function parsePositiveIntParam(
  value: unknown,
  errorMessage: string,
): { value?: number; error?: string } {
  if (typeof value !== 'string' || value.trim() === '') {
    return {};
  }
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return { error: errorMessage };
  }
  return { value: parsed };
}

function parseOptionalInt(value: unknown, min = 0): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < min) {
    return undefined;
  }
  return parsed;
}

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

    const { value: parsedRtNumber, error: rtError } = parsePositiveIntParam(
      rt,
      'Nomor RT harus berupa angka positif',
    );
    if (rtError) {
      return res.status(400).json({ error: rtError });
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

    const { value: parsedRtNumber, error: rtError } = parsePositiveIntParam(
      rt,
      'Nomor RT harus berupa angka positif',
    );
    if (rtError) {
      return res.status(400).json({ error: rtError });
    }

    const parsedLimit = parseOptionalInt(limit, 1);
    let parsedOffset = parseOptionalInt(offset, 0);

    if (parsedOffset === undefined && typeof page === 'string' && parsedLimit) {
      const p = parseOptionalInt(page, 1);
      if (p !== undefined) {
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
    const { value: parsedRtNumber, error: rtError } = parsePositiveIntParam(
      rtParam,
      'Nomor RT harus berupa angka positif',
    );

    if (rtError || parsedRtNumber === undefined) {
      return res.status(400).json({ error: rtError ?? 'Nomor RT harus berupa angka positif' });
    }

    const leader = await getRtLeaderByRtNumber(parsedRtNumber);
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
