/**
 * The text rules the Cerita authoring API applies to titles, captions and other single-line text:
 * no HTML tags, and no control or direction-changing characters. Checked in code (not a regular
 * expression over control characters) so the client can refuse the same text early.
 */

/** Looks like the start of an HTML tag (`<b`, `</`, `<!`). */
export function hasHtmlTag(value: string): boolean {
  return /<[a-z!/]/i.test(value);
}

function isControl(code: number, allowLineBreaks: boolean): boolean {
  if (allowLineBreaks && (code === 0x09 || code === 0x0a || code === 0x0d)) return false;
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

function isBidi(code: number): boolean {
  return (
    code === 0x200e ||
    code === 0x200f ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

/** True when the text holds a control character or a text-direction override. */
export function hasUnsafeCharacters(value: string, allowLineBreaks = false): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (isControl(code, allowLineBreaks) || isBidi(code)) return true;
  }
  return false;
}
