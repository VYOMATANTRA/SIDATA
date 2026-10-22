import { Prisma } from '../../generated/prisma/client.js';

/**
 * Tier-1 computed-comparison prose (SPEC §5). Pure functions only: an admin-authored
 * template plus an indicator's paired fields in, a sentence out. The trend word is never
 * chosen by a person — it is derived from the two values, so the prose cannot claim a
 * direction the data does not show.
 */

export type Trend = 'naik' | 'turun' | 'tetap';

export const TEMPLATE_SLOTS = [
  'label',
  'unit',
  'value_current',
  'value_previous',
  'period_current',
  'period_previous',
  'delta',
  'delta_percent',
  'trend',
] as const;

export type TemplateSlot = (typeof TEMPLATE_SLOTS)[number];

export interface ComparisonTemplateText {
  body: string;
  trendNaik: string;
  trendTurun: string;
  trendTetap: string;
}

export type TemplateField = keyof ComparisonTemplateText;

export interface ComparableIndicatorFields {
  label: string;
  unit: string | null;
  valueCurrent: string;
  valuePrevious: string | null;
  periodCurrent: string;
  periodPrevious: string | null;
  isComputedComparison: boolean;
}

export type TemplateStructureErrorCode =
  | 'UNKNOWN_PLACEHOLDER'
  | 'TREND_SLOT_MISSING'
  | 'TREND_SLOT_DUPLICATE'
  | 'TREND_SLOT_IN_VARIANT'
  | 'STRAY_BRACE';

export interface TemplateStructureError {
  field: TemplateField;
  code: TemplateStructureErrorCode;
  detail?: string;
}

const TEMPLATE_FIELDS: readonly TemplateField[] = ['body', 'trendNaik', 'trendTurun', 'trendTetap'];

const SLOT_NAMES: ReadonlySet<string> = new Set(TEMPLATE_SLOTS);

/** A well-formed placeholder: braces with no brace inside. Anything else is a stray brace. */
const PLACEHOLDER = /\{([^{}]*)\}/g;

/**
 * Checks every field and reports every problem (not just the first), so an admin can fix a
 * template in one pass. Placeholder names are matched exactly: `{Trend}` and `{ trend }` are
 * unknown, because a lenient reader would let a typo silently render as literal text.
 */
export function validateTemplateStructure(
  template: ComparisonTemplateText,
): TemplateStructureError[] {
  const errors: TemplateStructureError[] = [];

  for (const field of TEMPLATE_FIELDS) {
    const text = template[field];
    let trendCount = 0;

    for (const match of text.matchAll(PLACEHOLDER)) {
      const name = match[1]!;
      if (name === '') continue; // "{}" has no name; reported below as a stray brace.
      if (!SLOT_NAMES.has(name)) {
        errors.push({ field, code: 'UNKNOWN_PLACEHOLDER', detail: name });
      } else if (name === 'trend') {
        trendCount += 1;
      }
    }

    const leftover = text.replace(PLACEHOLDER, (whole, name: string) => (name === '' ? '{' : ''));
    if (/[{}]/.test(leftover)) {
      errors.push({ field, code: 'STRAY_BRACE' });
    }

    if (field === 'body') {
      if (trendCount === 0) errors.push({ field, code: 'TREND_SLOT_MISSING' });
      if (trendCount > 1) errors.push({ field, code: 'TREND_SLOT_DUPLICATE' });
    } else if (trendCount > 0) {
      errors.push({ field, code: 'TREND_SLOT_IN_VARIANT' });
    }
  }

  return errors;
}

/** Compares as exact decimals: JS numbers collapse values that differ past 15–17 digits. */
export function computeTrend(current: string, previous: string): Trend {
  const order = new Prisma.Decimal(current).cmp(new Prisma.Decimal(previous));
  if (order > 0) return 'naik';
  if (order < 0) return 'turun';
  return 'tetap';
}

const DECIMAL_STRING = /^-?\d+(\.\d+)?$/;

/**
 * id-ID formatting (`.` thousands, `,` decimals) done on the digit string itself, so a
 * Decimal(18,4) value never passes through a float. Trailing fractional zeros are trimmed and
 * negative zero renders as `0`.
 */
export function formatDecimalId(value: string): string {
  if (!DECIMAL_STRING.test(value)) {
    throw new Error(`formatDecimalId: not a decimal number: ${JSON.stringify(value)}`);
  }

  const negative = value.startsWith('-');
  const [rawInt = '', rawFraction = ''] = (negative ? value.slice(1) : value).split('.');
  const integer = rawInt.replace(/^0+(?=\d)/, '');
  const fraction = rawFraction.replace(/0+$/, '');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const isZero = /^0*$/.test(integer) && fraction === '';

  return `${negative && !isZero ? '-' : ''}${grouped}${fraction === '' ? '' : `,${fraction}`}`;
}

const SLOT_TOKEN = /\{([a-z_]+)\}/g;

/** One pass, literal replacement: inserted values are never re-scanned or `$`-expanded. */
function fillSlots(text: string, values: Readonly<Record<string, string>>): string {
  return text.replace(SLOT_TOKEN, (token, name: string) => values[name] ?? token);
}

function tidy(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/ ([,.;:!?)])/g, '$1')
    .trim();
}

export interface RenderedComparison {
  trend: Trend;
  text: string;
}

/**
 * Renders the comparison sentence, or null when there is nothing honest to say: the
 * indicator is not a paired computed comparison, the template is malformed, or the text needs
 * a percentage of a zero base.
 */
export function renderComparison(
  fields: ComparableIndicatorFields,
  template: ComparisonTemplateText,
): RenderedComparison | null {
  const { valuePrevious, periodPrevious } = fields;
  if (!fields.isComputedComparison || valuePrevious === null || periodPrevious === null) {
    return null;
  }
  if (validateTemplateStructure(template).length > 0) return null;

  const trend = computeTrend(fields.valueCurrent, valuePrevious);
  const variant = {
    naik: template.trendNaik,
    turun: template.trendTurun,
    tetap: template.trendTetap,
  }[trend];

  const current = new Prisma.Decimal(fields.valueCurrent);
  const previous = new Prisma.Decimal(valuePrevious);
  const delta = current.minus(previous).abs();

  const usesPercent =
    template.body.includes('{delta_percent}') || variant.includes('{delta_percent}');
  if (usesPercent && previous.isZero()) return null;

  const values: Record<string, string> = {
    label: fields.label,
    unit: fields.unit ?? '',
    value_current: formatDecimalId(fields.valueCurrent),
    value_previous: formatDecimalId(valuePrevious),
    period_current: fields.periodCurrent,
    period_previous: periodPrevious,
    delta: formatDecimalId(delta.toFixed()),
    delta_percent: previous.isZero()
      ? ''
      : formatDecimalId(
          delta
            .times(100)
            .div(previous.abs())
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
            .toFixed(),
        ),
  };

  const trendText = fillSlots(variant, values);
  return { trend, text: tidy(fillSlots(template.body, { ...values, trend: trendText })) };
}
