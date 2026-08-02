import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const createLimiter = (limit: number) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => {
      if (!req.ip) {
        throw new Error('Identitas koneksi tidak valid');
      }
      return ipKeyGenerator(req.ip);
    },
  });

export const authLimiter = createLimiter(100);
export const loginLimiter = createLimiter(10);
