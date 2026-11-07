// Shared fixtures for the media tests: ZIP/OOXML builders, image buffers, a multipart request
// built from raw bytes (no sockets), and a response recorder that supports sendFile.

import { Readable } from 'node:stream';
import { crc32 } from 'node:zlib';
import sharp from 'sharp';

export interface ZipEntry {
  name: string;
  data?: Buffer | string;
}

/** Minimal STORE-only ZIP writer: enough for yauzl, no compression library needed. */
export function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.from(entry.data ?? '');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, eocd]);
}

const CONTENT_TYPES = '<?xml version="1.0"?><Types xmlns="x"><Default Extension="xml"/></Types>';

export function buildDocx(extra: ZipEntry[] = [], contentTypes: string = CONTENT_TYPES): Buffer {
  return buildZip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: 'word/document.xml', data: '<w:document/>' },
    ...extra,
  ]);
}

export function buildXlsx(extra: ZipEntry[] = []): Buffer {
  return buildZip([
    { name: '[Content_Types].xml', data: CONTENT_TYPES },
    { name: 'xl/workbook.xml', data: '<workbook/>' },
    ...extra,
  ]);
}

export const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

export async function makeImage(
  format: 'jpeg' | 'png' | 'webp',
  width = 64,
  height = 48,
  exif = false,
): Promise<Buffer> {
  let pipeline = sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } },
  });
  if (exif) {
    pipeline = pipeline.withExif({
      IFD0: { Copyright: 'secret-copyright', Make: 'secret-camera' },
    });
  }
  return pipeline[format]().toBuffer();
}

export interface MultipartPart {
  name: string;
  value?: string;
  filename?: string;
  data?: Buffer;
  contentType?: string;
}

/** A request-like Readable carrying a multipart body; works with multer without a socket. */
export function buildMultipartRequest(
  parts: MultipartPart[],
  extra: Record<string, unknown> = {},
): Readable & Record<string, unknown> {
  const boundary = '----sidata-test-boundary';
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if (part.filename !== undefined) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n` +
            `Content-Type: ${part.contentType ?? 'application/octet-stream'}\r\n\r\n`,
        ),
      );
      chunks.push(part.data ?? Buffer.alloc(0));
    } else {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value ?? ''}`,
        ),
      );
    }
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(chunks);

  const req = Readable.from([body]) as Readable & Record<string, unknown>;
  req['method'] = 'POST';
  req['headers'] = {
    'content-type': `multipart/form-data; boundary=${boundary}`,
    'content-length': String(body.length),
    'user-agent': 'TestAgent/1.0',
  };
  req['ip'] = '127.0.0.1';
  req['user'] = { id: 'editor-1', email: 'editor@example.com', role: 'editor' };
  Object.assign(req, extra);
  return req;
}

export interface MediaFakeRes {
  statusCode: number | undefined;
  body: unknown;
  headers: Record<string, string>;
  sentFile: string | undefined;
  headersSent: boolean;
  status(code: number): MediaFakeRes;
  json(data: unknown): MediaFakeRes;
  setHeader(name: string, value: string): MediaFakeRes;
  sendFile(file: string, options: Record<string, unknown>, cb: (error?: Error) => void): void;
}

export function makeMediaRes(): MediaFakeRes {
  const res: MediaFakeRes = {
    statusCode: undefined,
    body: undefined,
    headers: {},
    sentFile: undefined,
    headersSent: false,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(data) {
      res.body = data;
      res.headersSent = true;
      return res;
    },
    setHeader(name, value) {
      res.headers[name.toLowerCase()] = value;
      return res;
    },
    sendFile(file, _options, cb) {
      res.sentFile = file;
      res.statusCode ??= 200;
      res.headersSent = true;
      cb();
    },
  };
  return res;
}
