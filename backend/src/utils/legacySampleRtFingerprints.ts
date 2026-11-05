import { createHash } from 'node:crypto';

/**
 * Recognition fingerprints for leftover development sample RT leaders (RT 1–3).
 *
 * Phone numbers are stored only as sha256 hex digests of the trimmed legacy
 * phone string — never as raw dialable values. Matcher behaviour is unchanged:
 * a DB row still matches when its name equals the fingerprint name AND
 * sha256(row.phone) equals the stored digest.
 *
 * Never write these names (or the underlying phones) to new rows, and never
 * display them in the UI.
 */
export function phoneSha256(phone: string): string {
  return createHash('sha256').update(phone.trim()).digest('hex');
}

export type LegacySampleLeaderFingerprint = {
  name: string;
  phoneSha256: string;
};

/**
 * Offline-computed sha256 digests of the three legacy sample phones.
 * Digests only — the raw numbers must not reappear in source.
 */
export const LEGACY_SAMPLE_LEADERS: Record<number, LegacySampleLeaderFingerprint> = {
  1: {
    name: 'Bambang Supriyanto',
    phoneSha256: 'e933c63a212b2b96d6f4958043563664e58be459338fa068f7615a51a9d1bfde',
  },
  2: {
    name: 'Hj. Siti Aminah',
    phoneSha256: 'f994bb8e1ae8e5f3d8a1b64abd48d420c835cc102a44d99079e92a91794623d8',
  },
  3: {
    name: 'Ahmad Dahlan',
    phoneSha256: '80a477d473a668f863ad77f3b1e901972a151533d25daf16cf39641977ea0f12',
  },
};

export function matchesLegacySampleLeader(
  row: { name: string; phone: string },
  expected: LegacySampleLeaderFingerprint,
): boolean {
  return row.name === expected.name && phoneSha256(row.phone) === expected.phoneSha256;
}

export const LEGACY_SAMPLE_POINT_ID = '00000000-0000-0000-0000-000000000001';
