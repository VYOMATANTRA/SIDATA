import crypto from 'node:crypto';

export function generate6DigitOtp(): string {
  const num = crypto.randomInt(100000, 1000000);
  return num.toString();
}

export function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

export function verifyOtpHash(otp: string, hashedOtp: string): boolean {
  const hash = hashOtp(otp);
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hashedOtp));
}

export function getOtpExpiration(minutes = 15): Date {
  const expires = new Date();
  expires.setMinutes(expires.getMinutes() + minutes);
  return expires;
}
