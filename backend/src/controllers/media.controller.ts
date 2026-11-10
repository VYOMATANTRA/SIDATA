import path from 'node:path';
import type { Request, Response } from 'express';
import type { MediaAsset } from '../../generated/prisma/client.js';
import type { MediaUploadRequest } from '../middlewares/mediaUpload.middleware.js';
import {
  MediaServiceError,
  findMediaAsset,
  ingestStagedUpload,
  isValidAssetId,
} from '../services/media.service.js';
import { MEDIA_TYPE_POLICY } from '../utils/mediaPolicy.js';
import { MediaValidationError } from '../utils/mediaSignature.js';
import {
  STAGING_DIR,
  buildAttachmentDisposition,
  buildThumbnailKey,
  getUploadRoot,
  removeStagingDir,
  resolveStoredFile,
} from '../utils/mediaStorage.js';
import { extractRequestActor } from '../utils/actor.js';
import { extractRequestContext } from '../utils/requestContext.js';

const NOT_FOUND_BODY = { error: 'Media tidak ditemukan.', code: 'MEDIA_NOT_FOUND' } as const;
const FILE_MISSING_BODY = {
  error: 'Berkas media tidak tersedia saat ini.',
  code: 'MEDIA_FILE_MISSING',
} as const;
const STORAGE_UNAVAILABLE_BODY = {
  error: 'Penyimpanan media sedang tidak tersedia.',
  code: 'MEDIA_STORAGE_UNAVAILABLE',
} as const;
const INTERNAL_ERROR_BODY = { error: 'Terjadi kesalahan internal server' } as const;

// One hour, revalidated: detaching an asset (un-publishing) must take effect within a bounded time
// rather than a year, and `must-revalidate` stops stale copies being served past that.
const CACHE_ATTACHED = 'public, max-age=3600, must-revalidate';
const CACHE_PRIVATE = 'private, no-store';

type ServeKind = 'public-image' | 'public-download' | 'preview';

const MIME_BY_EXTENSION: Record<string, string> = Object.fromEntries(
  Object.values(MEDIA_TYPE_POLICY).map((policy) => [policy.storedExtension, policy.mimeType]),
);

function logError(context: string, error: unknown): void {
  console.error(
    context,
    error instanceof Error ? error.message : 'Terjadi kesalahan internal server',
  );
}

const RANGE_UNSATISFIABLE_BODY = { error: 'Permintaan berkas tidak dapat dipenuhi.' } as const;

/**
 * Maps a `sendFile` failure to an honest status instead of a blanket 500: the `send` library
 * attaches `status` (416 for an unsatisfiable Range, 404 for a vanished file, ...). A file
 * deleted by cleanup between the DB lookup and the send surfaces as ENOENT/ENOTDIR and gets the
 * same friendly body as any other missing file. Only genuine server errors are logged.
 */
function respondToSendFileError(res: Response, error: Error): void {
  const { status, code, headers } = error as {
    status?: number;
    code?: string;
    headers?: Record<string, string>;
  };
  const effective = code === 'ENOENT' || code === 'ENOTDIR' ? 404 : (status ?? 500);

  // Entity headers chosen for a successful body must not ride along on an error response.
  res.removeHeader('Content-Disposition');
  res.setHeader('Cache-Control', CACHE_PRIVATE);
  if (headers && effective !== 500) {
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  }

  if (effective >= 500) {
    logError('Error saat mengirim berkas media:', error);
    res.status(500).json(INTERNAL_ERROR_BODY);
  } else if (effective === 404) {
    res.status(404).json(FILE_MISSING_BODY);
  } else {
    res.status(effective).json(RANGE_UNSATISFIABLE_BODY);
  }
}

export const uploadMediaHandler = async (
  req: MediaUploadRequest,
  res: Response,
): Promise<Response | void> => {
  const upload = req.mediaUpload;
  try {
    const actor = extractRequestActor(req);
    if (!actor) {
      return res.status(401).json({ error: 'Akses ditolak. Pengguna belum terautentikasi.' });
    }
    if (!upload || !req.file) {
      return res.status(400).json({
        error: 'Berkas wajib dikirim sebagai multipart pada kolom "file".',
        code: 'FILE_REQUIRED',
      });
    }

    const purpose: unknown = (req.body as Record<string, unknown> | undefined)?.['purpose'];
    const dto = await ingestStagedUpload({
      root: upload.root,
      stagedPath: path.join(upload.root, STAGING_DIR, upload.id, path.basename(req.file.path)),
      originalName: req.file.originalname,
      purpose,
      actor,
      context: extractRequestContext(req),
    });

    return res.status(201).json({ message: 'Berkas berhasil diunggah', media: dto });
  } catch (error) {
    if (error instanceof MediaValidationError || error instanceof MediaServiceError) {
      if ('retryAfter' in error && typeof error.retryAfter === 'number') {
        res.setHeader('Retry-After', String(error.retryAfter));
      }
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    logError('Error saat mengunggah media:', error);
    return res.status(500).json(INTERNAL_ERROR_BODY);
  } finally {
    if (upload) await removeStagingDir(upload.root, upload.id);
  }
};

function isServable(asset: MediaAsset, kind: ServeKind): boolean {
  if (asset.cleanupClaimedAt !== null || asset.cleanupQuarantineReason !== null) return false;
  switch (kind) {
    case 'preview':
      return true;
    case 'public-image':
      return asset.attachedAt !== null && asset.kind === 'photo';
    case 'public-download':
      return asset.attachedAt !== null && (asset.kind === 'document' || asset.kind === 'data');
  }
}

async function serveAsset(req: Request, res: Response, kind: ServeKind): Promise<Response | void> {
  try {
    const id = req.params['id'];
    if (!isValidAssetId(id)) return res.status(404).json(NOT_FOUND_BODY);

    const asset = await findMediaAsset(id);
    // Unattached assets are indistinguishable from missing ones on the public routes.
    if (!asset || !isServable(asset, kind)) return res.status(404).json(NOT_FOUND_BODY);

    const wantsThumbnail = req.query['variant'] === 'thumbnail';
    if (wantsThumbnail && asset.kind !== 'photo') return res.status(404).json(NOT_FOUND_BODY);

    let root: string;
    try {
      root = await getUploadRoot();
    } catch (error) {
      // Unusable UPLOAD_DIR (see src/index.ts): a clean 503 with no path, never an unhandled 500.
      logError('Penyimpanan media tidak tersedia:', error);
      return res.status(503).json(STORAGE_UNAVAILABLE_BODY);
    }
    const storageKey = wantsThumbnail ? buildThumbnailKey(asset.id) : asset.storageKey;
    const file = await resolveStoredFile(root, storageKey);
    if (!file) return res.status(404).json(FILE_MISSING_BODY);

    // Content-Type comes from the stored extension (server-chosen at upload), never from the
    // DB column or the client, so a tampered row cannot turn a download into served HTML.
    const extension = path.extname(file).slice(1).toLowerCase();
    const contentType = MIME_BY_EXTENSION[extension];
    if (!contentType) return res.status(404).json(FILE_MISSING_BODY);

    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader(
      'Cache-Control',
      asset.attachedAt !== null && kind !== 'preview' ? CACHE_ATTACHED : CACHE_PRIVATE,
    );
    if (asset.kind !== 'photo') {
      // Documents and data files are only ever delivered as downloads, never rendered inline.
      res.setHeader(
        'Content-Disposition',
        buildAttachmentDisposition(asset.originalName, extension),
      );
    }

    return await new Promise<void>((resolve) => {
      res.sendFile(
        file,
        // 'allow' is deliberate: the library applies the dotfile rule to EVERY segment of the
        // absolute path, so 'deny' would 500 for a legitimate UPLOAD_DIR like ~/.local/share/...
        // The storage key (no dot segments, see lexicalResolve) and the realpath containment
        // check in resolveStoredFile are what keep serving inside the root.
        { dotfiles: 'allow', cacheControl: false, acceptRanges: true },
        (error?: Error) => {
          if (error && !res.headersSent) respondToSendFileError(res, error);
          resolve();
        },
      );
    });
  } catch (error) {
    logError('Error saat menyajikan media:', error);
    if (!res.headersSent) return res.status(500).json(INTERNAL_ERROR_BODY);
  }
}

export const previewMediaHandler = (req: Request, res: Response) => serveAsset(req, res, 'preview');
export const publicMediaImageHandler = (req: Request, res: Response) =>
  serveAsset(req, res, 'public-image');
export const publicMediaDownloadHandler = (req: Request, res: Response) =>
  serveAsset(req, res, 'public-download');
