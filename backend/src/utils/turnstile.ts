import { TURNSTILE_SECRET_KEY } from '../configs/index.js';

export interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

export async function verifyTurnstileToken(token?: string, remoteIp?: string): Promise<boolean> {
  // If Turnstile secret key is not set, pass verification (dev fallback)
  if (!TURNSTILE_SECRET_KEY) {
    return true;
  }

  if (!token) {
    return false;
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', TURNSTILE_SECRET_KEY);
    formData.append('response', token);
    if (remoteIp) {
      formData.append('remoteip', remoteIp);
    }

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
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
