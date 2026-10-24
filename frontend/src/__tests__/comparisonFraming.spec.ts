import { describe, it, expect } from 'vitest';
import { buildIndicatorNarrative, formatIndicatorValue } from '../utils/comparisonFraming';
import type { IndicatorDto } from '../stores/indicators.store';

function makeIndicator(overrides: Partial<IndicatorDto> = {}): IndicatorDto {
  return {
    id: 'ind-1',
    sectionId: 'sec-1',
    slug: 'jumlah-penduduk',
    label: 'Jumlah Penduduk',
    unit: 'jiwa',
    valueCurrent: '12480.0000',
    valuePrevious: null,
    periodCurrent: '2026',
    periodPrevious: null,
    isComputedComparison: false,
    isStale: false,
    source: null,
    hedgeNote: null,
    sortOrder: 0,
    comparisonTemplateId: null,
    comparison: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('formatIndicatorValue', () => {
  it('formats whole decimal strings without a fraction', () => {
    expect(formatIndicatorValue('12480.0000')).toBe('12.480');
  });

  it('formats fractional values id-ID style with up to 2 decimals', () => {
    expect(formatIndicatorValue('0.9700')).toBe('0,97');
  });
});

describe('buildIndicatorNarrative', () => {
  it('passes through the backend-rendered tier-1 comparison verbatim when present', () => {
    const indicator = makeIndicator({
      valuePrevious: '12100.0000',
      periodPrevious: '2025',
      isComputedComparison: true,
      comparisonTemplateId: 'tmpl-1',
      comparison: { trend: 'naik', text: 'Jumlah Penduduk naik dari 12.100 menjadi 12.480 jiwa.' },
    });

    const narrative = buildIndicatorNarrative(indicator);

    expect(narrative.text).toBe('Jumlah Penduduk naik dari 12.100 menjadi 12.480 jiwa.');
    expect(narrative.isHedged).toBe(false);
    expect(narrative.trend).toBe('naik');
  });

  it('builds point-in-time hedged framing when no comparison is rendered (Spec §6)', () => {
    const indicator = makeIndicator();

    const narrative = buildIndicatorNarrative(indicator);

    expect(narrative.isHedged).toBe(true);
    expect(narrative.trend).toBeNull();
    expect(narrative.text).toBe(
      'Berdasarkan data periode 2026, Jumlah Penduduk tercatat sebesar 12.480 jiwa.',
    );
    // Never emits trend/superlative language when unpaired.
    expect(narrative.text).not.toMatch(/naik|turun|meningkat|menurun|tertinggi|terendah/i);
  });

  it('appends hedgeNote to the hedged sentence when present', () => {
    const indicator = makeIndicator({
      hedgeNote: 'Data Potensi Juni 2024, tidak memiliki pembanding tahun lalu.',
    });

    const narrative = buildIndicatorNarrative(indicator);

    expect(narrative.text).toContain('Data Potensi Juni 2024, tidak memiliki pembanding tahun lalu.');
  });

  it('stays hedged even when isComputedComparison is true but the API returned no comparison', () => {
    // e.g. value_previous/period_previous missing, or no template attached yet.
    const indicator = makeIndicator({ isComputedComparison: true, comparison: null });

    const narrative = buildIndicatorNarrative(indicator);

    expect(narrative.isHedged).toBe(true);
  });

  it('surfaces isStale from the indicator', () => {
    const indicator = makeIndicator({ isStale: true });

    const narrative = buildIndicatorNarrative(indicator);

    expect(narrative.isStale).toBe(true);
  });
});
