import { describe, expect, it } from 'vitest';
import {
  LARGE_STEP_PIXELS,
  STEP_PIXELS,
  clampZoom,
  directionOffset,
  normalizeLocation,
  sameLocation,
} from '../utils/geoPicker';

describe('geoPicker helpers', () => {
  it('normalises latitude by clamping and longitude by wrapping, rounded to 6 decimals', () => {
    expect(normalizeLocation({ latitude: 95, longitude: 10 })).toEqual({
      latitude: 90,
      longitude: 10,
    });
    expect(normalizeLocation({ latitude: -91.5, longitude: 190 })).toEqual({
      latitude: -90,
      longitude: -170,
    });
    expect(normalizeLocation({ latitude: 0, longitude: -190 })).toEqual({
      latitude: 0,
      longitude: 170,
    });
    expect(normalizeLocation({ latitude: 0, longitude: 180 })).toEqual({
      latitude: 0,
      longitude: 180,
    });
    expect(normalizeLocation({ latitude: -1.22512349, longitude: 116.94381251 })).toEqual({
      latitude: -1.225123,
      longitude: 116.943813,
    });
  });

  it('rejects non-finite coordinates', () => {
    expect(normalizeLocation({ latitude: Number.NaN, longitude: 1 })).toBeNull();
    expect(normalizeLocation({ latitude: 1, longitude: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it('clamps zoom to integer bounds', () => {
    expect(clampZoom(0, 1, 20)).toBe(1);
    expect(clampZoom(25, 1, 20)).toBe(20);
    expect(clampZoom(12.6, 1, 20)).toBe(13);
    expect(clampZoom(Number.NaN, 1, 20)).toBe(1);
  });

  it('compares locations within rounding distance', () => {
    expect(sameLocation(null, null)).toBe(true);
    expect(sameLocation(null, { latitude: 0, longitude: 0 })).toBe(false);
    expect(
      sameLocation({ latitude: 1.0000001, longitude: 2 }, { latitude: 1.0000002, longitude: 2 }),
    ).toBe(true);
    expect(sameLocation({ latitude: 1, longitude: 2 }, { latitude: 1.001, longitude: 2 })).toBe(
      false,
    );
  });

  describe('directionOffset', () => {
    it.each([
      ['north', [0, -STEP_PIXELS]],
      ['south', [0, STEP_PIXELS]],
      ['east', [STEP_PIXELS, 0]],
      ['west', [-STEP_PIXELS, 0]],
    ] as const)('steps %s by the normal step', (direction, expected) => {
      expect(directionOffset(direction)).toEqual(expected);
      expect(directionOffset(direction, false)).toEqual(expected);
    });

    it.each([
      ['north', [0, -80]],
      ['south', [0, 80]],
      ['east', [80, 0]],
      ['west', [-80, 0]],
    ] as const)('steps %s by the large (Shift) step', (direction, expected) => {
      expect(directionOffset(direction, true)).toEqual(expected);
    });

    it('uses 16px normal and 80px large steps', () => {
      expect(STEP_PIXELS).toBe(16);
      expect(LARGE_STEP_PIXELS).toBe(80);
      expect(directionOffset('south')).toEqual([0, 16]);
      expect(directionOffset('west', true)).toEqual([-80, 0]);
    });
  });
});
