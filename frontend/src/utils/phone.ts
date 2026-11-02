/**
 * Shared phone contact utilities for formatting tel: and WhatsApp links.
 */

/**
 * Splits strings that contain multiple phone numbers separated by slashes,
 * commas, semicolons, or Indonesian conjunctions ('dan', 'atau') and returns
 * the first candidate.
 */
export function primaryPhone(value: string): string {
  const parts = value.split(/[/,;]|\batau\b|\bdan\b/i);
  return parts[0]?.trim() ?? value;
}

/**
 * Strips all non-digit characters from the primary phone candidate.
 */
export function digitsOnly(value: string): string {
  return primaryPhone(value).replace(/[^0-9]/g, '');
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
  return isPlausiblePhoneDigitRun(digitsOnly(value));
}

/**
 * Builds a tel: URI, preserving an explicit leading '+' if present on the primary number.
 */
export function telHref(value: string): string {
  const primary = primaryPhone(value);
  const prefix = primary.startsWith('+') ? '+' : '';
  const digits = digitsOnly(value);
  if (!isPlausiblePhoneDigitRun(digits)) return '';
  return `tel:${prefix}${digits}`;
}

/**
 * Normalizes an Indonesian phone number to international MSISDN format (without leading '+')
 * suitable for WhatsApp wa.me links. Normalizes '08...' or bare '8...' to '628...'.
 */
export function whatsappNumber(value: string): string {
  const digits = digitsOnly(value);
  if (!isPlausiblePhoneDigitRun(digits)) return '';
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
}
