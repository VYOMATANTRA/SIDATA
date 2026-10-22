import { createHash } from 'node:crypto';

/**
 * Keyword check for tier-1 templates (SPEC §5). A template's `body` may only make a trend
 * claim through the computed `{trend}` slot; any trend or superlative wording written
 * directly into the body is a claim nobody verifies against the data, so saving it needs an
 * acknowledgment tied to the exact flagged wording.
 *
 * The list lives in code on purpose: it is the policy that polices admin-authored text, so
 * changing it should go through review rather than a form.
 *
 * `tetap` is deliberately absent. It also means "permanent" ("penduduk tetap"), so listing
 * it would flag ordinary resident-status wording.
 */
export const TREND_KEYWORDS: readonly string[] = [
  // direction verbs
  'naik',
  'turun',
  'meningkat',
  'menurun',
  'bertambah',
  'berkurang',
  'melonjak',
  'merosot',
  'anjlok',
  'menyusut',
  'membaik',
  'memburuk',
  // nouns
  'kenaikan',
  'penurunan',
  'peningkatan',
  'pertambahan',
  'pengurangan',
  'lonjakan',
  // superlatives
  'tertinggi',
  'terendah',
  'terbanyak',
  'tersedikit',
  'terbesar',
  'terkecil',
  'terpadat',
  'paling',
  // comparison / continuity
  'lebih tinggi',
  'lebih rendah',
  'lebih banyak',
  'lebih sedikit',
  'lebih besar',
  'lebih kecil',
  'semakin',
  'kian',
  'makin',
  'terus',
  'stabil',
];

export interface TrendKeywordMatch {
  /** The wording as written in the text, including a trailing `-nya` if present. */
  phrase: string;
  /** The matched entry of {@link TREND_KEYWORDS}, lowercase. */
  keyword: string;
  start: number;
  end: number;
  /** The phrase with up to {@link EXCERPT_CONTEXT} characters either side, `…` where cut. */
  excerpt: string;
}

const EXCERPT_CONTEXT = 30;

/** Written over `{placeholders}` before matching; not whitespace and not a letter or digit. */
const MASK = '\u0000';

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Longest first, so "lebih tinggi" is tried before any shorter keyword starting at the same
// position. Spaces become \s+ so a phrase still matches across a line break.
const alternation = [...TREND_KEYWORDS]
  .sort((a, b) => b.length - a.length)
  .map((keyword) => escapeRegex(keyword).replace(/ /g, '\\s+'))
  .join('|');

// Unicode letter/number lookarounds rather than \b, which only knows ASCII word characters
// and would treat an accented letter next to a keyword as a boundary. Never call exec/test on
// this shared global regex; matchAll clones it, which keeps every call stateless.
const KEYWORD_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}])(${alternation})(?:nya)?(?![\\p{L}\\p{N}])`,
  'giu',
);

/**
 * Finds trend/superlative wording in `text`, ignoring anything inside `{placeholders}` (the
 * computed `{trend}` slot is the one sanctioned place for it). Offsets index the original
 * text. Results are in ascending `start` order.
 */
export function findTrendKeywords(text: string): TrendKeywordMatch[] {
  const masked = text.replace(/\{[^{}]*\}/g, (placeholder) => MASK.repeat(placeholder.length));

  return [...masked.matchAll(KEYWORD_PATTERN)].map((match) => {
    const start = match.index;
    const end = start + match[0].length;
    const from = Math.max(0, start - EXCERPT_CONTEXT);
    const to = Math.min(text.length, end + EXCERPT_CONTEXT);

    return {
      phrase: text.slice(start, end),
      keyword: match[1]!.toLowerCase().replace(/\s+/g, ' '),
      start,
      end,
      excerpt: `${from > 0 ? '…' : ''}${text.slice(from, to)}${to < text.length ? '…' : ''}`,
    };
  });
}

/**
 * Identifies one flagged occurrence in one exact body. An acknowledgment carries this key, so
 * it only covers the wording the admin was shown: editing the body (even away from the
 * phrase) or flagging a second occurrence of the same word needs a fresh acknowledgment.
 * NUL separators keep body/start/phrase from running together into the same digest.
 */
export function trendWarningAckKey(
  body: string,
  match: Pick<TrendKeywordMatch, 'phrase' | 'start'>,
): string {
  return createHash('sha256').update(`${body}\0${match.start}\0${match.phrase}`).digest('hex');
}
