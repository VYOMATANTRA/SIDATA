import nodemailer from 'nodemailer';
import { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } from '../configs/index.js';

export interface SendOtpEmailParams {
  to: string;
  otp: string;
}

export async function sendOtpEmail({ to, otp }: SendOtpEmailParams): Promise<boolean> {
  if (!SMTP_HOST || !SMTP_USER) {
    console.log(`[DEV MAILER] Kode OTP untuk ${to}: ${otp} (Berlaku 15 menit)`);
    return true;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    const htmlContent = `
      <div style="font-family: 'Inter', system-ui, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #0f172a; margin-top: 0;">Verifikasi Akun SIDATA</h2>
        <p style="color: #475569; font-size: 15px;">Terima kasih telah mendaftar di <strong>SIDATA (Sistem Informasi Data Terpadu Kelurahan Manggar)</strong>.</p>
        <p style="color: #475569; font-size: 15px;">Gunakan kode OTP 6-digit berikut untuk mengaktifkan akun Anda:</p>
        <div style="text-align: center; margin: 32px 0;">
          <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #2563eb; background-color: #eff6ff; padding: 12px 24px; border-radius: 8px; border: 1px dashed #3b82f6; display: inline-block;">
            ${otp}
          </span>
        </div>
        <p style="color: #64748b; font-size: 13px;">Kode ini hanya berlaku selama <strong>15 menit</strong>. Jangan berikan kode ini kepada siapapun.</p>
        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-bottom: 0;">Kelurahan Manggar, Balikpapan Timur &bull; SIDATA</p>
      </div>
    `;

    await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject: `[SIDATA] Kode Verifikasi OTP Anda: ${otp}`,
      html: htmlContent,
    });

    return true;
  } catch (error) {
    console.error(`Gagal mengirim email OTP ke ${to}:`, error);
    // Fallback log in dev
    console.log(`[DEV MAILER FALLBACK] Kode OTP untuk ${to}: ${otp}`);
    return false;
  }
}
