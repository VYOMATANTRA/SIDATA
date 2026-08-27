import type { Request, Response } from 'express';
import {
  getSpatialPoints,
  getSpatialPointsAsGeoJson,
  getSpatialPointById,
  getRtLeaders,
  getRtLeaderByRtNumber,
  getMapSummary,
  ALL_SPATIAL_POINT_TYPES,
} from '../services/maps.service.js';
import type { SpatialPointType } from '../../generated/prisma/client.js';

export const DEFAULT_PAGE_SIZE = 10;
export const VALID_SPATIAL_FORMATS = ['geojson', 'json'] as const;
export type SpatialPointFormat = (typeof VALID_SPATIAL_FORMATS)[number];

function parsePositiveIntParam(
  value: unknown,
  errorMessage: string,
): { value?: number; error?: string } {
  // Repeated query keys are parsed by Express as an array. Treat as invalid
  // rather than silently dropping the filter.
  if (Array.isArray(value)) {
    return { error: errorMessage };
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return {};
  }
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return { error: errorMessage };
  }
  const parsed = parseInt(trimmed, 10);
  if (parsed <= 0) {
    return { error: errorMessage };
  }
  return { value: parsed };
}

type PaginationParamResult =
  { kind: 'absent' } | { kind: 'valid'; value: number } | { kind: 'invalid' };

/**
 * Parse an optional pagination query parameter.
 *
 * Returns:
 *   { kind: 'absent' }          — param was not supplied or was an empty string
 *   { kind: 'valid', value }    — param was a non-negative integer ≥ min
 *   { kind: 'invalid' }         — param was supplied but failed validation
 *                                 (non-numeric, negative, or below min)
 *
 * Callers MUST handle 'invalid' explicitly and return a 400 to the client
 * rather than silently falling back to the unbounded default.
 */
function parsePaginationParam(value: unknown, min = 0): PaginationParamResult {
  // Repeated query keys are parsed by Express as an array. Treat as invalid
  // rather than silently falling back to 'absent' (unbounded query).
  if (Array.isArray(value)) {
    return { kind: 'invalid' };
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return { kind: 'absent' };
  }
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return { kind: 'invalid' };
  }
  const parsed = parseInt(trimmed, 10);
  if (parsed < min) {
    return { kind: 'invalid' };
  }
  return { kind: 'valid', value: parsed };
}

export const listPoints = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { type, rt, format } = req.query;

    if (Array.isArray(type)) {
      return res.status(400).json({
        error: `Tipe titik spasial tidak valid. Pilihan yang valid: ${ALL_SPATIAL_POINT_TYPES.join(', ')}`,
      });
    }
    if (Array.isArray(format)) {
      return res
        .status(400)
        .json({ error: 'Parameter format tidak boleh dikirim lebih dari satu kali' });
    }

    let parsedFormat: SpatialPointFormat | undefined;
    if (typeof format === 'string' && format.trim() !== '') {
      if (!VALID_SPATIAL_FORMATS.includes(format as SpatialPointFormat)) {
        return res.status(400).json({
          error: `Format tidak valid. Pilihan yang valid: ${VALID_SPATIAL_FORMATS.join(', ')}`,
        });
      }
      parsedFormat = format as SpatialPointFormat;
    }

    let parsedType: SpatialPointType | undefined;
    if (typeof type === 'string' && type.trim() !== '') {
      if (!ALL_SPATIAL_POINT_TYPES.includes(type as SpatialPointType)) {
        return res.status(400).json({
          error: `Tipe titik spasial tidak valid. Pilihan yang valid: ${ALL_SPATIAL_POINT_TYPES.join(', ')}`,
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

    if (parsedFormat === 'geojson') {
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

    if (Array.isArray(search)) {
      return res
        .status(400)
        .json({ error: 'Parameter search tidak boleh dikirim lebih dari satu kali' });
    }
    if (Array.isArray(page)) {
      return res
        .status(400)
        .json({ error: 'Nilai page tidak valid. Harus berupa angka bulat positif.' });
    }

    const { value: parsedRtNumber, error: rtError } = parsePositiveIntParam(
      rt,
      'Nomor RT harus berupa angka positif',
    );
    if (rtError) {
      return res.status(400).json({ error: rtError });
    }

    const limitResult = parsePaginationParam(limit, 1);
    if (limitResult.kind === 'invalid') {
      return res
        .status(400)
        .json({ error: 'Nilai limit tidak valid. Harus berupa angka bulat positif.' });
    }
    let parsedLimit: number | undefined =
      limitResult.kind === 'valid' ? limitResult.value : undefined;

    const offsetResult = parsePaginationParam(offset, 0);
    if (offsetResult.kind === 'invalid') {
      return res
        .status(400)
        .json({ error: 'Nilai offset tidak valid. Harus berupa angka bulat non-negatif.' });
    }
    let parsedOffset: number | undefined =
      offsetResult.kind === 'valid' ? offsetResult.value : undefined;

    if (parsedOffset === undefined && typeof page === 'string' && page.trim() !== '') {
      const pageResult = parsePaginationParam(page, 1);
      if (pageResult.kind === 'invalid') {
        return res
          .status(400)
          .json({ error: 'Nilai page tidak valid. Harus berupa angka bulat positif.' });
      }
      if (pageResult.kind === 'valid') {
        if (parsedLimit === undefined) {
          parsedLimit = DEFAULT_PAGE_SIZE;
        }
        parsedOffset = (pageResult.value - 1) * parsedLimit;
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
