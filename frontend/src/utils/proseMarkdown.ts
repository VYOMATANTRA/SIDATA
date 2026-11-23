/**
 * Limited Markdown for Cerita section prose. The text is stored as plain text and turned into a
 * small AST here; the public reader renders the AST with real elements (never `v-html`).
 *
 * Syntax: `**tebal**`, `*miring*`, `[teks](alamat)` (http, https and mailto only), lines starting
 * with `- ` form a bullet list, a blank line starts a new paragraph and a single newline is a
 * line break. No HTML. Unpaired or odd markers stay literal text. Nothing here throws: any input
 * (bounded to MAX_PROSE_LENGTH characters) yields a tree.
 *
 * Every scan is linear in the input: delimiter pairing uses one stack per marker, and the link
 * pattern is a sticky regex with bounded quantifiers.
 */

export const MAX_PROSE_LENGTH = 50_000;

export type ProseInline =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: ProseInline[] }
  | { type: 'em'; children: ProseInline[] }
  | { type: 'link'; href: string; children: ProseInline[] };

export type ProseBlock =
  | { type: 'paragraph'; children: ProseInline[] }
  | { type: 'list'; items: ProseInline[][] };

/** Characters a link address may not contain: whitespace, control characters, parentheses, angle brackets. */
const UNSAFE_URL_CHARS = /[\s()<>]/;

function hasControlCharacter(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}
const ALLOWED_SCHEME = /^(?:https?:|mailto:)/i;
const MAX_URL_LENGTH = 2000;

/**
 * True only for absolute http, https and mailto addresses. Relative paths, `javascript:`,
 * `data:` and every other scheme are refused.
 */
export function isAllowedLinkUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const url = value.trim();
  if (url === '' || url.length > MAX_URL_LENGTH) return false;
  if (UNSAFE_URL_CHARS.test(url) || hasControlCharacter(url) || !ALLOWED_SCHEME.test(url)) {
    return false;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'mailto:') return parsed.pathname.length > 0;
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname !== '';
  } catch {
    return false;
  }
}

/** Same test the backend applies to reject HTML tags in prose: `<` followed by a letter, `!` or `/`. */
export const HTML_TAG_PATTERN = /<[a-z!/]/i;

export function containsHtmlTag(text: string): boolean {
  return HTML_TAG_PATTERN.test(text);
}

// Label: 1–300 chars without brackets or newlines. Address: no whitespace or parentheses.
// Both quantifiers are bounded, so a sticky match at a `[` costs at most a few hundred steps.
const LINK_PATTERN = /\[([^[\]\n]{1,300})\]\(([^()\s]{1,2000})\)/y;

type Item =
  | { kind: 'text'; value: string }
  | { kind: 'delim'; marker: '**' | '*'; canOpen: boolean; canClose: boolean; opener: boolean; pair: number }
  | { kind: 'node'; node: ProseInline };

function isWhitespace(ch: string | undefined): boolean {
  return ch === undefined || /\s/.test(ch);
}

/** Flat token list for one run of text. Links are atomic; their labels are parsed separately. */
function scanItems(text: string, allowLinks: boolean): Item[] {
  const items: Item[] = [];
  let buffer = '';
  const flush = (): void => {
    if (buffer !== '') {
      items.push({ kind: 'text', value: buffer });
      buffer = '';
    }
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;

    if (ch === '*') {
      let end = i;
      while (end < text.length && text[end] === '*') end += 1;
      const run = end - i;
      if (run <= 2) {
        flush();
        items.push({
          kind: 'delim',
          marker: run === 2 ? '**' : '*',
          canOpen: !isWhitespace(text[end]),
          canClose: i > 0 && !isWhitespace(text[i - 1]),
          opener: false,
          pair: -1,
        });
      } else {
        // Three or more stars are never a delimiter: they stay literal.
        buffer += text.slice(i, end);
      }
      i = end;
      continue;
    }

    if (ch === '[' && allowLinks) {
      LINK_PATTERN.lastIndex = i;
      const match = LINK_PATTERN.exec(text);
      if (match && match[1]!.trim() !== '') {
        const label = match[1]!;
        const href = match[2]!;
        if (isAllowedLinkUrl(href)) {
          flush();
          items.push({
            kind: 'node',
            node: { type: 'link', href, children: buildInline(scanItems(label, false)) },
          });
        } else {
          // Refused address (javascript:, data:, relative, ...): the whole syntax is plain text.
          buffer += match[0];
        }
        i += match[0].length;
        continue;
      }
    }

    buffer += ch;
    i += 1;
  }
  flush();
  return items;
}

/**
 * Pairs `**` and `*` delimiters. Each closer matches the nearest open opener of the same marker;
 * openers left behind the match are dropped (they stay literal), so pairs never cross.
 */
function pairDelimiters(items: Item[]): void {
  const openers: Record<'**' | '*', number[]> = { '**': [], '*': [] };
  items.forEach((item, index) => {
    if (item.kind !== 'delim') return;
    const stack = openers[item.marker];
    if (item.canClose && stack.length > 0) {
      const opener = stack.pop()!;
      for (const marker of ['**', '*'] as const) {
        const other = openers[marker];
        while (other.length > 0 && other[other.length - 1]! > opener) other.pop();
      }
      const openerItem = items[opener];
      if (openerItem?.kind === 'delim') {
        openerItem.opener = true;
        openerItem.pair = index;
      }
      item.opener = false;
      item.pair = opener;
      return;
    }
    if (item.canOpen) stack.push(index);
  });
}

/**
 * Deeper nesting than this is not built: the markers of a pair past the limit stay literal. Keeps
 * the tree (and the recursion here and in the renderer) shallow for any input.
 */
const MAX_INLINE_NESTING = 4;

/** Turns paired delimiters into nested strong/em nodes. */
function buildFrom(items: Item[], start: number, end: number, depth: number): ProseInline[] {
  const out: ProseInline[] = [];
  const pushText = (value: string): void => {
    const last = out[out.length - 1];
    if (last?.type === 'text') last.value += value;
    else out.push({ type: 'text', value });
  };

  let i = start;
  while (i < end) {
    const item = items[i]!;
    if (item.kind === 'text') {
      pushText(item.value);
    } else if (item.kind === 'node') {
      out.push(item.node);
    } else if (item.opener && item.pair > i && item.pair < end && depth < MAX_INLINE_NESTING) {
      const children = buildFrom(items, i + 1, item.pair, depth + 1);
      out.push({ type: item.marker === '**' ? 'strong' : 'em', children });
      i = item.pair + 1;
      continue;
    } else {
      pushText(item.marker);
    }
    i += 1;
  }
  return out;
}

function buildInline(items: Item[]): ProseInline[] {
  pairDelimiters(items);
  return buildFrom(items, 0, items.length, 0);
}

/** Parses one run of inline text (a paragraph, a list item or a link label). */
export function parseInline(text: string): ProseInline[] {
  return buildInline(scanItems(text, true));
}

/**
 * Parses stored prose into blocks. Input beyond MAX_PROSE_LENGTH characters is ignored; the
 * editor enforces the same cap, so stored text never reaches it.
 */
export function parseProse(source: string): ProseBlock[] {
  const text = typeof source === 'string' ? source.slice(0, MAX_PROSE_LENGTH) : '';
  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  const blocks: ProseBlock[] = [];
  let paragraph: string[] | null = null;
  let list: string[][] | null = null;

  const closeParagraph = (): void => {
    if (paragraph) {
      blocks.push({ type: 'paragraph', children: parseInline(paragraph.join('\n')) });
      paragraph = null;
    }
  };
  const closeList = (): void => {
    if (list) {
      blocks.push({ type: 'list', items: list.map((item) => parseInline(item.join('\n'))) });
      list = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.trim() === '') {
      closeParagraph();
      closeList();
      continue;
    }

    if (line.startsWith('- ') || line === '-') {
      closeParagraph();
      const content = line.slice(2).trim();
      if (content === '') continue;
      if (!list) list = [];
      list.push([content]);
      continue;
    }

    closeList();
    if (paragraph) paragraph.push(line);
    else paragraph = [line];
  }
  closeParagraph();
  closeList();
  return blocks;
}

export interface ProseEditResult {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Toolbar helper for `**` (Tebal) and `*` (Miring). Wraps the selection, unwraps it when the
 * markers are already around it (or inside it), and with no selection inserts the pair with the
 * caret between them.
 */
export function toggleInlineMarker(
  text: string,
  start: number,
  end: number,
  marker: '**' | '*',
): ProseEditResult {
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  const before = text.slice(0, from);
  const selected = text.slice(from, to);
  const after = text.slice(to);
  const m = marker;
  // A single star next to another star belongs to a `**` pair, not to an italic pair.
  const singleOk = m === '**';

  if (from !== to && before.endsWith(m) && after.startsWith(m) && (singleOk || !before.endsWith('**') && !after.startsWith('**'))) {
    return {
      text: before.slice(0, before.length - m.length) + selected + after.slice(m.length),
      selectionStart: from - m.length,
      selectionEnd: to - m.length,
    };
  }

  if (
    from !== to &&
    selected.length >= 2 * m.length &&
    selected.startsWith(m) &&
    selected.endsWith(m) &&
    (singleOk || (!selected.startsWith('**') && !selected.endsWith('**')))
  ) {
    const inner = selected.slice(m.length, selected.length - m.length);
    return {
      text: before + inner + after,
      selectionStart: from,
      selectionEnd: from + inner.length,
    };
  }

  if (from === to) {
    const caret = from + m.length;
    return { text: before + m + m + after, selectionStart: caret, selectionEnd: caret };
  }

  return {
    text: before + m + selected + m + after,
    selectionStart: from + m.length,
    selectionEnd: to + m.length,
  };
}

/**
 * Toolbar helper for Tautan. Refuses an address outside the allow-list (returns null). The label
 * is the selection, or "teks" with no selection; brackets and line breaks are replaced because
 * the link syntax cannot hold them. The label is left selected.
 */
export function applyLink(
  text: string,
  start: number,
  end: number,
  url: string,
): ProseEditResult | null {
  if (!isAllowedLinkUrl(url)) return null;
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  const selected = text.slice(from, to).replace(/[[\]\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
  const label = selected === '' ? 'teks' : selected;
  const insertion = `[${label}](${url.trim()})`;
  return {
    text: text.slice(0, from) + insertion + text.slice(to),
    selectionStart: from + 1,
    selectionEnd: from + 1 + label.length,
  };
}

/**
 * Toolbar helper for Daftar. Prefixes every non-blank line touched by the selection with `- `;
 * when all of them already have the prefix, removes it again.
 */
export function toggleListPrefix(text: string, start: number, end: number): ProseEditResult {
  const from = Math.min(start, end);
  let to = Math.max(start, end);
  // A selection that ends right after a line break does not reach into the next line.
  if (to > from && text[to - 1] === '\n') to -= 1;

  const lineStart = from > 0 ? text.lastIndexOf('\n', from - 1) + 1 : 0;
  const newline = text.indexOf('\n', to);
  const lineEnd = newline === -1 ? text.length : newline;

  const lines = text.slice(lineStart, lineEnd).split('\n');
  const nonBlank = lines.filter((line) => line.trim() !== '');
  const allPrefixed = nonBlank.length > 0 && nonBlank.every((line) => line.startsWith('- '));
  const targets = nonBlank.length > 0 ? nonBlank : lines;

  const transformed = lines.map((line) => {
    if (allPrefixed) return line.startsWith('- ') ? line.slice(2) : line;
    return targets.includes(line) ? `- ${line}` : line;
  });
  const block = transformed.join('\n');

  return {
    text: text.slice(0, lineStart) + block + text.slice(lineEnd),
    selectionStart: lineStart,
    selectionEnd: lineStart + block.length,
  };
}
