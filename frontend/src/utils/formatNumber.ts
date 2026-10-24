/**
 * Formats a canonical decimal string the way the backend's comparison prose does (SPEC §5:
 * "Numbers render id-ID style"). Strings are grouped without going through `Number`, because
 * `Decimal(18,4)` allows 14 integer digits — more than a JS number can represent exactly.
 */
export function formatDecimalId(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';

  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [integerPart = '', fractionPart] = unsigned.split('.');

  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fraction = fractionPart ? `,${fractionPart}` : '';

  return `${negative ? '-' : ''}${grouped}${fraction}`;
}
