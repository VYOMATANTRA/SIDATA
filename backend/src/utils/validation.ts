import { z } from 'zod';

const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email wajib diisi')
  .max(254, 'Email terlalu panjang')
  .email('Format email tidak valid')
  .transform((value) => value.toLowerCase());

export function normalizeEmail(value: unknown): string {
  const parsed = emailSchema.safeParse(value);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Format email tidak valid');
  }

  return parsed.data;
}
