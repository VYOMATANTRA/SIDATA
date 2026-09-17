import { RESEND_API_KEY, EMAIL_FROM } from '../configs/index.js';
import { getPublicSettings, DEFAULT_PUBLIC_SETTINGS } from '../services/settings.service.js';

export interface SendOtpEmailParams {
  to: string;
  otp: string;
}

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendOtpEmail({ to, otp }: SendOtpEmailParams): Promise<boolean> {
  let settings = DEFAULT_PUBLIC_SETTINGS;
  try {
    settings = await getPublicSettings();
  } catch (err) {
    console.warn('Gagal memuat pengaturan publik untuk email, menggunakan nilai default:', err);
  }

  try {
    const rawAppName = settings.appName || DEFAULT_PUBLIC_SETTINGS.appName;
    const cleanAppName =
      rawAppName.replace(/[\r\n]+/g, ' ').trim() || DEFAULT_PUBLIC_SETTINGS.appName;
    const cleanOtp = (otp || '').replace(/[\r\n]/g, '').trim();

    const safeAppName = escapeHtml(cleanAppName);
    const safeTaglineOrInst = escapeHtml(settings.tagline || settings.institutionName);
    const safeAreaOrInst = escapeHtml(settings.administrativeArea || settings.institutionName);
    const safeOtp = escapeHtml(cleanOtp);

    const htmlContent = `
      <div style="font-family: 'Inter', system-ui, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #0f172a; margin-top: 0;">Verifikasi Akun ${safeAppName}</h2>
        <p style="color: #475569; font-size: 15px;">Terima kasih telah mendaftar di <strong>${safeAppName} (${safeTaglineOrInst})</strong>.</p>
        <p style="color: #475569; font-size: 15px;">Gunakan kode OTP 6-digit berikut untuk mengaktifkan akun Anda:</p>
        <div style="text-align: center; margin: 32px 0;">
          <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #2563eb; background-color: #eff6ff; padding: 12px 24px; border-radius: 8px; border: 1px dashed #3b82f6; display: inline-block;">
            ${safeOtp}
          </span>
        </div>
        <p style="color: #64748b; font-size: 13px;">Kode ini hanya berlaku selama <strong>15 menit</strong>. Jangan berikan kode ini kepada siapapun.</p>
        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-bottom: 0;">${safeAreaOrInst} &bull; ${safeAppName}</p>
      </div>
    `;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        subject: `[${cleanAppName}] Kode Verifikasi OTP Anda: ${cleanOtp}`,
        html: htmlContent,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error(`Gagal mengirim email OTP ke ${to} via Resend API:`, errData);
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[DEV MAILER FALLBACK] Kode OTP untuk ${to}: ${otp}`);
      }
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Gagal mengirim email OTP ke ${to}:`, error);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV MAILER FALLBACK] Kode OTP untuk ${to}: ${otp}`);
    }
    return false;
  }
}
