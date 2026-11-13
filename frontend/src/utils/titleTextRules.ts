/**
 * The text rules the Cerita authoring API applies to titles, captions and other single-line text,
 * applied in the browser so a refused text is refused before it is sent.
 *
 * Mirrors `titleSchema` / `hasControlCharacters` in backend/src/utils/hierarchyAuthoring.ts, which
 * is the authority; if one changes, change the other and `__tests__/titleTextRules.spec.ts`:
 *   - the text is trimmed, then must be 1 to 255 characters;
 *   - no character with code 0 to 31 (tab and line breaks included) or 127, and none of the
 *     invisible or direction-changing characters U+00AD, U+200B-U+200F, U+202A-U+202E,
 *     U+2060-U+2069 and U+FEFF (the C1 range U+0080-U+009F is allowed);
 *   - no start of an HTML tag: `<` directly followed by a letter, `!` or `/`.
 * Checked in code, not with a regular expression over control characters, which the linter refuses.
 */

export const TITLE_MAX_LENGTH = 255;

/** Looks like the start of an HTML tag (`<b`, `</`, `<!`); same test as the server. */
export function hasHtmlTag(value: string): boolean {
  return /<[a-z!/]/i.test(value);
}

function isControl(code: number): boolean {
  return code <= 31 || code === 127;
}

function isInvisibleOrBidi(code: number): boolean {
  return (
    code === 0x00ad ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2060 && code <= 0x2069) ||
    code === 0xfeff
  );
}

/** True when the text holds a control character, an invisible character or a direction override. */
export function hasUnsafeCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (isControl(code) || isInvisibleOrBidi(code)) return true;
  }
  return false;
}

export type TitleProblem = 'empty' | 'too-long' | 'characters' | 'html';

/** First rule a title breaks, in the server's order (length, characters, HTML), or null. */
export function titleTextProblem(value: string): TitleProblem | null {
  const trimmed = value.trim();
  if (trimmed === '') return 'empty';
  if (trimmed.length > TITLE_MAX_LENGTH) return 'too-long';
  if (hasUnsafeCharacters(trimmed)) return 'characters';
  if (hasHtmlTag(trimmed)) return 'html';
  return null;
}
