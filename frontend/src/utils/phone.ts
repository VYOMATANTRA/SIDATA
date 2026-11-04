/**
 * Shared phone contact utilities for formatting tel: and WhatsApp links.
 */

const SEPARATOR = /[/,;]|\batau\b|\bdan\b/i;

function digitRun(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

function splitPhoneParts(value: string): string[] {
  return value
    .split(SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** A piece that can stand alone as a local or Indonesian mobile/landline number. */
function isCompletePhone(value: string): boolean {
  const digits = digitRun(value);
  return digits.length >= 10 && digits.length <= 15 && /^(?:0|62|8)/.test(digits);
}

/**
 * null when a separator is present but a piece is not a full number
 * (for example `0812-111/222`), so the cut half is never treated as dialable.
 */
function safeParts(value: string): string[] | null {
  const parts = splitPhoneParts(value);
  if (!SEPARATOR.test(value)) return parts;
  if (parts.length < 2 || !parts.every(isCompletePhone)) return null;
  return parts;
}

/**
 * Splits strings that contain multiple phone numbers separated by slashes,
 * commas, semicolons, or Indonesian conjunctions ('dan', 'atau') and returns
 * the first complete candidate. An unsafe split returns the original string.
 */
export function primaryPhone(value: string): string {
  const parts = safeParts(value);
  if (parts === null) return value.trim();
  return parts[0] ?? value.trim();
}

/** Every complete number in a safe split, or the single number when there is no separator. */
export function dialablePhones(value: string): string[] {
  const parts = safeParts(value);
  if (!parts) return [];
  return parts.filter((part) => isPlausiblePhoneDigitRun(digitRun(part)));
}

/**
 * Strips all non-digit characters from the primary phone candidate.
 * Unsafe multi-number strings yield an empty string so they cannot be linked.
 */
export function digitsOnly(value: string): string {
  const parts = safeParts(value);
  if (!parts || parts.length === 0) return '';
  return digitRun(parts[0] ?? '');
}

/**
 * Validates whether the digits represent a plausible telephone number.
 * Conforms to ITU-T E.164 (maximum 15 digits) and requires at least 7 digits
 * to avoid treating placeholders like '-' or single characters as dialable.
 */
export function isPlausiblePhoneDigitRun(digits: string): boolean {
  return digits.length >= 7 && digits.length <= 15;
}

/**
 * Checks whether the input string contains a dialable phone number.
 */
export function isDialable(value: string): boolean {
  return dialablePhones(value).length > 0;
}

/**
 * Builds a tel: URI, preserving an explicit leading '+' if present on the primary number.
 */
export function telHref(value: string): string {
  const parts = safeParts(value);
  if (!parts || parts.length === 0) return '';
  const primary = parts[0] ?? '';
  const prefix = primary.trim().startsWith('+') ? '+' : '';
  const digits = digitRun(primary);
  if (!isPlausiblePhoneDigitRun(digits)) return '';
  return `tel:${prefix}${digits}`;
}

/**
 * Normalizes an Indonesian phone number to international MSISDN format (without leading '+')
 * suitable for WhatsApp wa.me links. Normalizes '08...' or bare '8...' to '628...'.
 */
export function whatsappNumber(value: string): string {
  const parts = safeParts(value);
  if (!parts || parts.length === 0) return '';
  const digits = digitRun(parts[0] ?? '');
  if (!isPlausiblePhoneDigitRun(digits)) return '';
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
}
