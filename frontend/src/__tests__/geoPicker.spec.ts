import { describe, expect, it } from 'vitest';
import {
  LARGE_STEP_PIXELS,
  STEP_PIXELS,
  clampZoom,
  moveLocation,
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

  it('moves the same screen distance at every zoom, so lower zoom means a larger step', () => {
    const from = { latitude: -1.2251, longitude: 116.9438 };
    const near = moveLocation(from, 'east', 17);
    const far = moveLocation(from, 'east', 12);
    expect(near.longitude).toBeGreaterThan(from.longitude);
    expect(near.latitude).toBe(from.latitude);
    // 5 zoom levels apart = 32x the distance per pixel.
    expect((far.longitude - from.longitude) / (near.longitude - from.longitude)).toBeCloseTo(32, 0);
  });

  it('moves in the four compass directions and larger with the modifier', () => {
    const from = { latitude: -1.2251, longitude: 116.9438 };
    expect(moveLocation(from, 'north', 15).latitude).toBeGreaterThan(from.latitude);
    expect(moveLocation(from, 'south', 15).latitude).toBeLessThan(from.latitude);
    expect(moveLocation(from, 'east', 15).longitude).toBeGreaterThan(from.longitude);
    expect(moveLocation(from, 'west', 15).longitude).toBeLessThan(from.longitude);
    const small = moveLocation(from, 'east', 15).longitude - from.longitude;
    const large = moveLocation(from, 'east', 15, true).longitude - from.longitude;
    expect(large / small).toBeCloseTo(LARGE_STEP_PIXELS / STEP_PIXELS, 1);
  });

  it('never leaves the valid world range', () => {
    expect(moveLocation({ latitude: 90, longitude: 0 }, 'north', 1, true).latitude).toBe(90);
    const wrapped = moveLocation({ latitude: 0, longitude: 180 }, 'east', 1, true).longitude;
    expect(wrapped).toBeGreaterThanOrEqual(-180);
    expect(wrapped).toBeLessThan(0);
  });
});
