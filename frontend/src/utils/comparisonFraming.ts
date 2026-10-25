import type { IndicatorDto } from '../stores/indicators.store';

export interface IndicatorNarrative {
  /** The sentence to display: either the backend-rendered tier-1 comparison, or hedged framing. */
  text: string;
  /** False when this is the verbatim tier-1 comparison sentence; true for client-built hedged framing. */
  isHedged: boolean;
  /** Mirrors indicator.isStale, surfaced here so callers don't need the raw indicator too. */
  isStale: boolean;
  /** Present only when a tier-1 comparison was rendered. */
  trend: 'naik' | 'turun' | 'tetap' | null;
}

/**
 * Formats a decimal-string value id-ID style: thousands separator '.', decimal separator ','.
 * Drops a trailing fractional part that is exactly zero (e.g. "1234.0000" -> "1.234").
 *
 * Formats directly from the string rather than via Number(): valueCurrent/valuePrevious are
 * DECIMAL(18,4) columns, and Number() both (a) rounds small fractions like "0.0040" to 0 under
 * `maximumFractionDigits: 2`, silently showing "0" for a real stored figure, and (b) loses
 * precision on large values once they exceed a JS double's ~15-17 significant digits. Public
 * figures must match the stored value exactly (Spec §5/§6).
 */
export function formatIndicatorValue(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return value;

  const sign = match[1] ?? '';
  const integerPart = match[2] ?? '0';
  const fractionPart = match[3] ?? '';

  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const trimmedFraction = fractionPart.replace(/0+$/, '');

  // Avoid a "-0" display for values like "-0.0000" — there's no real negative figure here.
  const isZero = !/[1-9]/.test(integerPart + trimmedFraction);

  return `${isZero ? '' : sign}${groupedInteger}${trimmedFraction ? `,${trimmedFraction}` : ''}`;
}

/**
 * Single enforcement point for Spec §5/§6: an indicator only gets trend/comparison language when
 * the backend actually rendered one (requires a paired value_previous + an attached template).
 * Every other indicator gets point-in-time hedged framing only — never trend language.
 */
export function buildIndicatorNarrative(indicator: IndicatorDto): IndicatorNarrative {
  if (indicator.comparison) {
    return {
      text: indicator.comparison.text,
      isHedged: false,
      isStale: indicator.isStale,
      trend: indicator.comparison.trend,
    };
  }

  const formattedValue = formatIndicatorValue(indicator.valueCurrent);
  const unitSuffix = indicator.unit ? ` ${indicator.unit}` : '';
  let text = `Berdasarkan data periode ${indicator.periodCurrent}, ${indicator.label} tercatat sebesar ${formattedValue}${unitSuffix}.`;

  if (indicator.hedgeNote) {
    text += ` ${indicator.hedgeNote}`;
  }

  return {
    text,
    isHedged: true,
    isStale: indicator.isStale,
    trend: null,
  };
}
