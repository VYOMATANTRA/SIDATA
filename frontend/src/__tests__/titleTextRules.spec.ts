import { describe, expect, it } from 'vitest';
import { hasHtmlTag, hasUnsafeCharacters, titleTextProblem } from '../utils/titleTextRules';

/**
 * The browser applies the same rule as the server, so a refused title is refused before it is sent.
 * The server rule is `titleSchema` / `hasControlCharacters` in
 * backend/src/utils/hierarchyAuthoring.ts:
 *   1. the title is trimmed, then must be 1 to 255 characters;
 *   2. no character with code 0 to 31 (tab and line breaks included) or 127, and none of the
 *      invisible or direction-changing characters U+00AD, U+200B-U+200F, U+202A-U+202E,
 *      U+2060-U+2069 and U+FEFF (the C1 range U+0080-U+009F is NOT refused);
 *   3. no start of an HTML tag: `<` directly followed by a letter, `!` or `/` (case-insensitive).
 * If either side changes, change both and this table.
 */
const TABLE: Array<[string, string, ReturnType<typeof titleTextProblem>]> = [
  // Ordinary Indonesian titles
  ['plain title', 'Kependudukan', null],
  ['with ampersand', 'Pemerintahan & Kelembagaan', null],
  ['en dash and digits', 'Bab 2.1 – Wilayah Administrasi', null],
  ['diacritics', 'Pendidikan Anak Usia Dini (PAUD) é', null],
  ['inner spaces kept', 'a   b', null],
  // HTML
  ['bold tag', '<b>Tebal</b>', 'html'],
  ['closing tag', 'teks </div>', 'html'],
  ['comment', '<!-- x -->', 'html'],
  ['script', '<script>x</script>', 'html'],
  ['upper-case tag', '<A href="x">', 'html'],
  // < or > that is not a tag
  ['less-than then space', 'Usia < 17 tahun', null],
  ['greater-than', 'a > b', null],
  ['less-than then digit', 'x<5', null],
  ['less-than at the end', 'a<', null],
  // Control characters (server: 0-31 and 127)
  ['NUL', 'a\u0000b', 'characters'],
  ['tab', 'a\tb', 'characters'],
  ['line feed', 'a\nb', 'characters'],
  ['carriage return', 'a\rb', 'characters'],
  ['unit separator', 'a\u001fb', 'characters'],
  ['DEL', 'a\u007fb', 'characters'],
  // C1 controls are allowed by the server, so they are allowed here too
  ['NEL (C1)', 'a\u0085b', null],
  // Invisible and direction-changing characters
  ['soft hyphen', 'a­b', 'characters'],
  ['zero width space', 'a​b', 'characters'],
  ['zero width joiner', 'a‍b', 'characters'],
  ['left-to-right mark', 'a‎b', 'characters'],
  ['right-to-left mark', 'a‏b', 'characters'],
  ['left-to-right embedding', 'a‪b', 'characters'],
  ['right-to-left override', 'a‮b', 'characters'],
  ['word joiner', 'a⁠b', 'characters'],
  ['invisible times (U+2062)', 'a⁢b', 'characters'],
  ['left-to-right isolate', 'a⁦b', 'characters'],
  ['pop directional isolate', 'a⁩b', 'characters'],
  ['byte order mark', 'a﻿b', 'characters'],
  ['U+206A (inside the server range)', 'a⁪b', null],
  // Length, measured after trimming
  ['empty', '', 'empty'],
  ['only spaces', '   ', 'empty'],
  ['255 characters', 'a'.repeat(255), null],
  ['256 characters', 'a'.repeat(256), 'too-long'],
  ['255 plus surrounding spaces', ` ${'a'.repeat(255)} `, null],
  ['256 after trimming', `  ${'a'.repeat(256)}  `, 'too-long'],
  // When several rules fail, the first one in the server's order wins: length, characters, HTML
  ['long and with a tag', `<b>${'a'.repeat(256)}`, 'too-long'],
  ['control and tag', '<b>\u0000', 'characters'],
];

describe('titleTextRules (same rule as the server)', () => {
  it.each(TABLE)('%s', (_name, value, expected) => {
    expect(titleTextProblem(value)).toBe(expected);
  });

  it('exposes the two character checks used for captions, alt text and the like', () => {
    expect(hasHtmlTag('<i>x')).toBe(true);
    expect(hasHtmlTag('usia < 17')).toBe(false);
    expect(hasUnsafeCharacters('a­b')).toBe(true);
    expect(hasUnsafeCharacters('a\u0085b')).toBe(false);
    expect(hasUnsafeCharacters('Kelurahan Manggar – 2025')).toBe(false);
  });
});
