import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from '../utils/relativeTime';

const NOW = Date.parse('2026-11-26T12:00:00.000Z');

function ago(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

describe('formatRelativeTime', () => {
  it('reads "baru saja" under a minute, and for a timestamp slightly in the future', () => {
    expect(formatRelativeTime(ago(0), NOW)).toBe('baru saja');
    expect(formatRelativeTime(ago(59_000), NOW)).toBe('baru saja');
    expect(formatRelativeTime(new Date(NOW + 5_000).toISOString(), NOW)).toBe('baru saja');
  });

  it('counts minutes, hours and days', () => {
    expect(formatRelativeTime(ago(5 * 60_000), NOW)).toBe('5 menit lalu');
    expect(formatRelativeTime(ago(3 * 3_600_000 + 10_000), NOW)).toBe('3 jam lalu');
    expect(formatRelativeTime(ago(2 * 86_400_000), NOW)).toBe('2 hari lalu');
  });

  it('falls back to a calendar date after a month', () => {
    const label = formatRelativeTime(ago(60 * 86_400_000), NOW);
    expect(label).toMatch(/\d{4}/);
    expect(label).not.toMatch(/lalu/);
  });

  it('returns an empty string for an unparseable timestamp', () => {
    expect(formatRelativeTime('bukan tanggal', NOW)).toBe('');
  });
});
