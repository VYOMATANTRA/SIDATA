import type { Request, Response } from 'express';
import prisma from '../utils/prisma.js';
import { normalizeEmail } from '../utils/validation.js';
import { generate6DigitOtp, hashOtp, verifyOtpHash, getOtpExpiration } from '../utils/otp.js';
import { sendOtpEmail } from '../utils/mailer.js';
import { issueSession } from '../utils/session.js';

export const verifyOtp = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email dan kode OTP wajib diisi' });
    }

    let normalizedEmail: string;
    try {
      normalizedEmail = normalizeEmail(email);
    } catch (error) {
      return res
        .status(400)
        .json({ error: error instanceof Error ? error.message : 'Format email tidak valid' });
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { role: true },
    });

    if (!user || user.email_verified) {
      return res.status(400).json({ error: 'Kode OTP tidak valid atau kedaluwarsa' });
    }

    const otpRecord = await prisma.emailOtp.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      return res.status(400).json({ error: 'Kode OTP tidak ditemukan. Silakan minta kode baru.' });
    }

    if (new Date() > otpRecord.expiresAt) {
      await prisma.emailOtp.delete({ where: { id: otpRecord.id } });
      return res
        .status(400)
        .json({ error: 'Kode OTP sudah kedaluwarsa. Silakan minta kode baru.' });
    }

    if (otpRecord.attempts >= 5) {
      await prisma.emailOtp.delete({ where: { id: otpRecord.id } });
      return res.status(429).json({
        error: 'Batas percobaan salah telah tercapai. Silakan minta kode OTP baru.',
      });
    }

    const isMatch = verifyOtpHash(String(otp), otpRecord.otpHash);

    if (!isMatch) {
      const updated = await prisma.emailOtp.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });

      const remaining = Math.max(0, 5 - updated.attempts);
      return res.status(400).json({
        error: `Kode OTP salah. Sisa percobaan: ${remaining}`,
      });
    }

    // Success: Mark email as verified and clear OTPs
    await prisma.user.update({
      where: { id: user.id },
      data: { email_verified: true },
    });

    await prisma.emailOtp.deleteMany({
      where: { userId: user.id },
    });

    // Auto-Login: Issue JWT Access Token and Refresh Token Cookie
    const { accessToken } = await issueSession(res, {
      id: user.id,
      email: user.email,
      role: user.role.name,
    });

    return res.status(200).json({
      message: 'Verifikasi email berhasil',
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role.name,
      },
    });
  } catch (error) {
    console.error('Error saat verifikasi OTP:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server saat verifikasi OTP' });
  }
};

export const resendOtp = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email wajib diisi' });
    }

    let normalizedEmail: string;
    try {
      normalizedEmail = normalizeEmail(email);
    } catch (error) {
      return res
        .status(400)
        .json({ error: error instanceof Error ? error.message : 'Format email tidak valid' });
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || user.email_verified) {
      return res.status(200).json({
        message: 'Kode OTP telah dikirim.',
      });
    }

    // Cooldown check (60 seconds)
    const latestOtp = await prisma.emailOtp.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    if (latestOtp) {
      const now = new Date().getTime();
      const created = new Date(latestOtp.createdAt).getTime();
      const elapsedSeconds = Math.floor((now - created) / 1000);

      if (elapsedSeconds < 60) {
        const remaining = 60 - elapsedSeconds;
        return res.status(429).json({
          error: `Silakan tunggu ${remaining} detik sebelum meminta kode OTP baru.`,
        });
      }
    }

    const newOtp = generate6DigitOtp();
    const hashedOtp = hashOtp(newOtp);
    const expiresAt = getOtpExpiration(15);

    // Only replace the existing OTP once the new one is confirmed sent — deleting first would
    // leave the user with zero valid codes (destroying a still-usable prior code) if the send
    // then fails.
    const emailSent = await sendOtpEmail({ to: user.email, otp: newOtp });
    if (!emailSent) {
      return res.status(500).json({
        error: 'Gagal mengirim email OTP. Silakan coba beberapa saat lagi.',
      });
    }

    await prisma.emailOtp.deleteMany({
      where: { userId: user.id },
    });

    await prisma.emailOtp.create({
      data: {
        userId: user.id,
        otpHash: hashedOtp,
        expiresAt,
      },
    });

    return res.status(200).json({
      message: 'Kode OTP telah dikirim.',
    });
  } catch (error) {
    console.error('Error saat kirim ulang OTP:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server saat mengirim ulang OTP' });
  }
};
