import sharp from 'sharp';
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
  const limitInputPixels = options.limitInputPixels ?? PHOTO_MAX_INPUT_PIXELS;
  const maxEdge = options.maxLongEdgePx ?? PHOTO_MAX_LONG_EDGE_PX;
  const thumbEdge = options.thumbnailLongEdgePx ?? PHOTO_THUMBNAIL_LONG_EDGE_PX;

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

    const info = await source
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: PHOTO_WEBP_QUALITY })
      .toFile(outputPath);

    await sharp(outputPath)
      .resize({ width: thumbEdge, height: thumbEdge, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: PHOTO_THUMBNAIL_WEBP_QUALITY })
      .toFile(thumbnailPath);

    return { width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof MediaValidationError) throw error;
    const message = error instanceof Error ? error.message : '';
    throw invalidImage(
      /pixel limit|exceeds/i.test(message)
        ? 'Dimensi gambar terlalu besar.'
        : 'Gambar rusak atau tidak dapat diproses.',
    );
  }
}
