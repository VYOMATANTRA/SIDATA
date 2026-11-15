/**
 * Pure cover-crop geometry and opaque canvas export helpers.
 *
 * Used by `ImageCropModal.vue` so any uploaded photo (square, portrait, ultra-wide, or
 * transparent circular badge) fills 100% of the target aspect frame with zero letterbox gaps and
 * no upscaling beyond the cropped source region.
 */

export const DEFAULT_BANNER_ASPECT_RATIO = 1851 / 731;
export const DEFAULT_BANNER_TARGET_WIDTH = 1851;
export const DEFAULT_BANNER_TARGET_HEIGHT = 731;
export const DEFAULT_SAFE_ASPECT_RATIO = 4 / 3;
export const CROP_BACKGROUND_COLOR = '#0f172a';

export interface CropSourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface CoverCropParams {
  naturalWidth: number;
  naturalHeight: number;
  aspectRatio: number;
  zoom: number;
  /** Horizontal crop-center offset from image center, in source-image pixels. */
  panX: number;
  /** Vertical crop-center offset from image center, in source-image pixels. */
  panY: number;
}

export interface PanBounds {
  maxPanX: number;
  maxPanY: number;
}

export interface PanOffset {
  panX: number;
  panY: number;
}

export interface ExportDimensions {
  width: number;
  height: number;
}

export interface SafeZoneBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExportCroppedOptions {
  image: CanvasImageSource;
  crop: CropSourceRect;
  targetWidth?: number;
  targetHeight?: number;
  backgroundColor?: string;
  mimeType?: 'image/webp' | 'image/png' | 'image/jpeg';
  quality?: number;
}

/**
 * Computes the maximum allowed pan offset (in source-image pixels) from center before the crop
 * frame would step outside the image bounds.
 */
export function computeMaxPan(
  naturalWidth: number,
  naturalHeight: number,
  sw: number,
  sh: number,
): PanBounds {
  return {
    maxPanX: Math.max(0, (naturalWidth - sw) / 2),
    maxPanY: Math.max(0, (naturalHeight - sh) / 2),
  };
}

/**
 * Clamps a crop-center offset `(panX, panY)` inside `[-maxPanX, maxPanX]` and `[-maxPanY, maxPanY]`.
 */
export function clampPan(panX: number, panY: number, maxPanX: number, maxPanY: number): PanOffset {
  const safeMaxX = Number.isFinite(maxPanX) && maxPanX > 0 ? maxPanX : 0;
  const safeMaxY = Number.isFinite(maxPanY) && maxPanY > 0 ? maxPanY : 0;
  const safePanX = Number.isFinite(panX) ? panX : 0;
  const safePanY = Number.isFinite(panY) ? panY : 0;

  return {
    panX: Math.min(safeMaxX, Math.max(-safeMaxX, safePanX)),
    panY: Math.min(safeMaxY, Math.max(-safeMaxY, safePanY)),
  };
}

/**
 * Computes the source crop rectangle `(sx, sy, sw, sh)` in image pixel coordinates that completely
 * covers `aspectRatio` at `zoom >= 1` while staying strictly within `[0, naturalWidth] × [0, naturalHeight]`.
 */
export function computeCoverCropRect(params: CoverCropParams): CropSourceRect {
  const { naturalWidth, naturalHeight, aspectRatio, zoom, panX, panY } = params;
  if (
    !Number.isFinite(naturalWidth) ||
    !Number.isFinite(naturalHeight) ||
    !Number.isFinite(aspectRatio) ||
    naturalWidth <= 0 ||
    naturalHeight <= 0 ||
    aspectRatio <= 0
  ) {
    return { sx: 0, sy: 0, sw: 0, sh: 0 };
  }

  const safeZoom = Number.isFinite(zoom) ? Math.max(1, zoom) : 1;
  const imageAspect = naturalWidth / naturalHeight;

  const baseSw = imageAspect >= aspectRatio ? naturalHeight * aspectRatio : naturalWidth;
  const baseSh = imageAspect >= aspectRatio ? naturalHeight : naturalWidth / aspectRatio;

  let sw = Math.min(naturalWidth, baseSw / safeZoom);
  let sh = Math.min(naturalHeight, baseSh / safeZoom);

  const { maxPanX, maxPanY } = computeMaxPan(naturalWidth, naturalHeight, sw, sh);
  const clamped = clampPan(panX, panY, maxPanX, maxPanY);

  const sx = Math.max(0, Math.min(naturalWidth - sw, (naturalWidth - sw) / 2 + clamped.panX));
  const sy = Math.max(0, Math.min(naturalHeight - sh, (naturalHeight - sh) / 2 + clamped.panY));

  // Guard against floating-point overshoot at the right/bottom edge.
  if (sx + sw > naturalWidth) sw = naturalWidth - sx;
  if (sy + sh > naturalHeight) sh = naturalHeight - sy;

  return { sx, sy, sw, sh };
}

/**
 * Computes export canvas dimensions matching the target aspect ratio without upscaling small
 * images past `cropWidth`.
 */
export function computeExportDimensions(
  cropWidth: number,
  targetWidth: number,
  targetHeight: number,
): ExportDimensions {
  const safeTargetWidth = Math.max(1, Math.round(targetWidth));
  const safeTargetHeight = Math.max(1, Math.round(targetHeight));
  const safeCropWidth = Number.isFinite(cropWidth) && cropWidth > 0 ? Math.round(cropWidth) : 1;
  const width = Math.max(1, Math.min(safeTargetWidth, safeCropWidth));
  const height = Math.max(1, Math.round((width * safeTargetHeight) / safeTargetWidth));

  return { width, height };
}

/**
 * Computes a centered safe-zone rectangle (default `4 / 3`) inside a frame of size
 * `(frameWidth, frameHeight)` so editors see what remains visible on narrower mobile screens and
 * admin cards.
 */
export function computeSafeZoneBox(
  frameWidth: number,
  frameHeight: number,
  safeAspectRatio = DEFAULT_SAFE_ASPECT_RATIO,
): SafeZoneBox {
  if (
    !Number.isFinite(frameWidth) ||
    !Number.isFinite(frameHeight) ||
    !Number.isFinite(safeAspectRatio) ||
    frameWidth <= 0 ||
    frameHeight <= 0 ||
    safeAspectRatio <= 0
  ) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const frameAspect = frameWidth / frameHeight;
  const width = frameAspect >= safeAspectRatio ? frameHeight * safeAspectRatio : frameWidth;
  const height = frameAspect >= safeAspectRatio ? frameHeight : frameWidth / safeAspectRatio;

  return {
    x: (frameWidth - width) / 2,
    y: (frameHeight - height) / 2,
    width,
    height,
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

/**
 * Renders the cropped source region onto an offscreen canvas with an opaque backdrop (preventing
 * transparent PNGs from turning black or washed out) and encodes it as WebP with PNG fallback.
 */
export async function exportCroppedCanvasBlob(options: ExportCroppedOptions): Promise<Blob> {
  const {
    image,
    crop,
    targetWidth = DEFAULT_BANNER_TARGET_WIDTH,
    targetHeight = DEFAULT_BANNER_TARGET_HEIGHT,
    backgroundColor = CROP_BACKGROUND_COLOR,
    mimeType = 'image/webp',
    quality = 0.9,
  } = options;

  const dims = computeExportDimensions(crop.sw, targetWidth, targetHeight);
  const canvas = document.createElement('canvas');
  canvas.width = dims.width;
  canvas.height = dims.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable.');
  }

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, dims.width, dims.height);
  ctx.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, dims.width, dims.height);

  const primaryBlob = await canvasToBlob(canvas, mimeType, quality);
  if (primaryBlob) return primaryBlob;

  if (mimeType !== 'image/png') {
    const fallbackBlob = await canvasToBlob(canvas, 'image/png', 1);
    if (fallbackBlob) return fallbackBlob;
  }

  throw new Error('Failed to export cropped canvas blob.');
}
