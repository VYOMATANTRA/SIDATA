import { describe, expect, it } from 'vitest';
import {
  WEATHER_REFRESH_PRESETS,
  customRefreshLabel,
  formatMinutes,
  presetForCacheTtl,
} from '../utils/weatherRefresh';

describe('weather refresh presets', () => {
  it('maps the three friendly choices to the stored interval', () => {
    expect(WEATHER_REFRESH_PRESETS.map((p) => [p.label, p.cacheTtlMs])).toEqual([
      ['Setiap 30 menit', 1_800_000],
      ['Setiap 1 jam (standar)', 3_600_000],
      ['Setiap 2 jam', 7_200_000],
    ]);
  });

  it('finds the preset for a stored value and returns null for any other value', () => {
    expect(presetForCacheTtl(3_600_000)?.id).toBe('1h');
    expect(presetForCacheTtl(1_800_000)?.id).toBe('30m');
    expect(presetForCacheTtl(7_200_000)?.id).toBe('2h');
    expect(presetForCacheTtl(2_700_000)).toBeNull();
    expect(presetForCacheTtl(null)).toBeNull();
    expect(presetForCacheTtl(undefined)).toBeNull();
  });

  it('words a non-preset value as "Pengaturan khusus" in minutes', () => {
    expect(customRefreshLabel(2_700_000)).toBe('Pengaturan khusus (45 menit)');
    expect(customRefreshLabel(90_000)).toBe('Pengaturan khusus (1,5 menit)');
    expect(customRefreshLabel(86_400_000)).toBe('Pengaturan khusus (1.440 menit)');
  });

  it('formats whole minutes without decimals', () => {
    expect(formatMinutes(60_000)).toBe('1');
    expect(formatMinutes(300_000)).toBe('5');
  });
});
