import { describe, it, expect } from 'vitest';
import {
  primaryPhone,
  digitsOnly,
  isPlausiblePhoneDigitRun,
  isDialable,
  telHref,
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

  it('checks if contact is dialable', () => {
    expect(isDialable('08123456789')).toBe(true);
    expect(isDialable('-')).toBe(false);
    expect(isDialable('Belum ada')).toBe(false);
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
