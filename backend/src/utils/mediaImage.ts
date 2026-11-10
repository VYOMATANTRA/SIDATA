import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { MEDIA_IMAGE_CONCURRENCY } from '../configs/index.js';
import {
  PHOTO_MAX_INPUT_PIXELS,
  PHOTO_MAX_LONG_EDGE_PX,
  PHOTO_THUMBNAIL_LONG_EDGE_PX,
  PHOTO_THUMBNAIL_WEBP_QUALITY,
  PHOTO_WEBP_QUALITY,
} from './mediaPolicy.js';
import { MediaValidationError } from './mediaSignature.js';

// Decoded pixel buffers are large and short-lived; libvips' operation cache only helps repeat
// work on the same input, which uploads never are. Keep memory flat on a small VPS.
sharp.cache(false);

export const PHOTO_PROCESSING_MAX_QUEUE = 20;

export class PhotoProcessingSemaphore {
  private active = 0;
  private queue: Array<() => void> = [];
  private concurrency: number;
  private maxQueue: number;

  constructor(concurrency = MEDIA_IMAGE_CONCURRENCY, maxQueue = PHOTO_PROCESSING_MAX_QUEUE) {
    this.concurrency = concurrency;
    this.maxQueue = maxQueue;
  }

  get activeCount(): number {
    return this.active;
  }

  get queueLength(): number {
    return this.queue.length;
  }

  async acquire(): Promise<() => void> {
    if (this.active < this.concurrency) {
      this.active += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        this.release();
      };
    }

    if (this.queue.length >= this.maxQueue) {
      throw new MediaValidationError(
        'MEDIA_PROCESSING_BUSY',
        'Server sedang sibuk memproses gambar lain. Silakan coba lagi beberapa saat lagi.',
        503,
        5,
      );
    }

    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        this.active += 1;
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          this.release();
        });
      });
    });
  }

  private release(): void {
    this.active -= 1;
    if (this.queue.length > 0 && this.active < this.concurrency) {
      const next = this.queue.shift();
      if (next) next();
    }
  }

  configure(concurrency = MEDIA_IMAGE_CONCURRENCY, maxQueue = PHOTO_PROCESSING_MAX_QUEUE): void {
    this.concurrency = concurrency;
    this.maxQueue = maxQueue;
    this.active = 0;
    this.queue = [];
  }
}

export const photoProcessingSemaphore = new PhotoProcessingSemaphore();

export interface PhotoProcessingOptions {
  limitInputPixels?: number;
  maxLongEdgePx?: number;
  thumbnailLongEdgePx?: number;
}

export interface ProcessedPhoto {
  width: number;
  height: number;
}

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);

const invalidImage = (message = 'Gambar rusak atau tidak dapat diproses.') =>
  new MediaValidationError('INVALID_IMAGE', message, 415);

/**
 * Re-encodes an uploaded photo to WebP and writes a thumbnail. Re-encoding is the security
 * boundary: only decoded pixels survive, so EXIF/GPS, XMP, embedded thumbnails and any trailing
 * payload bytes are dropped (sharp keeps no metadata unless asked), and EXIF orientation is
 * applied to the pixels first so photos stay upright. Input pixels are bounded before decode.
 */
export async function processPhoto(
  inputPath: string,
  outputPath: string,
  thumbnailPath: string,
  options: PhotoProcessingOptions = {},
): Promise<ProcessedPhoto> {
  const release = await photoProcessingSemaphore.acquire();
  try {
    return await executeProcessPhoto(inputPath, outputPath, thumbnailPath, options);
  } finally {
    release();
  }
}

async function executeProcessPhoto(
  inputPath: string,
  outputPath: string,
  thumbnailPath: string,
  options: PhotoProcessingOptions = {},
): Promise<ProcessedPhoto> {
  const limitInputPixels = options.limitInputPixels ?? PHOTO_MAX_INPUT_PIXELS;
  const maxEdge = options.maxLongEdgePx ?? PHOTO_MAX_LONG_EDGE_PX;
  const thumbEdge = options.thumbnailLongEdgePx ?? PHOTO_THUMBNAIL_LONG_EDGE_PX;

  let mainBuffer: Buffer;
  let thumbBuffer: Buffer;
  let info: { width: number; height: number };

  try {
    const source = sharp(inputPath, {
      limitInputPixels,
      failOn: 'error',
      sequentialRead: true,
      animated: false,
    });
    const meta = await source.metadata();
    if (!meta.format || !ACCEPTED_FORMATS.has(meta.format) || !meta.width || !meta.height) {
      throw invalidImage();
    }
    if (meta.width * meta.height > limitInputPixels) {
      throw invalidImage('Dimensi gambar terlalu besar.');
    }

    const mainResult = await source
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: PHOTO_WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });

    mainBuffer = mainResult.data;
    info = { width: mainResult.info.width, height: mainResult.info.height };

    const thumbResult = await sharp(mainBuffer)
      .resize({ width: thumbEdge, height: thumbEdge, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: PHOTO_THUMBNAIL_WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });

    thumbBuffer = thumbResult.data;
  } catch (error) {
    if (error instanceof MediaValidationError) throw error;
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string'
    ) {
      const code = (error as { code: string }).code;
      if (
        [
          'ENOSPC',
          'EACCES',
          'EPERM',
          'EROFS',
          'EIO',
          'ENOTDIR',
          'ENOENT',
          'EMFILE',
          'ENFILE',
        ].includes(code)
      ) {
        throw error;
      }
    }
    const message = error instanceof Error ? error.message : '';
    throw invalidImage(
      /pixel limit|exceeds/i.test(message)
        ? 'Dimensi gambar terlalu besar.'
        : 'Gambar rusak atau tidak dapat diproses.',
    );
  }

  // Filesystem writes occur outside the decode/transform try/catch so disk write errors
  // (e.g. ENOSPC, EACCES) propagate as 500 rather than 415 INVALID_IMAGE.
  await writeFile(outputPath, mainBuffer);
  await writeFile(thumbnailPath, thumbBuffer);

  return { width: info.width, height: info.height };
}
