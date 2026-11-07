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
const INTERNAL_ERROR_BODY = { error: 'Terjadi kesalahan internal server' } as const;

const CACHE_ATTACHED = 'public, max-age=31536000, immutable';
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
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    logError('Error saat mengunggah media:', error);
    return res.status(500).json(INTERNAL_ERROR_BODY);
  } finally {
    if (upload) await removeStagingDir(upload.root, upload.id);
  }
};

function isServable(asset: MediaAsset, kind: ServeKind): boolean {
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

    const root = await getUploadRoot();
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
        { dotfiles: 'deny', cacheControl: false, acceptRanges: true },
        (error?: Error) => {
          if (error && !res.headersSent) {
            logError('Error saat mengirim berkas media:', error);
            res.status(500).json(INTERNAL_ERROR_BODY);
          }
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
