import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import yauzl from 'yauzl';
import {
  MEDIA_TYPE_POLICY,
  ZIP_CHECK_TIMEOUT_MS,
  ZIP_CONTENT_TYPES_MAX_BYTES,
  ZIP_MAX_DECLARED_UNCOMPRESSED_BYTES,
  ZIP_MAX_ENTRIES,
  type MediaTypeKey,
  type MediaTypePolicy,
} from './mediaPolicy.js';
import { scanCsvFile } from './mediaCsv.js';

export type MediaValidationCode =
  | 'EMPTY_FILE'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_TYPE'
  | 'TYPE_MISMATCH'
  | 'MACRO_ENABLED'
  | 'INVALID_ARCHIVE'
  | 'INVALID_CSV'
  | 'CSV_FORMULA'
  | 'INVALID_IMAGE'
  | 'MEDIA_PROCESSING_BUSY';

/** A file the policy refuses. Messages are safe to show the uploader (no paths, no bytes). */
export class MediaValidationError extends Error {
  readonly code: MediaValidationCode;
  readonly statusCode: number;
  readonly retryAfter?: number;

  constructor(code: MediaValidationCode, message: string, statusCode = 400, retryAfter?: number) {
    super(message);
    this.name = 'MediaValidationError';
    this.code = code;
    this.statusCode = statusCode;
    if (retryAfter !== undefined) {
      this.retryAfter = retryAfter;
    }
  }
}

export interface DetectedMedia {
  typeKey: MediaTypeKey;
  policy: MediaTypePolicy;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ZIP_LOCAL_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const PDF_SIGNATURE = Buffer.from('%PDF-', 'latin1');

type SignatureGuess = MediaTypeKey | 'zip' | null;

/** Magic-byte sniff over the file head. Knows nothing about names, extensions or MIME. */
export function sniffSignature(head: Buffer): SignatureGuess {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (head.length >= PNG_SIGNATURE.length && head.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'png';
  }
  if (
    head.length >= 12 &&
    head.subarray(0, 4).toString('latin1') === 'RIFF' &&
    head.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }
  if (head.length >= PDF_SIGNATURE.length && head.subarray(0, 5).equals(PDF_SIGNATURE)) {
    return 'pdf';
  }
  if (head.length >= 4 && head.subarray(0, 4).equals(ZIP_LOCAL_HEADER)) return 'zip';
  return null;
}

/** Lowercase extension without the dot, from the client-declared name (display input only). */
export function declaredExtension(originalName: string): string {
  return path.extname(originalName.replace(/\\/g, '/')).slice(1).toLowerCase();
}

interface OoxmlInspection {
  hasContentTypes: boolean;
  hasWordDocument: boolean;
  hasWorkbook: boolean;
  hasVbaProject: boolean;
  macroContentType: boolean;
}

/**
 * Lists a ZIP's central directory (never extracts) under a hard time budget. Rejects structural
 * oddities that OOXML never has: duplicate names, traversal names, encryption, entry floods and
 * implausible declared sizes (zip-bomb shape).
 */
export function inspectOoxmlArchive(
  filePath: string,
  timeoutMs: number = ZIP_CHECK_TIMEOUT_MS,
): Promise<OoxmlInspection> {
  return new Promise<OoxmlInspection>((resolve, reject) => {
    if (timeoutMs <= 0) {
      // A spent budget never starts reading.
      reject(
        new MediaValidationError(
          'INVALID_ARCHIVE',
          'Pemeriksaan arsip dokumen melebihi batas waktu.',
        ),
      );
      return;
    }
    let settled = false;
    let zip: yauzl.ZipFile | null = null;
    const timer = setTimeout(() => {
      fail(
        new MediaValidationError(
          'INVALID_ARCHIVE',
          'Pemeriksaan arsip dokumen melebihi batas waktu.',
        ),
      );
    }, timeoutMs);

    function finish(result: OoxmlInspection): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    }

    function fail(error: Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        zip?.close();
      } catch {
        // already closed
      }
      reject(error);
    }

    const invalid = (message = 'Struktur arsip dokumen tidak valid.') =>
      new MediaValidationError('INVALID_ARCHIVE', message);

    yauzl.open(
      filePath,
      { lazyEntries: true, autoClose: true, strictFileNames: true, validateEntrySizes: true },
      (openError, zipfile) => {
        if (openError || !zipfile) {
          fail(invalid());
          return;
        }
        zip = zipfile;

        const seen = new Set<string>();
        const result: OoxmlInspection = {
          hasContentTypes: false,
          hasWordDocument: false,
          hasWorkbook: false,
          hasVbaProject: false,
          macroContentType: false,
        };
        let declaredTotal = 0;

        zipfile.on('error', () => fail(invalid()));
        zipfile.on('end', () => finish(result));
        zipfile.on('entry', (entry: yauzl.Entry) => {
          const name = entry.fileName;
          const lower = name.toLowerCase();

          if (seen.size >= ZIP_MAX_ENTRIES)
            return fail(invalid('Arsip dokumen memiliki terlalu banyak berkas.'));
          if (seen.has(lower)) return fail(invalid());
          seen.add(lower);
          if (name.includes('\0') || name.startsWith('/') || /^[a-z]:/i.test(name)) {
            return fail(invalid());
          }
          if (entry.isEncrypted()) return fail(invalid('Dokumen terenkripsi tidak diizinkan.'));

          declaredTotal += entry.uncompressedSize;
          if (declaredTotal > ZIP_MAX_DECLARED_UNCOMPRESSED_BYTES) {
            return fail(invalid('Isi arsip dokumen terlalu besar setelah diekstrak.'));
          }

          if (lower.endsWith('vbaproject.bin') || lower.endsWith('vbadata.xml')) {
            result.hasVbaProject = true;
          }
          if (lower === 'word/document.xml') result.hasWordDocument = true;
          if (lower === 'xl/workbook.xml') result.hasWorkbook = true;

          if (name === '[Content_Types].xml') {
            result.hasContentTypes = true;
            if (entry.uncompressedSize > ZIP_CONTENT_TYPES_MAX_BYTES) {
              return fail(invalid());
            }
            zipfile.openReadStream(entry, (streamError, stream) => {
              if (streamError || !stream) return fail(invalid());
              const chunks: Buffer[] = [];
              let total = 0;
              stream.on('data', (chunk: Buffer) => {
                total += chunk.length;
                if (total > ZIP_CONTENT_TYPES_MAX_BYTES) {
                  stream.destroy();
                  fail(invalid());
                  return;
                }
                chunks.push(chunk);
              });
              stream.on('error', () => fail(invalid()));
              stream.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8').toLowerCase();
                if (text.includes('macroenabled') || text.includes('vbaproject')) {
                  result.macroContentType = true;
                }
                zipfile.readEntry();
              });
            });
            return;
          }

          zipfile.readEntry();
        });
        zipfile.readEntry();
      },
    );
  });
}

/**
 * Decides what a staged file really is, from its bytes. Extension and client MIME are never
 * trusted to *grant* a type — a recognised signature is required (CSV, which has none, is the
 * one text-sanity exception and still needs a `.csv` name). The declared extension must then
 * agree with the detected type, and the server alone chooses the MIME it will serve.
 *
 * Throws MediaValidationError; returns the detected type on success.
 */
export async function validateStagedFile(
  filePath: string,
  originalName: string,
): Promise<DetectedMedia> {
  const info = await stat(filePath);
  if (!info.isFile() || info.size === 0) {
    throw new MediaValidationError('EMPTY_FILE', 'Berkas kosong atau tidak valid.');
  }

  const handle = await open(filePath, 'r');
  let head: Buffer;
  try {
    const buf = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buf, 0, 16, 0);
    head = buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }

  const ext = declaredExtension(originalName);
  const guess = sniffSignature(head);

  let typeKey: MediaTypeKey;
  if (guess === 'zip') {
    // Archive: only OOXML word/xl packages qualify, and never macro-enabled ones.
    if (info.size > Math.max(MEDIA_TYPE_POLICY.docx.maxBytes, MEDIA_TYPE_POLICY.xlsx.maxBytes)) {
      throw new MediaValidationError('FILE_TOO_LARGE', 'Ukuran berkas melebihi batas.', 413);
    }
    const inspection = await inspectOoxmlArchive(filePath);
    if (inspection.hasVbaProject || inspection.macroContentType) {
      throw new MediaValidationError(
        'MACRO_ENABLED',
        'Dokumen dengan makro tidak diizinkan. Simpan ulang sebagai .docx atau .xlsx tanpa makro.',
        415,
      );
    }
    if (!inspection.hasContentTypes || inspection.hasWordDocument === inspection.hasWorkbook) {
      throw new MediaValidationError(
        'UNSUPPORTED_TYPE',
        'Jenis berkas tidak didukung. Arsip (ZIP) tidak diizinkan.',
        415,
      );
    }
    typeKey = inspection.hasWordDocument ? 'docx' : 'xlsx';
  } else if (guess) {
    typeKey = guess;
  } else if (ext === 'csv') {
    typeKey = 'csv';
  } else {
    throw new MediaValidationError(
      'UNSUPPORTED_TYPE',
      'Jenis berkas tidak didukung. Gunakan JPEG, PNG, WebP, PDF, DOCX, XLSX, atau CSV.',
      415,
    );
  }

  const policy = MEDIA_TYPE_POLICY[typeKey];

  if (info.size > policy.maxBytes) {
    throw new MediaValidationError(
      'FILE_TOO_LARGE',
      `Ukuran berkas melebihi batas ${Math.floor(policy.maxBytes / (1024 * 1024))} MB untuk jenis ini.`,
      413,
    );
  }

  if (!policy.declaredExtensions.includes(ext)) {
    throw new MediaValidationError(
      'TYPE_MISMATCH',
      'Ekstensi berkas tidak sesuai dengan isi berkas yang sebenarnya.',
      415,
    );
  }

  if (typeKey === 'csv') {
    const scan = await scanCsvFile(filePath);
    if (!scan.ok && scan.reason === 'formula') {
      throw new MediaValidationError(
        'CSV_FORMULA',
        "Ada sel CSV yang diawali =, +, -, atau @ sehingga akan dibaca sebagai rumus oleh Excel/Google Sheets. Tambahkan tanda petik tunggal (') di depan nilai tersebut (misalnya '=SUM(A1)), lalu unggah ulang. Angka biasa seperti -5 atau +3,2 tidak bermasalah.",
        415,
      );
    }
    if (!scan.ok) {
      throw new MediaValidationError(
        'INVALID_CSV',
        'Berkas CSV harus berupa teks UTF-8 yang valid tanpa karakter biner.',
        415,
      );
    }
  }

  return { typeKey, policy };
}
