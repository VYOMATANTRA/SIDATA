import { describe, it, expect } from 'vitest';
import {
  primaryPhone,
  digitsOnly,
  dialablePhones,
  isPlausiblePhoneDigitRun,
  isDialable,
  isWhatsappMobile,
  telHref,
  undialablePhoneRemainder,
  whatsappNumber,
} from '../utils/phone';

describe('phone utilities', () => {
  it('extracts primary phone from combined numbers', () => {
    expect(primaryPhone('08123456789 / 08198765432')).toBe('08123456789');
    expect(primaryPhone('08123456789, 08198765432')).toBe('08123456789');
    expect(primaryPhone('08123456789; 08198765432')).toBe('08123456789');
    expect(primaryPhone('08123456789 atau 08198765432')).toBe('08123456789');
    expect(primaryPhone('08123456789 DAN 08198765432')).toBe('08123456789');
  });

  it('extracts digits only from primary phone', () => {
    expect(digitsOnly('+62 812-3456-7890')).toBe('6281234567890');
    expect(digitsOnly('(0542) 772158')).toBe('0542772158');
    expect(digitsOnly('-')).toBe('');
  });

  it('validates plausible phone digit runs (7 to 15 digits)', () => {
    expect(isPlausiblePhoneDigitRun('')).toBe(false);
    expect(isPlausiblePhoneDigitRun('123456')).toBe(false);
    expect(isPlausiblePhoneDigitRun('1234567')).toBe(true);
    expect(isPlausiblePhoneDigitRun('081234567890123')).toBe(true);
    expect(isPlausiblePhoneDigitRun('0812345678901234')).toBe(false); // 16 digits
  });

  it('keeps a short single landline dialable', () => {
    expect(isDialable('7721589')).toBe(true);
    expect(telHref('7721589')).toBe('tel:7721589');
  });

  it('checks if contact is dialable', () => {
    expect(isDialable('08123456789')).toBe(true);
    expect(isDialable('-')).toBe(false);
    expect(isDialable('Belum ada')).toBe(false);
  });

  it('keeps the short piece as text and does not send a landline to WhatsApp', () => {
    expect(undialablePhoneRemainder('0542-123456 / 654321')).toBe('654321');
    expect(isWhatsappMobile('0542-123456')).toBe(false);
    expect(isWhatsappMobile('08123456789')).toBe(true);
  });

  it('keeps a complete number when another piece is too short to dial', () => {
    expect(dialablePhones('08123456789 / 12345')).toEqual(['08123456789']);
    expect(isDialable('08123456789 / 12345')).toBe(true);
    expect(telHref('08123456789 / 12345')).toBe('tel:08123456789');
  });

  it('does not treat a cut multi-number string as dialable', () => {
    expect(isDialable('0812-111/222')).toBe(false);
    expect(telHref('0812-111/222')).toBe('');
    expect(whatsappNumber('0812-111/222')).toBe('');
    expect(digitsOnly('0812-111/222')).toBe('');
    expect(dialablePhones('0812-111/222')).toEqual([]);
    expect(primaryPhone('0812-111/222')).toBe('0812-111/222');
  });

  it('returns every complete number when a split is safe', () => {
    expect(dialablePhones('08123456789 / 08129999888')).toEqual(['08123456789', '08129999888']);
  });

  it('formats tel: href preserving leading plus', () => {
    expect(telHref('+62 812-3456-7890')).toBe('tel:+6281234567890');
    expect(telHref('0812-3456-7890')).toBe('tel:081234567890');
    expect(telHref('-')).toBe('');
  });

  it('formats whatsapp numbers to international MSISDN format without plus', () => {
    expect(whatsappNumber('081234567890')).toBe('6281234567890');
    expect(whatsappNumber('81234567890')).toBe('6281234567890');
    expect(whatsappNumber('+62 812-3456-7890')).toBe('6281234567890');
    expect(whatsappNumber('6281234567890')).toBe('6281234567890');
    expect(whatsappNumber('-')).toBe('');
  });
});
