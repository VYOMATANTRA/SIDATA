import type { Request, Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { extractRequestActor } from '../utils/actor.js';
import { extractRequestContext } from '../utils/requestContext.js';
import {
  getSpatialPoints,
  getSpatialPointsAsGeoJson,
  getSpatialPointById,
  getRtLeaders,
  getRtLeaderByRtNumber,
  getMapSummary,
  ALL_SPATIAL_POINT_TYPES,
  MapsServiceError,
  MIN_RT_NUMBER,
  MAX_RT_NUMBER,
  createSpatialPoint,
  updateSpatialPoint,
  deleteSpatialPoint,
  createSpatialPointCoverage,
  deleteSpatialPointCoverage,
  updateRtLeader,
} from '../services/maps.service.js';
import type { SpatialPointType } from '../../generated/prisma/client.js';

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_MYSQL_INT = 2_147_483_647;
export const VALID_SPATIAL_FORMATS = ['geojson', 'json'] as const;
export type SpatialPointFormat = (typeof VALID_SPATIAL_FORMATS)[number];

type PaginationParamResult =
  { kind: 'absent' } | { kind: 'valid'; value: number } | { kind: 'invalid' };

/**
 * Parse an integer parameter with non-negative bounds and MySQL INT overflow protection.
 *
 * Returns:
 *   { kind: 'absent' }       — param was not supplied or was an empty string
 *   { kind: 'valid', value } — param was a valid integer within [min, max]
 *   { kind: 'invalid' }      — param was supplied but failed validation
 *                              (array, non-numeric, negative, out of bounds, or overflows max)
 */
function parseBoundedInt(value: unknown, min = 0, max = MAX_MYSQL_INT): PaginationParamResult {
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
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    return { kind: 'invalid' };
  }
  return { kind: 'valid', value: parsed };
}

function parsePositiveIntParam(
  value: unknown,
  errorMessage: string,
  max = MAX_MYSQL_INT,
): { value?: number; error?: string } {
  const result = parseBoundedInt(value, 1, max);
  if (result.kind === 'invalid') {
    return { error: errorMessage };
  }
  if (result.kind === 'valid') {
    return { value: result.value };
  }
  return {};
}

function parsePaginationParam(value: unknown, min = 0, max = MAX_MYSQL_INT): PaginationParamResult {
  return parseBoundedInt(value, min, max);
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
        const computedOffset = (pageResult.value - 1) * parsedLimit;
        if (computedOffset > MAX_MYSQL_INT) {
          return res
            .status(400)
            .json({ error: 'Nilai page tidak valid. Harus berupa angka bulat positif.' });
        }
        parsedOffset = computedOffset;
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

// ---------------------------------------------------------------------------
// Write handlers (SPEC.md §7) — editor/admin via route middleware, CSRF-protected,
// written as thin pass-throughs: zod validation and the ketua_rt invariant live in
// maps.service.ts, controllers only map service errors to status codes.
// ---------------------------------------------------------------------------

function requireActor(req: AuthRequest) {
  const actor = extractRequestActor(req);
  if (!actor) {
    throw new MapsServiceError('Akses ditolak. Pengguna belum terautentikasi.', 401);
  }
  return actor;
}

/**
 * Route :rtNumber params for RT-scoped write endpoints must sit in the 1–100 range SPEC §7
 * pins for validation (reads keep their looser MAX_MYSQL_INT tolerance, writes do not).
 */
function parseRtNumberParam(value: string | string[] | undefined): {
  rtNumber?: number;
  error?: string;
} {
  // @types/express-serve-static-core 5.1 widens req.params to Params (including
  // ParamsFlatDictionary's string[] entries for unnamed regex routes); named :rtNumber
  // params are always present exactly once, so narrowing to the first string is sufficient.
  const raw = Array.isArray(value) ? value[0] : value;
  return parsePositiveIntParam(
    raw,
    `Nomor RT harus berupa angka bulat antara ${MIN_RT_NUMBER} dan ${MAX_RT_NUMBER}`,
    MAX_RT_NUMBER,
  );
}

export const createPointHandler = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const actor = requireActor(req);
    const point = await createSpatialPoint(req.body, actor, extractRequestContext(req));
    return res.status(201).json({ message: 'Titik spasial berhasil dibuat', point });
  } catch (error) {
    if (error instanceof MapsServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(
      'Error saat membuat titik spasial:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const updatePointHandler = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const actor = requireActor(req);
    const point = await updateSpatialPoint(
      req.params['id'],
      req.body,
      actor,
      extractRequestContext(req),
    );
    return res.status(200).json({ message: 'Titik spasial berhasil diperbarui', point });
  } catch (error) {
    if (error instanceof MapsServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(
      'Error saat memperbarui titik spasial:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const deletePointHandler = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const actor = requireActor(req);
    const point = await deleteSpatialPoint(req.params['id'], actor, extractRequestContext(req));
    return res.status(200).json({ message: 'Titik spasial berhasil dihapus', point });
  } catch (error) {
    if (error instanceof MapsServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(
      'Error saat menghapus titik spasial:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const createPointCoverageHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<Response> => {
  try {
    const actor = requireActor(req);
    const coverage = await createSpatialPointCoverage(
      req.params['id'],
      req.body,
      actor,
      extractRequestContext(req),
    );
    return res.status(201).json({ message: 'Coverage RT berhasil dibuat', coverage });
  } catch (error) {
    if (error instanceof MapsServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(
      'Error saat membuat coverage RT:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const deletePointCoverageHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<Response> => {
  try {
    const { rtNumber, error } = parseRtNumberParam(req.params['rtNumber']);
    if (error || rtNumber === undefined) {
      return res.status(400).json({ error: error ?? 'Nomor RT wajib diisi' });
    }

    const actor = requireActor(req);
    const coverage = await deleteSpatialPointCoverage(
      req.params['id'],
      rtNumber,
      actor,
      extractRequestContext(req),
    );
    return res.status(200).json({ message: 'Coverage RT berhasil dihapus', coverage });
  } catch (error) {
    if (error instanceof MapsServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(
      'Error saat menghapus coverage RT:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};

export const updateRtLeaderHandler = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const { rtNumber, error } = parseRtNumberParam(req.params['rtNumber']);
    if (error || rtNumber === undefined) {
      return res.status(400).json({ error: error ?? 'Nomor RT wajib diisi' });
    }

    const actor = requireActor(req);
    const leader = await updateRtLeader(rtNumber, req.body, actor, extractRequestContext(req));
    return res.status(200).json({ message: 'Ketua RT berhasil diperbarui', leader });
  } catch (error) {
    if (error instanceof MapsServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(
      'Error saat memperbarui Ketua RT:',
      error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
    );
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
};
