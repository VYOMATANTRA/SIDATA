import crypto from 'node:crypto';
import { COOKIE_ENCRYPTION_KEY } from '../configs/index.js';

// Derive a 32-byte encryption key from COOKIE_ENCRYPTION_KEY using SHA-256
const ENCRYPTION_KEY = crypto.createHash('sha256').update(COOKIE_ENCRYPTION_KEY).digest();

/**
 * Encrypts a string value using AES-256-GCM before storing in a cookie.
 * Output format: <iv_hex>:<auth_tag_hex>:<ciphertext_hex>
 */
export function encryptCookieValue(value: string): string {
  const iv = crypto.randomBytes(12); // 96-bit IV for AES-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(value, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted cookie value.
 * Returns null if decryption or authentication tag verification fails.
 */
export function decryptCookieValue(encryptedValue?: string): string | null {
  if (!encryptedValue || typeof encryptedValue !== 'string') {
    return null;
  }

  try {
    const parts = encryptedValue.split(':');
    if (parts.length !== 3) {
      return null;
    }

    const ivHex = parts[0];
    const authTagHex = parts[1];
    const encryptedText = parts[2];

    if (!ivHex || !authTagHex || !encryptedText) {
      return null;
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    const part1 = decipher.update(encryptedText, 'hex', 'utf8');
    const part2 = decipher.final('utf8');
    return part1 + part2;
  } catch {
    return null;
  }
}
