import { createReadStream } from 'node:fs';

// ---------------------------------------------------------------------------------------------
// CSV upload scan: UTF-8 / control-character sanity plus spreadsheet formula-injection defence,
// done as a streaming tokenizer over the staged file so memory stays bounded whatever its size.
// ---------------------------------------------------------------------------------------------

export type CsvScanResult = { ok: true } | { ok: false; reason: 'binary' | 'formula' };

/** Read size for the staged file. Cell logic carries its state across chunk boundaries. */
export const CSV_SCAN_CHUNK_BYTES = 64 * 1024;

/** Longest cell kept in memory while it is judged "a plain number" (anything longer is not one). */
const MAX_NUMBER_CELL_CHARS = 64;

const MARKUP_START = new RegExp('^\\ufeff?\\s*<[a-z!?]', 'i');
const HEAD_CHARS_FOR_MARKUP_CHECK = 256;
// Tabs and line breaks are the only legitimate control characters in a CSV.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CONTROL = /[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/;

// OWASP "CSV injection": a cell starting with one of these is evaluated as a formula by Excel
// and Sheets. TAB and CR are on the list too (they hide a following formula character); an unquoted CR is a row terminator, so it only
// counts when it leads a quoted cell.
const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r']);

// A cell that is wholly a number is data, not a formula: -5, +3.2, -0,5, .5, 1e-3.
const PLAIN_NUMBER = /^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:[eE][+-]?\d+)?$/;

// Signed numbers and phone numbers: a sign, an optional single space, a digit, then only digits,
// spaces, dots, commas, '%' and '-' separators (+62 812-3456-7890, -5%, -1.234,56). No letters,
// '+', '=', '(', '|', '!' or '@' can follow, so nothing that looks like a function call or an
// arithmetic expression with '+' passes.
const SIGNED_NUMERIC_TEXT = /^[+-] ?\d[\d .,%-]*$/;

type State = 'fieldStart' | 'unquoted' | 'quoted' | 'quoteInQuoted';

/**
 * RFC 4180-style tokenizer (quoted fields with comma, semicolon, and tab delimiters, newlines,
 * and doubled quotes) that inspects the first character of every cell. Feed it decoded text in any
 * chunking; it keeps its state, so a quote, delimiter, escaped quote, or cell split across two
 * chunks is handled exactly like an unsplit one. For a quoted cell the content after the opening
 * quote is what counts.
 */
export class CsvFormulaScanner {
  private state: State = 'fieldStart';
  // Characters of the current cell while it still could be a "plain number" (starts with a trigger).
  private suspect: string | null = null;
  private cellChars = 0;

  /** Returns false as soon as a formula-looking cell is found. */
  feed(text: string): boolean {
    for (const ch of text) {
      switch (this.state) {
        case 'fieldStart':
          if (ch === '"') {
            this.state = 'quoted';
            this.cellChars = 0;
          } else if (ch === ',' || ch === ';' || ch === '\t' || ch === '\n' || ch === '\r') {
            // empty cell / empty line / row terminator (CR, LF or CRLF); stay at fieldStart
          } else {
            this.state = 'unquoted';
            this.cellChars = 0;
            if (!this.consume(ch)) return false;
          }
          break;
        case 'unquoted':
          if (ch === ',' || ch === ';' || ch === '\t' || ch === '\n' || ch === '\r') {
            if (!this.endCell()) return false;
            this.state = 'fieldStart';
          } else if (!this.consume(ch)) {
            return false;
          }
          break;
        case 'quoted':
          if (ch === '"') this.state = 'quoteInQuoted';
          else if (!this.consume(ch)) return false;
          break;
        case 'quoteInQuoted':
          if (ch === '"') {
            // Escaped quote inside the quoted cell.
            this.state = 'quoted';
            if (!this.consume(ch)) return false;
          } else if (ch === ',' || ch === ';' || ch === '\t' || ch === '\n' || ch === '\r') {
            if (!this.endCell()) return false;
            this.state = 'fieldStart';
          } else {
            // Lenient: stray text after a closing quote continues the cell.
            this.state = 'unquoted';
            if (!this.consume(ch)) return false;
          }
          break;
      }
    }
    return true;
  }

  /** Call once after the last chunk. */
  end(): boolean {
    return this.state === 'fieldStart' || this.endCell();
  }

  /** Records one character of the current cell. False when it is clearly a formula. */
  private consume(ch: string): boolean {
    if (this.cellChars === 0) {
      this.cellChars = 1;
      if (FORMULA_TRIGGERS.has(ch)) {
        // '=', '@', TAB and CR can never start a number; '+'/'-' might.
        if (ch !== '+' && ch !== '-') return false;
        this.suspect = ch;
      }
      return true;
    }
    this.cellChars += 1;
    if (this.suspect !== null) {
      if (this.suspect.length >= MAX_NUMBER_CELL_CHARS) return false;
      this.suspect += ch;
    }
    return true;
  }

  private endCell(): boolean {
    const pending = this.suspect;
    this.suspect = null;
    this.cellChars = 0;
    return pending === null || PLAIN_NUMBER.test(pending) || SIGNED_NUMERIC_TEXT.test(pending);
  }
}

/**
 * Scans a staged CSV in chunks: valid UTF-8 (strict, split multi-byte sequences handled by the
 * streaming decoder), no NUL or stray control characters, not markup in disguise, and no cell a
 * spreadsheet would evaluate as a formula. Memory is bounded by the chunk size.
 */
export async function scanCsvFile(
  filePath: string,
  chunkBytes: number = CSV_SCAN_CHUNK_BYTES,
): Promise<CsvScanResult> {
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
  const scanner = new CsvFormulaScanner();
  let head = '';
  let headChecked = false;
  let formula = false;

  const handleText = (text: string): CsvScanResult | null => {
    if (FORBIDDEN_CONTROL.test(text)) return { ok: false, reason: 'binary' };
    if (!headChecked) {
      head += text;
      if (head.length >= HEAD_CHARS_FOR_MARKUP_CHECK) {
        headChecked = true;
        if (MARKUP_START.test(head)) return { ok: false, reason: 'binary' };
      }
    }
    // Keep scanning for binary content even after a formula is found, so the more fundamental
    // problem (not a text file at all) is the one reported.
    if (!formula && !scanner.feed(text)) formula = true;
    return null;
  };

  for await (const chunk of createReadStream(filePath, { highWaterMark: chunkBytes })) {
    const buffer = chunk as Buffer;
    if (buffer.includes(0)) return { ok: false, reason: 'binary' };
    let text: string;
    try {
      text = decoder.decode(buffer, { stream: true });
    } catch (error) {
      if (error instanceof TypeError) return { ok: false, reason: 'binary' };
      throw error;
    }
    const failure = handleText(text);
    if (failure) return failure;
  }
  let finalChunk: string;
  try {
    finalChunk = decoder.decode();
  } catch (error) {
    if (error instanceof TypeError) return { ok: false, reason: 'binary' };
    throw error;
  }
  const failure = handleText(finalChunk);
  if (failure) return failure;

  if (!headChecked && MARKUP_START.test(head)) return { ok: false, reason: 'binary' };
  if (formula || !scanner.end()) return { ok: false, reason: 'formula' };
  return { ok: true };
}
