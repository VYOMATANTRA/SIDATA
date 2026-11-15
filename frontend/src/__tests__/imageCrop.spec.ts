import { describe, expect, it, vi } from 'vitest';
import {
  CROP_BACKGROUND_COLOR,
  DEFAULT_BANNER_ASPECT_RATIO,
  DEFAULT_BANNER_TARGET_HEIGHT,
  DEFAULT_BANNER_TARGET_WIDTH,
  DEFAULT_SAFE_ASPECT_RATIO,
  clampPan,
  computeCoverCropRect,
  computeExportDimensions,
  computeSafeZoneBox,
  exportCroppedCanvasBlob,
} from '../utils/imageCrop';

describe('imageCrop geometry helpers', () => {
  it('exports default homepage banner dimensions and aspect ratio', () => {
    expect(DEFAULT_BANNER_TARGET_WIDTH).toBe(1851);
    expect(DEFAULT_BANNER_TARGET_HEIGHT).toBe(731);
    expect(DEFAULT_BANNER_ASPECT_RATIO).toBeCloseTo(1851 / 731, 6);
    expect(DEFAULT_SAFE_ASPECT_RATIO).toBeCloseTo(4 / 3, 6);
  });

  describe('computeCoverCropRect', () => {
    const cases = [
      { label: 'square', naturalWidth: 1000, naturalHeight: 1000 },
      { label: 'portrait', naturalWidth: 800, naturalHeight: 1200 },
      { label: 'ultra-wide', naturalWidth: 3000, naturalHeight: 600 },
      { label: 'small circular badge', naturalWidth: 320, naturalHeight: 320 },
    ];

    it.each(cases)(
      'keeps aspect ratio and stays inside bounds for $label ($naturalWidth×$naturalHeight) at zoom=1',
      ({ naturalWidth, naturalHeight }) => {
        const rect = computeCoverCropRect({
          naturalWidth,
          naturalHeight,
          aspectRatio: DEFAULT_BANNER_ASPECT_RATIO,
          zoom: 1,
          panX: 0,
          panY: 0,
        });

        expect(rect.sw / rect.sh).toBeCloseTo(DEFAULT_BANNER_ASPECT_RATIO, 2);
        expect(Math.abs(rect.sw / rect.sh - DEFAULT_BANNER_ASPECT_RATIO)).toBeLessThan(0.01);
        expect(rect.sx).toBeGreaterThanOrEqual(0);
        expect(rect.sy).toBeGreaterThanOrEqual(0);
        expect(rect.sx + rect.sw).toBeLessThanOrEqual(naturalWidth);
        expect(rect.sy + rect.sh).toBeLessThanOrEqual(naturalHeight);
      },
    );

    it('halves crop width and height when zoom increases from 1 to 2', () => {
      const z1 = computeCoverCropRect({
        naturalWidth: 1000,
        naturalHeight: 1000,
        aspectRatio: DEFAULT_BANNER_ASPECT_RATIO,
        zoom: 1,
        panX: 0,
        panY: 0,
      });
      const z2 = computeCoverCropRect({
        naturalWidth: 1000,
        naturalHeight: 1000,
        aspectRatio: DEFAULT_BANNER_ASPECT_RATIO,
        zoom: 2,
        panX: 0,
        panY: 0,
      });

      expect(z2.sw).toBeCloseTo(z1.sw / 2, 5);
      expect(z2.sh).toBeCloseTo(z1.sh / 2, 5);
    });

    it.each(cases)(
      'clamps extreme panX=9999 and panY=-9999 strictly inside bounds for $label across zooms',
      ({ naturalWidth, naturalHeight }) => {
        for (const zoom of [1, 1.5, 2, 4]) {
          const rect = computeCoverCropRect({
            naturalWidth,
            naturalHeight,
            aspectRatio: DEFAULT_BANNER_ASPECT_RATIO,
            zoom,
            panX: 9999,
            panY: -9999,
          });

          expect(rect.sx).toBeGreaterThanOrEqual(0);
          expect(rect.sy).toBeGreaterThanOrEqual(0);
          expect(rect.sx + rect.sw).toBeLessThanOrEqual(naturalWidth);
          expect(rect.sy + rect.sh).toBeLessThanOrEqual(naturalHeight);
          expect(rect.sy).toBe(0);
          expect(rect.sx + rect.sw).toBeCloseTo(naturalWidth, 5);
        }
      },
    );

    it('clamps opposite extreme panX=-9999 and panY=9999 strictly inside bounds', () => {
      const rect = computeCoverCropRect({
        naturalWidth: 800,
        naturalHeight: 1200,
        aspectRatio: DEFAULT_BANNER_ASPECT_RATIO,
        zoom: 2,
        panX: -9999,
        panY: 9999,
      });

      expect(rect.sx).toBe(0);
      expect(rect.sy + rect.sh).toBeCloseTo(1200, 5);
      expect(rect.sx + rect.sw).toBeLessThanOrEqual(800);
      expect(rect.sy + rect.sh).toBeLessThanOrEqual(1200);
    });
  });

  describe('clampPan', () => {
    it('clamps pan offsets within [-maxPan, maxPan]', () => {
      expect(clampPan(500, -500, 120, 80)).toEqual({ panX: 120, panY: -80 });
      expect(clampPan(40, -25, 120, 80)).toEqual({ panX: 40, panY: -25 });
      expect(clampPan(10, 10, 0, 0)).toEqual({ panX: 0, panY: 0 });
    });
  });

  describe('computeExportDimensions', () => {
    it('never upscales small images beyond cropWidth', () => {
      expect(computeExportDimensions(800, 1851, 731)).toEqual({ width: 800, height: 316 });
    });

    it('caps large images at targetWidth and targetHeight', () => {
      expect(computeExportDimensions(2400, 1851, 731)).toEqual({ width: 1851, height: 731 });
    });
  });

  describe('computeSafeZoneBox', () => {
    it('returns a centered 4:3 safe zone inside a wider banner frame', () => {
      const box = computeSafeZoneBox(1851, 731);
      expect(box.height).toBe(731);
      expect(box.width).toBeCloseTo((731 * 4) / 3, 4);
      expect(box.x).toBeCloseTo((1851 - box.width) / 2, 4);
      expect(box.y).toBe(0);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(1851);
    });

    it('returns a centered safe zone inside a narrower frame when safeAspectRatio is wider', () => {
      const box = computeSafeZoneBox(500, 500, 16 / 9);
      expect(box.width).toBe(500);
      expect(box.height).toBeCloseTo((500 * 9) / 16, 4);
      expect(box.x).toBe(0);
      expect(box.y).toBeCloseTo((500 - box.height) / 2, 4);
    });
  });

  describe('exportCroppedCanvasBlob', () => {
    it('fills opaque background before drawing image and returns exported blob', async () => {
      const calls: string[] = [];
      let fillStyleValue = '';
      const fakeCtx = {
        set fillStyle(value: string) {
          fillStyleValue = value;
        },
        get fillStyle() {
          return fillStyleValue;
        },
        fillRect: vi.fn<(...args: number[]) => void>((...args: number[]) => {
          calls.push(`fillRect:${fillStyleValue}:${args.join(',')}`);
        }),
        drawImage: vi.fn<() => void>(() => {
          calls.push('drawImage');
        }),
      } as unknown as CanvasRenderingContext2D;

      const fakeBlob = new Blob(['webp-bytes'], { type: 'image/webp' });
      const fakeCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn<() => CanvasRenderingContext2D>(() => fakeCtx),
        toBlob: vi.fn<(cb: (blob: Blob | null) => void) => void>((cb) => cb(fakeBlob)),
      } as unknown as HTMLCanvasElement;

      const createElementSpy = vi
        .spyOn(document, 'createElement')
        .mockImplementation((tagName: string) => {
          if (tagName === 'canvas') return fakeCanvas;
          return document.createElementNS('http://www.w3.org/1999/xhtml', tagName);
        });

      const fakeImg = { naturalWidth: 1000, naturalHeight: 1000 } as HTMLImageElement;
      const result = await exportCroppedCanvasBlob({
        image: fakeImg,
        crop: { sx: 0, sy: 300, sw: 1000, sh: 395 },
        targetWidth: 1851,
        targetHeight: 731,
      });

      expect(result).toBe(fakeBlob);
      expect(fakeCanvas.width).toBe(1000);
      expect(fakeCanvas.height).toBe(395);
      expect(calls).toEqual([`fillRect:${CROP_BACKGROUND_COLOR}:0,0,1000,395`, 'drawImage']);

      createElementSpy.mockRestore();
    });

    it('falls back to image/png when image/webp toBlob returns null', async () => {
      const fakeCtx = {
        fillStyle: '',
        fillRect: vi.fn<() => void>(),
        drawImage: vi.fn<() => void>(),
      } as unknown as CanvasRenderingContext2D;

      const pngBlob = new Blob(['png-bytes'], { type: 'image/png' });
      const fakeCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn<() => CanvasRenderingContext2D>(() => fakeCtx),
        toBlob: vi.fn<(cb: (blob: Blob | null) => void, mime?: string) => void>((cb, mime) => {
          cb(mime === 'image/png' ? pngBlob : null);
        }),
      } as unknown as HTMLCanvasElement;

      const createElementSpy = vi
        .spyOn(document, 'createElement')
        .mockImplementation((tagName: string) => {
          if (tagName === 'canvas') return fakeCanvas;
          return document.createElementNS('http://www.w3.org/1999/xhtml', tagName);
        });

      const fakeImg = { naturalWidth: 1000, naturalHeight: 1000 } as HTMLImageElement;
      const result = await exportCroppedCanvasBlob({
        image: fakeImg,
        crop: { sx: 0, sy: 300, sw: 1000, sh: 395 },
      });

      expect(result).toBe(pngBlob);
      createElementSpy.mockRestore();
    });
  });
});
