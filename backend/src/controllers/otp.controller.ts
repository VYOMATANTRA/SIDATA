import type { Request, Response } from 'express';
import prisma from '../utils/prisma.js';
import { normalizeEmail } from '../utils/validation.js';
import { generate6DigitOtp, hashOtp, verifyOtpHash, getOtpExpiration } from '../utils/otp.js';
import { sendOtpEmail } from '../utils/mailer.js';
import { issueSession } from '../utils/session.js';

const MAX_OTP_ATTEMPTS = 5;

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

    // Atomically reserve one attempt against the 5-guess cap before checking the code, so
    // concurrent verify requests can't all read the same stale `attempts` count and slip
    // past the cap (a plain read-then-update would race). The row is deliberately NOT
    // deleted on lockout — resendOtp's 60s cooldown (below) reads this same row, so deleting
    // it here would let a locked-out attacker immediately resend and keep guessing
    // unthrottled.
    const { count: reserved } = await prisma.emailOtp.updateMany({
      where: { id: otpRecord.id, attempts: { lt: MAX_OTP_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });

    if (reserved === 0) {
      return res.status(429).json({
        error: 'Batas percobaan salah telah tercapai. Silakan minta kode OTP baru.',
      });
    }

    const isMatch = verifyOtpHash(String(otp), otpRecord.otpHash);

    if (!isMatch) {
      const remaining = Math.max(0, MAX_OTP_ATTEMPTS - (otpRecord.attempts + 1));
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

    // Claim the cooldown window by deleting the exact row the check above observed, rather
    // than an unconditional delete of "whatever's there now". If two resend requests race
    // past the cooldown check together, only the one that actually deletes `latestOtp.id`
    // wins the create below — the loser's deleteMany matches zero rows and it backs off
    // with 429 instead of silently clobbering the winner's freshly created OTP. (The email
    // for the losing request has already been sent by this point — a known, accepted gap;
    // closing it fully needs a unique constraint + pre-send atomic claim.)
    if (latestOtp) {
      const { count } = await prisma.emailOtp.deleteMany({ where: { id: latestOtp.id } });
      if (count === 0) {
        return res.status(429).json({
          error: 'Silakan tunggu beberapa saat sebelum meminta kode OTP baru.',
        });
      }
    } else {
      // No prior row existed at the cooldown check — nothing to claim. Still sweep any
      // out-of-band leftovers for this user so create() below can't collide.
      await prisma.emailOtp.deleteMany({ where: { userId: user.id } });
    }

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
