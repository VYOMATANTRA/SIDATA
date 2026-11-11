import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  DATA_MAX_BYTES,
  DOCUMENT_MAX_BYTES,
  PHOTO_MAX_BYTES,
  MEDIA_TRANSPORT_MAX_BYTES,
} from '../utils/mediaPolicy.js';
import {
  MediaValidationError,
  declaredExtension,
  inspectOoxmlArchive,
  sniffSignature,
  validateStagedFile,
  type MediaValidationCode,
} from '../utils/mediaSignature.js';
import { scanCsvFile } from '../utils/mediaCsv.js';
import { processPhoto } from '../utils/mediaImage.js';
import { PDF_BYTES, buildDocx, buildXlsx, buildZip, makeImage } from './helpers/mediaFixtures.js';

let dir: string;
let counter = 0;

before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'sidata-signature-'));
});
after(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function stage(bytes: Buffer): Promise<string> {
  const file = path.join(dir, `staged-${(counter += 1)}.bin`);
  await writeFile(file, bytes);
  return file;
}

async function rejectsWith(bytes: Buffer, name: string, code: MediaValidationCode) {
  await assert.rejects(
    async () => validateStagedFile(await stage(bytes), name),
    (error: unknown) => {
      assert.ok(
        error instanceof MediaValidationError,
        `expected MediaValidationError, got ${error}`,
      );
      assert.equal(error.code, code);
      return true;
    },
  );
}

describe('sniffSignature', () => {
  it('recognises each supported binary signature and nothing else', async () => {
    assert.equal(sniffSignature(await makeImage('jpeg')), 'jpeg');
    assert.equal(sniffSignature(await makeImage('png')), 'png');
    assert.equal(sniffSignature(await makeImage('webp')), 'webp');
    assert.equal(sniffSignature(PDF_BYTES), 'pdf');
    assert.equal(sniffSignature(buildDocx()), 'zip');
    assert.equal(sniffSignature(Buffer.from('MZ\x90\x00\x03')), null);
    assert.equal(sniffSignature(Buffer.from('\x7fELF')), null);
    assert.equal(sniffSignature(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
    assert.equal(sniffSignature(Buffer.from('<!doctype html><html>')), null);
    assert.equal(sniffSignature(Buffer.alloc(0)), null);
  });

  it('does not take a RIFF container that is not WebP for an image', () => {
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]);
    assert.equal(sniffSignature(wav), null);
  });
});

describe('declaredExtension', () => {
  it('lowercases and handles path separators and double extensions', () => {
    assert.equal(declaredExtension('Foto.JPG'), 'jpg');
    assert.equal(declaredExtension('C:\\temp\\laporan.PDF'), 'pdf');
    assert.equal(declaredExtension('archive.tar.gz'), 'gz');
    assert.equal(declaredExtension('noext'), '');
  });
});

describe('validateStagedFile: accepted files', () => {
  it('accepts JPEG, PNG and WebP photos', async () => {
    for (const [format, name] of [
      ['jpeg', 'a.jpg'],
      ['jpeg', 'b.JPEG'],
      ['png', 'c.png'],
      ['webp', 'd.webp'],
    ] as const) {
      const result = await validateStagedFile(await stage(await makeImage(format)), name);
      assert.equal(result.typeKey, format);
      assert.equal(result.policy.kind, 'photo');
    }
  });

  it('accepts a PDF', async () => {
    const result = await validateStagedFile(await stage(PDF_BYTES), 'laporan.pdf');
    assert.equal(result.typeKey, 'pdf');
    assert.equal(result.policy.kind, 'document');
  });

  it('accepts a DOCX and an XLSX with their required entries', async () => {
    const docx = await validateStagedFile(await stage(buildDocx()), 'surat.docx');
    assert.equal(docx.typeKey, 'docx');
    assert.equal(docx.policy.kind, 'document');
    const xlsx = await validateStagedFile(await stage(buildXlsx()), 'data.xlsx');
    assert.equal(xlsx.typeKey, 'xlsx');
    assert.equal(xlsx.policy.kind, 'data');
  });

  it('accepts a UTF-8 CSV, with or without BOM, tabs and CRLF', async () => {
    const csv = Buffer.from('rt,nama\r\n1,Budi\t(ketua)\r\n2,Siti Ñandú\r\n');
    assert.equal((await validateStagedFile(await stage(csv), 'rt.csv')).typeKey, 'csv');
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), csv]);
    assert.equal((await validateStagedFile(await stage(bom), 'rt.CSV')).typeKey, 'csv');
  });
});

describe('validateStagedFile: rejected files', () => {
  it('rejects an executable renamed to .jpg (no signature)', async () => {
    await rejectsWith(
      Buffer.from('MZ\x90\x00\x03\x00\x00\x00 fake exe'),
      'foto.jpg',
      'UNSUPPORTED_TYPE',
    );
    await rejectsWith(Buffer.from('\x7fELF\x02\x01\x01\x00'), 'foto.png', 'UNSUPPORTED_TYPE');
  });

  it('rejects SVG and HTML, however they are named', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    await rejectsWith(svg, 'logo.svg', 'UNSUPPORTED_TYPE');
    await rejectsWith(svg, 'logo.png', 'UNSUPPORTED_TYPE');
    const html = Buffer.from('<html><body onload="x()">hi</body></html>');
    await rejectsWith(html, 'page.html', 'UNSUPPORTED_TYPE');
    await rejectsWith(html, 'page.jpg', 'UNSUPPORTED_TYPE');
  });

  it('rejects markup that is merely named .csv', async () => {
    await rejectsWith(Buffer.from('<svg xmlns="x"/>'), 'data.csv', 'INVALID_CSV');
    await rejectsWith(Buffer.from('<!doctype html><html>'), 'data.csv', 'INVALID_CSV');
  });

  it('rejects an empty file', async () => {
    await rejectsWith(Buffer.alloc(0), 'a.jpg', 'EMPTY_FILE');
  });

  it('rejects a real image whose extension disagrees with its content', async () => {
    await rejectsWith(await makeImage('png'), 'x.jpg', 'TYPE_MISMATCH');
    await rejectsWith(await makeImage('jpeg'), 'x.pdf', 'TYPE_MISMATCH');
    await rejectsWith(PDF_BYTES, 'x.docx', 'TYPE_MISMATCH');
    await rejectsWith(PDF_BYTES, 'x.csv', 'TYPE_MISMATCH');
    await rejectsWith(buildDocx(), 'x.xlsx', 'TYPE_MISMATCH');
    await rejectsWith(await makeImage('jpeg'), 'noextension', 'TYPE_MISMATCH');
  });

  it('rejects a macro-enabled DOCX/XLSX (vbaProject.bin)', async () => {
    const vba = { name: 'word/vbaProject.bin', data: Buffer.from('OLE') };
    await rejectsWith(buildDocx([vba]), 'makro.docx', 'MACRO_ENABLED');
    await rejectsWith(buildDocx([vba]), 'makro.docm', 'MACRO_ENABLED');
    await rejectsWith(
      buildXlsx([{ name: 'xl/vbaProject.bin', data: Buffer.from('OLE') }]),
      'makro.xlsx',
      'MACRO_ENABLED',
    );
  });

  it('rejects an OOXML package that declares a macro-enabled content type', async () => {
    const docm = buildDocx(
      [],
      '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.ms-word.document.macroEnabled.main+xml"/></Types>',
    );
    await rejectsWith(docm, 'sneaky.docx', 'MACRO_ENABLED');
  });

  it('rejects generic ZIP archives and packages missing required entries', async () => {
    await rejectsWith(buildZip([{ name: 'a.txt', data: 'hi' }]), 'arsip.zip', 'UNSUPPORTED_TYPE');
    await rejectsWith(buildZip([{ name: 'a.txt', data: 'hi' }]), 'arsip.docx', 'UNSUPPORTED_TYPE');
    await rejectsWith(
      buildZip([{ name: 'word/document.xml', data: '<x/>' }]),
      'nocontenttypes.docx',
      'UNSUPPORTED_TYPE',
    );
    await rejectsWith(
      buildZip([
        { name: '[Content_Types].xml', data: '<Types/>' },
        { name: 'word/document.xml', data: '<x/>' },
        { name: 'xl/workbook.xml', data: '<x/>' },
      ]),
      'both.docx',
      'UNSUPPORTED_TYPE',
    );
  });

  it('rejects corrupt archives and structurally suspicious ones', async () => {
    const truncated = buildDocx().subarray(0, 60);
    await rejectsWith(truncated, 'broken.docx', 'INVALID_ARCHIVE');
    await rejectsWith(
      buildZip([
        { name: '[Content_Types].xml', data: '<Types/>' },
        { name: 'word/document.xml', data: '<x/>' },
        { name: 'WORD/Document.xml', data: '<y/>' },
      ]),
      'dupes.docx',
      'INVALID_ARCHIVE',
    );
    await rejectsWith(
      buildDocx([{ name: '../evil.txt', data: 'x' }]),
      'traversal.docx',
      'INVALID_ARCHIVE',
    );
  });

  it('rejects a CSV with NUL bytes, invalid UTF-8, or stray control characters', async () => {
    await rejectsWith(Buffer.from('a,b\n1,\x002\n'), 'x.csv', 'INVALID_CSV');
    await rejectsWith(Buffer.from([0x61, 0x2c, 0xff, 0xfe, 0x0a]), 'x.csv', 'INVALID_CSV');
    await rejectsWith(Buffer.from('a,b\n1,\x072\n'), 'x.csv', 'INVALID_CSV');
    // UTF-16 text (BOM + NULs) is not UTF-8 CSV.
    await rejectsWith(Buffer.from('\ufeffa,b\n', 'utf16le'), 'x.csv', 'INVALID_CSV');
  });

  it('rejects executables and archives by name even when the bytes are plausible text', async () => {
    await rejectsWith(Buffer.from('echo hi'), 'run.sh', 'UNSUPPORTED_TYPE');
    await rejectsWith(Buffer.from('plain text'), 'notes.txt', 'UNSUPPORTED_TYPE');
  });

  it('enforces per-type size limits right at the boundary', async () => {
    const jpegHead = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const atLimit = Buffer.concat([jpegHead, Buffer.alloc(PHOTO_MAX_BYTES - jpegHead.length)]);
    const over = Buffer.concat([jpegHead, Buffer.alloc(PHOTO_MAX_BYTES - jpegHead.length + 1)]);
    // At the limit the signature/extension checks pass (decoding happens later, in sharp).
    assert.equal((await validateStagedFile(await stage(atLimit), 'a.jpg')).typeKey, 'jpeg');
    await rejectsWith(over, 'a.jpg', 'FILE_TOO_LARGE');

    const pdfOver = Buffer.concat([PDF_BYTES, Buffer.alloc(DOCUMENT_MAX_BYTES)]);
    await rejectsWith(pdfOver, 'a.pdf', 'FILE_TOO_LARGE');
    const csvOver = Buffer.alloc(DATA_MAX_BYTES + 1, 0x61);
    await rejectsWith(csvOver, 'a.csv', 'FILE_TOO_LARGE');
  });

  it('keeps the transport ceiling at the largest per-type limit', () => {
    assert.equal(MEDIA_TRANSPORT_MAX_BYTES, DOCUMENT_MAX_BYTES);
    assert.ok(PHOTO_MAX_BYTES < DATA_MAX_BYTES && DATA_MAX_BYTES < DOCUMENT_MAX_BYTES);
  });
});

describe('inspectOoxmlArchive', () => {
  it('reports required entries and flags macros without extracting anything', async () => {
    const file = await stage(buildDocx([{ name: 'word/vbaProject.bin', data: 'x' }]));
    const result = await inspectOoxmlArchive(file);
    assert.equal(result.hasWordDocument, true);
    assert.equal(result.hasWorkbook, false);
    assert.equal(result.hasContentTypes, true);
    assert.equal(result.hasVbaProject, true);
  });

  it('is time-boxed: a spent budget fails with INVALID_ARCHIVE instead of hanging', async () => {
    const file = await stage(buildDocx());
    await assert.rejects(
      () => inspectOoxmlArchive(file, 0),
      (error: unknown) => error instanceof MediaValidationError && error.code === 'INVALID_ARCHIVE',
    );
  });
});

describe('CSV formula-injection scan', () => {
  const rejected: Array<[string, string]> = [
    ['=HYPERLINK', 'a,b\n1,=HYPERLINK("http://evil.example","x")\n'],
    ['+cmd', "a,b\n+cmd|' /C calc'!A0,2\n"],
    ['@SUM', '@SUM(A1:A9),x\n'],
    ['-cmd pipe', "a\n-cmd|' /C calc'!A0\n"],
    ['formula in quoted field', 'a,b\n1,"=1+1"\n'],
    ['formula after escaped quote cell', 'a,b\n"say ""hi""",=2+2\n'],
    ['formula on a quoted multi-line row', 'a,b\n"line1\nline2",@x\n'],
    ['leading tab', 'a,b\n1,\t=1+1\n'],
    ['leading CR inside quotes', 'a,b\n1,"\r=1+1"\n'],
    ['minus then text', 'a\n-5abc\n'],
    ['plain "-" alone', 'a\n-\n'],
    ['formula in the last cell without newline', 'a,b\n1,=1+1'],
    ['semicolon =HYPERLINK', 'a;=HYPERLINK("x")'],
    ['tab =1+1', 'a\t=1+1'],
    ['comma then tab =1+1', 'a,\t=1+1'],
    ['semicolon quoted formula', 'a;"=1+1"'],
    ['semicolon +cmd', 'a;+cmd|x'],
    ['semicolon @SUM', 'a;@SUM(1)'],
    ['=1+1 cell', 'a\n=1+1\n'],
    ['@SUM(A1)', 'a\n@SUM(A1)\n'],
    ['+SUM(A1)', 'a\n+SUM(A1)\n'],
    ['-1+1 expression', 'a\n-1+1\n'],
    ['-2+3 expression', 'a,b\n-2+3,x\n'],
    ['+ then paren', 'a\n+(1)\n'],
    ['+cmd pipe with quote', "a\n+cmd|' /C calc'!A0\n"],
    ['digit then equals sign', 'a,b\n1,-5=1\n'],
  ];
  const accepted: Array<[string, string]> = [
    ['negative integer', 'a,b\n-5,2\n'],
    ['plus decimal', 'a,b\n+3.2,x\n'],
    ['comma decimal in quotes', 'a,b\n"-0,5",x\n'],
    ['exponent', 'a\n-1e-3\n'],
    ['plain number', 'a,b\n3.2,4\n'],
    ['quoted comma', 'a,b\n"a,b",c\n'],
    ['plain text', 'rt,nama\n1,Budi\n2,Siti\n'],
    ['apostrophe-prefixed formula', "a,b\n'=1+1,'@x\n"],
    ['formula chars mid-cell', 'a,b\nx=1,y+2\na-b,c@d\n'],
    ['empty cells and CRLF', 'a,b,c\r\n1,,\r\n\r\n,2,\r\n'],
    [
      'escaped quotes and embedded newline',
      'a,b\n"say ""=hi""\n=not a formula, it is inside quotes",x\n',
    ],
    ['CRLF number', 'a\r\n-5\r\n'],
    ['semicolon negative and decimal', 'a;-5;+3,5'],
    ['international phone number', 'a,b\n+62 812-3456-7890,x\n'],
    ['negative percent', 'a\n-5%\n'],
    ['negative thousands with decimal comma', 'a\n-1.234,56\n'],
    ['negative with a space after the sign', 'a\n- 5\n'],
    ['semicolon plain text with newline', 'nama;rt\nBudi;12'],
  ];

  for (const [name, text] of rejected) {
    it(`rejects: ${name}`, async () => {
      await rejectsWith(Buffer.from(text), 'x.csv', 'CSV_FORMULA');
    });
  }

  it('tells the editor to prefix the value with an apostrophe, in Indonesian', async () => {
    await assert.rejects(
      async () => validateStagedFile(await stage(Buffer.from('a\n=1+1\n')), 'x.csv'),
      (error: unknown) =>
        error instanceof MediaValidationError &&
        error.statusCode === 415 &&
        /tanda petik tunggal/.test(error.message),
    );
  });

  for (const [name, text] of accepted) {
    it(`accepts: ${name}`, async () => {
      const detected = await validateStagedFile(await stage(Buffer.from(text)), 'x.csv');
      assert.equal(detected.typeKey, 'csv');
    });
  }

  it('gives the same verdict whatever the chunk size (cells split across chunk boundaries)', async () => {
    const corpus = [...rejected, ...accepted].map(([name, text]) => [
      name,
      Buffer.from(`\ufeff${text}`, 'utf8'),
    ]) as Array<[string, Buffer]>;
    corpus.push(['multibyte', Buffer.from('nama\nSiti Ñandú 日本語\n"é,ü",=x\n', 'utf8')]);
    for (const [name, bytes] of corpus) {
      const file = await stage(bytes);
      const whole = await scanCsvFile(file, 1 << 20);
      for (const chunk of [1, 2, 3, 5, 7]) {
        assert.deepEqual(await scanCsvFile(file, chunk), whole, `${name} @ chunk ${chunk}`);
      }
    }
  });

  it('keeps UTF-8 strictness across a split multi-byte sequence', async () => {
    const valid = await stage(Buffer.from('a\nÑ日\n'));
    assert.deepEqual(await scanCsvFile(valid, 1), { ok: true });
    const broken = await stage(Buffer.from([0x61, 0x0a, 0xe6, 0x97]));
    assert.deepEqual(await scanCsvFile(broken, 1), { ok: false, reason: 'binary' });
  });

  it('streams a large CSV without loading it whole', async () => {
    const row = 'rt,nama,jumlah\n';
    const body = Buffer.from(row + '1,Budi,-5\n'.repeat(200_000));
    const file = await stage(body);
    assert.deepEqual(await scanCsvFile(file), { ok: true });
  });

  it('propagates stream read errors instead of masking them as binary', async () => {
    await assert.rejects(
      async () => scanCsvFile(dir),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error instanceof MediaValidationError, false);
        return true;
      },
    );
  });
});

describe('processPhoto filesystem write errors', () => {
  it('rethrows raw filesystem error when output path is unwritable instead of INVALID_IMAGE', async () => {
    const valid = await stage(await makeImage('jpeg', 200, 200));
    const unwritableOutput = path.join(dir, 'non-existent-dir', 'out.webp');
    const thumb = path.join(dir, 'thumb.webp');
    await assert.rejects(
      async () => processPhoto(valid, unwritableOutput, thumb),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error instanceof MediaValidationError, false);
        assert.equal((error as { code?: string }).code, 'ENOENT');
        return true;
      },
    );
  });
});
