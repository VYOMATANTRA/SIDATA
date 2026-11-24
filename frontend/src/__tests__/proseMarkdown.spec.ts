import { describe, expect, it } from 'vitest';
import {
  MAX_PROSE_LENGTH,
  applyLink,
  containsHtmlTag,
  isAllowedLinkUrl,
  parseInline,
  parseProse,
  toggleInlineMarker,
  toggleListPrefix,
  type ProseInline,
} from '../utils/proseMarkdown';

/** Compact text form of an inline tree, so assertions read at a glance. */
function show(nodes: ProseInline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
          return node.value;
        case 'strong':
          return `<b>${show(node.children)}</b>`;
        case 'em':
          return `<i>${show(node.children)}</i>`;
        case 'link':
          return `<a ${node.href}>${show(node.children)}</a>`;
      }
    })
    .join('');
}

describe('parseProse blocks', () => {
  it('keeps a plain body as one paragraph with its line breaks', () => {
    const blocks = parseProse('Baris satu.\nBaris dua.');
    expect(blocks).toEqual([
      { type: 'paragraph', children: [{ type: 'text', value: 'Baris satu.\nBaris dua.' }] },
    ]);
  });

  it('starts a new paragraph at a blank line and ignores extra blank lines', () => {
    const blocks = parseProse('Satu.\n\n\n  \nDua.');
    expect(blocks.map((b) => (b.type === 'paragraph' ? show(b.children) : 'list'))).toEqual([
      'Satu.',
      'Dua.',
    ]);
  });

  it('groups lines starting with "- " into one list', () => {
    const blocks = parseProse('Pembuka\n- pertama\n- **kedua**\n\nPenutup');
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toEqual({
      type: 'paragraph',
      children: [{ type: 'text', value: 'Pembuka' }],
    });
    expect(blocks[1]).toEqual({
      type: 'list',
      items: [
        [{ type: 'text', value: 'pertama' }],
        [{ type: 'strong', children: [{ type: 'text', value: 'kedua' }] }],
      ],
    });
    expect(blocks[2]).toEqual({ type: 'paragraph', children: [{ type: 'text', value: 'Penutup' }] });
  });

  it('does not treat "-" without a space, or a dash mid-line, as a list', () => {
    const blocks = parseProse('-satu\nsaya - dua');
    expect(blocks).toEqual([
      { type: 'paragraph', children: [{ type: 'text', value: '-satu\nsaya - dua' }] },
    ]);
  });

  it('normalises CRLF line endings', () => {
    expect(parseProse('a\r\nb')).toEqual(parseProse('a\nb'));
  });

  it('returns no blocks for an empty or non-string body', () => {
    expect(parseProse('')).toEqual([]);
    expect(parseProse(undefined as unknown as string)).toEqual([]);
  });

  it('treats an empty list item as nothing', () => {
    expect(parseProse('- \n- ')).toEqual([]);
  });
});

describe('parseInline emphasis', () => {
  it('parses bold and italic', () => {
    expect(show(parseInline('a **tebal** dan *miring* b'))).toBe(
      'a <b>tebal</b> dan <i>miring</i> b',
    );
  });

  it('nests italic inside bold and bold inside italic', () => {
    expect(show(parseInline('**a *b* c**'))).toBe('<b>a <i>b</i> c</b>');
    expect(show(parseInline('*a **b** c*'))).toBe('<i>a <b>b</b> c</i>');
  });

  it('keeps unpaired markers as literal text', () => {
    expect(show(parseInline('harga 5 * 3 = 15'))).toBe('harga 5 * 3 = 15');
    expect(show(parseInline('**belum ditutup'))).toBe('**belum ditutup');
    expect(show(parseInline('tutup saja*'))).toBe('tutup saja*');
    expect(show(parseInline('a ** b'))).toBe('a ** b');
  });

  it('keeps a pair across a newline inside one paragraph', () => {
    expect(show(parseInline('**satu\ndua**'))).toBe('<b>satu\ndua</b>');
  });

  it('treats runs of three or more stars as literal text', () => {
    expect(show(parseInline('***x***'))).toBe('***x***');
  });

  it('does not pair a closer that follows whitespace or an opener that precedes it', () => {
    expect(show(parseInline('* spasi *'))).toBe('* spasi *');
  });

  it('never pairs markers across nesting levels it cannot represent', () => {
    // The second ** closes the first; the lone * stays literal and nothing is lost.
    expect(show(parseInline('**a **b** c*'))).toBe('**a <b>b</b> c*');
  });

  it('handles very deep marker sequences without throwing or deep trees', () => {
    const text = '*a '.repeat(5000) + ' b*'.repeat(5000);
    expect(() => parseInline(text)).not.toThrow();
    expect(show(parseInline(text))).toContain('a ');

    const depth = (nodes: ProseInline[]): number =>
      nodes.reduce((max, node) => {
        if (node.type === 'text') return max;
        return Math.max(max, 1 + depth(node.children));
      }, 0);
    const nested = '**a '.repeat(3000) + ' b**'.repeat(3000);
    expect(depth(parseInline(nested))).toBeLessThanOrEqual(5);
  });
});

describe('parseInline links', () => {
  it('renders http, https and mailto links', () => {
    expect(show(parseInline('[Sumber](https://example.go.id/a)'))).toBe(
      '<a https://example.go.id/a>Sumber</a>',
    );
    expect(show(parseInline('[surat](mailto:info@example.go.id)'))).toBe(
      '<a mailto:info@example.go.id>surat</a>',
    );
    expect(show(parseInline('[situs](HTTP://example.go.id)'))).toBe(
      '<a HTTP://example.go.id>situs</a>',
    );
  });

  it('keeps javascript:, data:, relative and protocol-relative links as plain text', () => {
    const cases = [
      '[klik](javascript:alert(1))',
      '[klik](javascript:alert)',
      '[gambar](data:text/html,<p>x</p>)',
      '[rel](/cerita/x)',
      '[proto](//evil.example)',
      '[ftp](ftp://example.go.id)',
    ];
    for (const text of cases) {
      const nodes = parseInline(text);
      expect(nodes).toEqual([{ type: 'text', value: text }]);
    }
  });

  it('keeps malformed links literal', () => {
    expect(show(parseInline('[belum tutup'))).toBe('[belum tutup');
    expect(show(parseInline('[teks](https://a.go.id'))).toBe('[teks](https://a.go.id');
    expect(show(parseInline('[](https://a.go.id)'))).toBe('[](https://a.go.id)');
    expect(show(parseInline('[a [b](https://a.go.id)'))).toBe('[a <a https://a.go.id>b</a>');
  });

  it('allows emphasis inside a link label but not a link inside a label', () => {
    expect(show(parseInline('[**tebal**](https://a.go.id)'))).toBe(
      '<a https://a.go.id><b>tebal</b></a>',
    );
    expect(show(parseInline('[x [y](https://a.go.id)](https://b.go.id)'))).not.toContain('<a https://b.go.id>');
  });

  it('refuses a link address with whitespace or parentheses', () => {
    expect(isAllowedLinkUrl('https://a.go.id/x y')).toBe(false);
    expect(isAllowedLinkUrl('https://a.go.id/(x)')).toBe(false);
  });

  it('answers quickly on long runs of link-like openers', () => {
    const text = '['.repeat(20000) + 'x';
    const started = Date.now();
    parseInline(text);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('parseProse input bounds and safety', () => {
  it('ignores input past the length cap instead of parsing it', () => {
    const body = 'a'.repeat(MAX_PROSE_LENGTH) + 'TERLALU';
    const [block] = parseProse(body);
    const text = block?.type === 'paragraph' ? show(block.children) : '';
    expect(text).toHaveLength(MAX_PROSE_LENGTH);
    expect(text).not.toContain('TERLALU');
  });

  it('keeps <script> and event-handler text as plain text in the tree', () => {
    const [block] = parseProse('<script>alert(1)</script> <img src=x onerror=alert(1)>');
    expect(block).toEqual({
      type: 'paragraph',
      children: [
        { type: 'text', value: '<script>alert(1)</script> <img src=x onerror=alert(1)>' },
      ],
    });
  });

  it('allow-lists only http, https and mailto', () => {
    expect(isAllowedLinkUrl('https://a.go.id')).toBe(true);
    expect(isAllowedLinkUrl('mailto:info@a.go.id')).toBe(true);
    expect(isAllowedLinkUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedLinkUrl('data:text/plain,hi')).toBe(false);
    expect(isAllowedLinkUrl('https://')).toBe(false);
    expect(isAllowedLinkUrl('mailto:')).toBe(false);
    expect(isAllowedLinkUrl('')).toBe(false);
    expect(isAllowedLinkUrl(42)).toBe(false);
  });

  it('detects HTML tags the way the backend does', () => {
    expect(containsHtmlTag('<b>x</b>')).toBe(true);
    expect(containsHtmlTag('</p>')).toBe(true);
    expect(containsHtmlTag('<!-- x -->')).toBe(true);
    expect(containsHtmlTag('harga < 5 dan > 3')).toBe(false);
    expect(containsHtmlTag('<3')).toBe(false);
  });
});

describe('toolbar helpers', () => {
  it('wraps a selection in bold markers and keeps it selected', () => {
    expect(toggleInlineMarker('ada teks', 4, 8, '**')).toEqual({
      text: 'ada **teks**',
      selectionStart: 6,
      selectionEnd: 10,
    });
  });

  it('removes the markers again when the selection is already wrapped', () => {
    expect(toggleInlineMarker('ada **teks**', 6, 10, '**')).toEqual({
      text: 'ada teks',
      selectionStart: 4,
      selectionEnd: 8,
    });
  });

  it('removes markers when they are inside the selection', () => {
    expect(toggleInlineMarker('*miring*', 0, 8, '*')).toEqual({
      text: 'miring',
      selectionStart: 0,
      selectionEnd: 6,
    });
  });

  it('does not mistake a bold pair for an italic pair', () => {
    const result = toggleInlineMarker('**teks**', 2, 6, '*');
    expect(result.text).toBe('***teks***');
  });

  it('inserts a marker pair with the caret between when nothing is selected', () => {
    expect(toggleInlineMarker('ab', 1, 1, '*')).toEqual({
      text: 'a**b',
      selectionStart: 2,
      selectionEnd: 2,
    });
  });

  it('applies a link to the selection and refuses a disallowed address', () => {
    expect(applyLink('lihat sini', 6, 10, 'https://a.go.id')).toEqual({
      text: 'lihat [sini](https://a.go.id)',
      selectionStart: 7,
      selectionEnd: 11,
    });
    expect(applyLink('lihat', 0, 0, 'javascript:alert(1)')).toBeNull();
  });

  it('uses "teks" as the label without a selection and strips brackets from the label', () => {
    expect(applyLink('', 0, 0, 'mailto:info@a.go.id')?.text).toBe('[teks](mailto:info@a.go.id)');
    expect(applyLink('[a]', 0, 3, 'https://a.go.id')?.text).toBe('[a](https://a.go.id)');
  });

  it('prefixes selected lines with "- " and removes the prefix when all are prefixed', () => {
    const added = toggleListPrefix('satu\ndua\ntiga', 0, 7);
    expect(added.text).toBe('- satu\n- dua\ntiga');
    expect(toggleListPrefix(added.text, 0, 12).text).toBe('satu\ndua\ntiga');
  });

  it('does not prefix the line after a selection that ends with a line break', () => {
    expect(toggleListPrefix('satu\ndua', 0, 5).text).toBe('- satu\ndua');
  });
});
