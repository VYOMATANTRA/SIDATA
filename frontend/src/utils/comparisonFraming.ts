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
 */
export function formatIndicatorValue(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;

  const hasFraction = numeric % 1 !== 0;
  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(numeric);
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
