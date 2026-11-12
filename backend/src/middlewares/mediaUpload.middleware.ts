import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import {
  MEDIA_MULTIPART_LIMITS,
  MEDIA_TRANSPORT_MAX_BYTES,
  MEDIA_TYPE_POLICY,
} from '../utils/mediaPolicy.js';
import { declaredExtension, MediaValidationError } from '../utils/mediaSignature.js';
import { getUploadRoot, removeStagingDir, stagingDirFor } from '../utils/mediaStorage.js';

export interface MediaUploadRequest extends Request {
  /** Set once the transport has allocated a staging directory for this request. */
  mediaUpload?: { id: string; root: string };
}

const KNOWN_EXTENSIONS = new Set(
  Object.values(MEDIA_TYPE_POLICY).flatMap((policy) => policy.declaredExtensions),
);

/** Fixed staged filename: the client's name never reaches the filesystem. */
const STAGED_FILE_NAME = 'upload.bin';

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const upload = (req as MediaUploadRequest).mediaUpload;
    if (!upload) return cb(new Error('Staging directory was not allocated.'), '');
    const dir = stagingDirFor(upload.root, upload.id);
    mkdir(dir, { recursive: true }).then(
      () => cb(null, dir),
      (error: Error) => cb(error, ''),
    );
  },
  filename(_req, _file, cb) {
    cb(null, STAGED_FILE_NAME);
  },
});

const uploader = multer({
  storage,
  // Hard ceiling at the largest per-type limit. The per-type limit (5/10/20 MiB) is enforced
  // right after the signature check, because the `purpose` field may arrive after the file part
  // and so cannot be relied on here. Multipart framing is not counted against this limit.
  limits: { ...MEDIA_MULTIPART_LIMITS, fileSize: MEDIA_TRANSPORT_MAX_BYTES },
  fileFilter(_req, file, cb) {
    // Cheap early refusal of obviously unsupported names, before any bytes are written. The
    // signature check later is what actually decides.
    if (!KNOWN_EXTENSIONS.has(declaredExtension(file.originalname))) {
      return cb(
        new MediaValidationError(
          'UNSUPPORTED_TYPE',
          'Jenis berkas tidak didukung. Gunakan JPEG, PNG, WebP, PDF, DOCX, XLSX, atau CSV.',
          415,
        ),
      );
    }
    cb(null, true);
  },
}).single('file');

function describeTransportError(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof MediaValidationError) {
    return { status: error.statusCode, code: error.code, message: error.message };
  }
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return {
        status: 413,
        code: 'FILE_TOO_LARGE',
        message: 'Ukuran berkas melebihi batas yang diizinkan.',
      };
    }
    return {
      status: 400,
      code: 'INVALID_UPLOAD',
      message: 'Unggahan tidak valid. Kirim tepat satu berkas pada kolom "file".',
    };
  }
  // busboy parse failures (malformed multipart, truncated body) arrive as plain Errors.
  const message = error instanceof Error ? error.message : '';
  if (/multipart|boundary|unexpected end|malformed|header/i.test(message)) {
    return { status: 400, code: 'INVALID_UPLOAD', message: 'Unggahan tidak valid.' };
  }
  return {
    status: 500,
    code: 'UPLOAD_FAILED',
    message: 'Terjadi kesalahan internal server',
  };
}

/**
 * Multipart transport for POST /api/media: one `file` part streamed to
 * `<UPLOAD_DIR>/_staging/<uploadId>/upload.bin`, text fields kept in `req.body`. Any transport
 * failure removes the staging directory and answers with a friendly code; on success the
 * controller owns the directory and removes it when it is done.
 */
export async function acceptMediaUpload(
  req: MediaUploadRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  let root: string;
  try {
    root = await getUploadRoot();
  } catch (error) {
    console.error(
      'Penyimpanan media tidak tersedia:',
      error instanceof Error ? error.message : 'unknown error',
    );
    res.status(503).json({
      error: 'Penyimpanan media sedang tidak tersedia.',
      code: 'MEDIA_STORAGE_UNAVAILABLE',
    });
    return;
  }

  const uploadId = randomUUID();
  req.mediaUpload = { id: uploadId, root };

  uploader(req, res, (error?: unknown) => {
    if (!error) {
      next();
      return;
    }
    void removeStagingDir(root, uploadId).then(() => {
      const { status, code, message } = describeTransportError(error);
      if (status === 500) {
        console.error(
          'Error saat menerima unggahan media:',
          error instanceof Error ? error.message : 'unknown error',
        );
      }
      res.status(status).json({ error: message, code });
    });
  });
}
