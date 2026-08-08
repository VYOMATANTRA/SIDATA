import { TURNSTILE_SECRET } from '../configs/index.js';

export interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
}

export async function verifyTurnstileToken(token?: string, remoteIp?: string): Promise<boolean> {
  // If Turnstile secret is not set, pass verification (dev fallback)
  if (!TURNSTILE_SECRET) {
    return true;
  }

  if (!token) {
    return false;
  }

  try {
    const params = new URLSearchParams({
      secret: TURNSTILE_SECRET,
      response: token,
    });
    if (remoteIp) {
      params.append('remoteip', remoteIp);
    }

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    if (!res.ok) {
      return false;
    }

    const data = (await res.json()) as TurnstileVerifyResponse;
    return data.success === true;
  } catch (error) {
    console.error('Error saat verifikasi Cloudflare Turnstile:', error);
    return false;
  }
}
