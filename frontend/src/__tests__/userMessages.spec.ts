import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CSRF_INVALID_MESSAGE,
  classifyFailure,
  CSV_FORMAT_MESSAGE,
  HIDDEN_API_TOKENS,
  INPUT_MISMATCH_MESSAGE,
  NETWORK_ERROR_CODE,
  PREVIOUS_PAIR_MESSAGE,
  PREVIOUS_REQUIRED_MESSAGE,
  RT_CONFLICT_MESSAGE,
  sanitizeFieldErrors,
  SESSION_EXPIRED_MESSAGE,
  SESSION_EXPIRED_NEUTRAL_MESSAGE,
  STALE_WRITE_NEUTRAL_MESSAGE,
  toUserMessage,
  UNKNOWN_FIELD_MESSAGE,
  USER_MESSAGES,
} from '../utils/userMessages';

/** Stands in for an ApiError: an Error that carries an HTTP status. */
function httpFailure(status: number, rawMessage = 'SQLSTATE[23000]: Duplicate entry'): Error {
  return Object.assign(new Error(rawMessage), { status });
}

/** Server text and internals that must never reach a banner, whatever the status. */
const RAW_SERVER_TEXT = [
  'Label sudah dipakai',
  'SQLSTATE[23000]: Duplicate entry',
  'Prisma P2002 unique constraint failed',
  'Token tidak valid',
  'Request failed with status code 500',
  'Failed to fetch',
  'TypeError: x is not a function',
];

describe('toUserMessage mappings', () => {
  it('maps a network failure to the offline wording', () => {
    const { message, kind, status } = toUserMessage(
      Object.assign(new Error('Failed to fetch'), { code: NETWORK_ERROR_CODE, status: 0 }),
    );

    expect(kind).toBe('network');
    expect(status).toBe(0);
    expect(message).toBe('Perubahan belum tersimpan. Periksa koneksi lalu coba lagi.');
  });

  it('maps a raw fetch() rejection (TypeError) to the offline wording', () => {
    expect(toUserMessage(new TypeError('Failed to fetch')).kind).toBe('network');
    expect(
      toUserMessage(new TypeError('NetworkError when attempting to fetch resource.')).kind,
    ).toBe('network');
  });

  it('keeps the session-ended wording for 401 form writes', () => {
    const result = toUserMessage(httpFailure(401));

    expect(result.kind).toBe('session');
    expect(result.message).toBe(SESSION_EXPIRED_MESSAGE);
    expect(toUserMessage(httpFailure(401), 'menyimpan profil', 'POST').message).toBe(
      `Gagal menyimpan profil. ${SESSION_EXPIRED_MESSAGE}`,
    );
  });

  it('uses neutral session wording for 401 on reads, deletes, or reordering', () => {
    expect(toUserMessage(httpFailure(401), undefined, 'GET').message).toBe(
      SESSION_EXPIRED_NEUTRAL_MESSAGE,
    );
    expect(toUserMessage(httpFailure(401), undefined, 'DELETE').message).toBe(
      SESSION_EXPIRED_NEUTRAL_MESSAGE,
    );
    expect(toUserMessage(httpFailure(401), 'menghapus pengguna').message).toBe(
      `Gagal menghapus pengguna. ${SESSION_EXPIRED_NEUTRAL_MESSAGE}`,
    );
    expect(toUserMessage(httpFailure(401), 'mengurutkan halaman').message).toBe(
      `Gagal mengurutkan halaman. ${SESSION_EXPIRED_NEUTRAL_MESSAGE}`,
    );
  });

  it('maps 403 to the permission wording', () => {
    expect(toUserMessage(httpFailure(403)).message).toBe(
      'Anda tidak memiliki izin untuk tindakan ini.',
    );
  });

  it('maps 403 with EBADCSRFTOKEN code to CSRF_INVALID_MESSAGE', () => {
    const error = Object.assign(httpFailure(403), { code: 'EBADCSRFTOKEN' });
    expect(toUserMessage(error).message).toBe(CSRF_INVALID_MESSAGE);
  });

  it('maps 403 with CSRF in serverMessage to CSRF_INVALID_MESSAGE', () => {
    const error = Object.assign(httpFailure(403), {
      serverMessage: 'CSRF token tidak valid',
    });
    expect(toUserMessage(error).message).toBe(CSRF_INVALID_MESSAGE);
  });

  it('maps 403 with CSRF in error message to CSRF_INVALID_MESSAGE', () => {
    const error = httpFailure(403, 'CSRF token tidak valid');
    expect(toUserMessage(error).message).toBe(CSRF_INVALID_MESSAGE);
  });

  it('maps 404 to the not-found wording', () => {
    expect(toUserMessage(httpFailure(404)).message).toBe(
      'Data yang dicari tidak ditemukan. Muat ulang halaman.',
    );
  });

  it('maps a plain 409 to the neutral data-conflict wording', () => {
    expect(toUserMessage(httpFailure(409)).message).toBe(
      'Tindakan tidak dapat dilakukan karena data ini bentrok dengan data lain yang sudah ada atau masih dipakai. Periksa kembali, lalu coba lagi.',
    );
  });

  it('maps a 409 with a stale-write code to the concurrent-edit wording', () => {
    const error = Object.assign(httpFailure(409), { code: 'STALE_WRITE' });
    const result = toUserMessage(error);

    expect(result.kind).toBe('stale');
    expect(result.message).toBe(
      'Data ini baru saja diubah oleh orang lain. Muat ulang untuk melihat versi terbaru; isian Anda tetap tersimpan di formulir.',
    );
  });

  it('uses neutral stale-write wording for 409 STALE_WRITE on deletes or reordering', () => {
    const error = Object.assign(httpFailure(409), { code: 'STALE_WRITE' });
    expect(toUserMessage(error, undefined, 'DELETE').message).toBe(STALE_WRITE_NEUTRAL_MESSAGE);
    expect(toUserMessage(error, 'menghapus pengguna').message).toBe(
      `Gagal menghapus pengguna. ${STALE_WRITE_NEUTRAL_MESSAGE}`,
    );
    expect(toUserMessage(error, 'mengurutkan halaman', 'PUT').message).toBe(
      `Gagal mengurutkan halaman. ${STALE_WRITE_NEUTRAL_MESSAGE}`,
    );
  });

  it('does not use the concurrent-edit wording for a duplicate-value 409', () => {
    const error = Object.assign(httpFailure(409, 'Email ini sudah dipakai'), {
      code: 'DUPLICATE_EMAIL',
    });

    expect(toUserMessage(error).kind).toBe('conflict');
    expect(toUserMessage(error).message).not.toContain('diubah oleh orang lain');
  });

  it('maps 413 to the too-much-content wording', () => {
    expect(toUserMessage(httpFailure(413)).message).toBe(
      'Isi yang dikirim terlalu besar. Persingkat teks atau kurangi jumlah baris.',
    );
  });

  it('maps 400 and 422 to the validation wording', () => {
    expect(toUserMessage(httpFailure(400)).message).toBe('Periksa kembali isian yang ditandai.');
    expect(toUserMessage(httpFailure(422)).message).toBe('Periksa kembali isian yang ditandai.');
  });

  it('shows the server sentence for a 400/422 that has no field map', () => {
    const error = Object.assign(httpFailure(400), {
      serverMessage: 'Judul halaman tidak boleh memuat HTML.',
    });

    expect(toUserMessage(error).message).toBe('Judul halaman tidak boleh memuat HTML.');
    expect(toUserMessage(error, 'menambah halaman').message).toBe(
      'Gagal menambah halaman. Judul halaman tidak boleh memuat HTML.',
    );
    expect(toUserMessage(Object.assign(error, { status: 422 })).kind).toBe('validation');
  });

  it('never shows an API field name: template attach refusals get approved wording', () => {
    const attach = Object.assign(httpFailure(400), {
      serverMessage:
        'Template perbandingan membutuhkan value_previous dan period_previous (nilai dan periode tahun lalu). Lepaskan template (comparisonTemplateId: null) jika indikator ini bukan perbandingan berpasangan.',
    });
    const notComputed = Object.assign(httpFailure(400), {
      serverMessage:
        'Template perbandingan hanya dapat dipakai pada indikator perbandingan terkomputasi (isComputedComparison: true).',
    });
    const expected =
      'Gagal menyimpan perubahan indikator. Templat kalimat hanya bisa dipakai pada indikator yang memiliki nilai dan periode sebelumnya.';

    expect(toUserMessage(attach, 'menyimpan perubahan indikator').message).toBe(expected);
    expect(toUserMessage(notComputed, 'menyimpan perubahan indikator').message).toBe(expected);
    expect(expected).not.toMatch(/comparisonTemplateId|_previous|isComputed/);
  });

  it('shows legitimate mixed-case and underscore text unchanged', () => {
    for (const text of [
      'Daya 450 kWh tidak valid.',
      'Nomor eKTP wajib diisi.',
      'Gunakan perangkat iOS terbaru.',
      'Tekanan 120 mmHg terlalu tinggi.',
      'Hubungi info_kelurahan@manggar.id untuk bantuan.',
      'Lihat https://example.id/data_publik/fileName.pdf untuk rincian.',
      'Template perbandingan tidak ditemukan.',
    ]) {
      const error = Object.assign(httpFailure(400), { serverMessage: text });
      expect(toUserMessage(error).message).toBe(text);
    }
  });

  it('hides a sentence that names any denylisted API token', () => {
    for (const token of HIDDEN_API_TOKENS) {
      const error = Object.assign(httpFailure(400), {
        serverMessage: `Kolom ${token} tidak valid.`,
      });
      expect(toUserMessage(error).message).toBe('Periksa kembali isian yang ditandai.');
    }
  });

  it('shows a ketua_rt sentence with friendly terms', () => {
    const error = Object.assign(httpFailure(400), {
      serverMessage: 'Titik ketua_rt "A" harus mencakup tepat satu RT.',
    });
    expect(toUserMessage(error).message).toBe('Titik Ketua RT "A" harus mencakup tepat satu RT.');
  });

  it('maps the previous value/period pair message to approved wording', () => {
    const error = Object.assign(httpFailure(400), {
      serverMessage:
        'value_previous dan period_previous harus diisi berpasangan (keduanya ada atau keduanya kosong).',
    });
    expect(toUserMessage(error).message).toBe(PREVIOUS_PAIR_MESSAGE);
  });

  it('does not relabel an unrelated template sentence that names a token', () => {
    const error = Object.assign(httpFailure(400), {
      serverMessage: 'comparisonTemplateId maksimal 191 karakter',
    });
    expect(toUserMessage(error).message).toBe('Periksa kembali isian yang ditandai.');
  });

  it('never shows an API-looking or English-default sentence from any real backend literal', () => {
    // Independent of HIDDEN_API_TOKENS on purpose: removing a token from the denylist must make
    // this scan fail, not silently stay green.
    const structural =
      /\b[a-z]+[A-Z]\w*\b|\b[a-z]+_[a-z_]+\b|\b(?:Invalid|Unrecognized|Too (?:big|small))\b|\breceived (?:undefined|null|number|string|object|array|boolean)\b/;
    // Reviewed allowlist of legitimate mixed-case terms and non-sentence shapes.
    const allowed = [
      /\bkWh\b|\beKTP\b|\biOS\b|\bmmHg\b|\bWhatsApp\b|\bphoneIsWhatsapp\b/g, // units, acronyms, brand
      /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, // e-mail addresses
      /https?:\/\/\S+/g, // URLs
    ];
    const root = join(__dirname, '../../../backend/src');
    const literal = /'([^'\n]{12,})'|"([^"\n]{12,})"|`([^`\n]{12,})`/g;
    let checked = 0;
    for (const dir of ['services', 'controllers', 'middlewares', 'utils']) {
      for (const file of readdirSync(join(root, dir)).filter((f) => f.endsWith('.ts'))) {
        // Block comments (JSDoc) hold prose and code spans, never client-visible messages.
        const source = readFileSync(join(root, dir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        for (const match of source.matchAll(literal)) {
          const raw = match[1] ?? match[2] ?? match[3] ?? '';
          const text = raw.replace(/\$\{[^}]*\}/g, 'X');
          if (text.length < 12 || !/ /.test(text)) continue;
          // Not messages: seed template bodies ("{delta}"), regex-paired code fragments (they
          // start or end mid-expression) and developer-only errors thrown for programmer
          // mistakes, which never travel as a 400 (`name: ...` prefix or English internals).
          if (/[{}]/.test(text) || /^[\s,)?&|]|[\s(=!]$/.test(text)) continue;
          // Raw SQL (column aliases are camelCase by design) is never sent to a client as a message.
          if (/^(?:SELECT|INSERT|UPDATE|DELETE)\b.*\b(?:FROM|INTO|SET)\b/.test(text)) continue;
          if (
            /^(?:withTimeoutFallback|formatDecimalId|executeLockedTransaction):|^ttlMs /.test(text)
          )
            continue;
          const error = Object.assign(httpFailure(400), { serverMessage: text });
          const shown = toUserMessage(error).message;
          if (shown === USER_MESSAGES.validation) continue;
          checked += 1;
          const scrubbed = allowed.reduce((acc, pattern) => acc.replace(pattern, ''), shown);
          expect(scrubbed, `${file}: ${text}`).not.toMatch(structural);
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('hides zod default English text and shows approved wording for known shapes', () => {
    const fallback = USER_MESSAGES.validation;
    const hidden = [
      'Invalid input: expected string, received number',
      'Invalid input',
      'Too big: expected string to have <=191 characters',
      'Too small: expected array to have >=1 items',
      'Invalid option: expected one of "age_pyramid"|"ethnicity"',
      'Required',
      'Judul: Expected string, received undefined',
    ];
    for (const serverMessage of hidden) {
      const error = Object.assign(httpFailure(422), { serverMessage });
      expect([serverMessage, toUserMessage(error).message]).toEqual([serverMessage, fallback]);
    }
    const joined = Object.assign(httpFailure(400), {
      serverMessage:
        'Validasi metadata gagal: Invalid input: expected string, received number, Invalid input: expected string, received undefined',
    });
    expect(toUserMessage(joined).message).toBe(INPUT_MISMATCH_MESSAGE);
  });

  it('filters Zod v4 English messages with table-driven cases', () => {
    const fallback = USER_MESSAGES.validation;
    const zodV4Cases = [
      'Invalid email address',
      'Invalid uuid',
      'Invalid date',
      'Invalid nanoid',
      'Invalid literal value',
      'String must contain at least 1 character(s)',
      'String must contain at most 191 character(s)',
      'Number must be greater than 0',
      'Number must be less than or equal to 100',
      'Array must contain at least 1 element(s)',
      'Array must contain at most 10 element(s)',
    ];
    for (const serverMessage of zodV4Cases) {
      const error = Object.assign(httpFailure(400), { serverMessage });
      expect([serverMessage, toUserMessage(error).message]).toEqual([serverMessage, fallback]);
    }
  });

  it('strips quoted UUIDs and cuids from readable server messages', () => {
    const cases = [
      {
        input: 'Titik "123e4567-e89b-12d3-a456-426614174000" tidak ditemukan.',
        expected: 'Titik tidak ditemukan.',
      },
      {
        input: 'Titik "123E4567-E89B-12D3-A456-426614174000" tidak ditemukan.',
        expected: 'Titik tidak ditemukan.',
      },
      {
        input: 'Data "ckl12345678901234567890" berhasil dihapus.',
        expected: 'Data berhasil dihapus.',
      },
      {
        input: 'RT "01" pada titik "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d" telah diperbarui.',
        expected: 'RT "01" pada titik telah diperbarui.',
      },
    ];
    for (const { input, expected } of cases) {
      const error = Object.assign(httpFailure(400), { serverMessage: input });
      expect([input, toUserMessage(error).message]).toEqual([input, expected]);
    }
  });

  it('shows ordinary Indonesian validation sentences untouched', () => {
    for (const text of [
      'Wajib diisi.',
      'Format tidak valid.',
      'Nilai terlalu besar.',
      'Judul harus diisi.',
    ]) {
      const error = Object.assign(httpFailure(400), { serverMessage: text });
      expect(toUserMessage(error).message).toBe(text);
    }
  });

  it('maps echoed-key sentences to one approved wording', () => {
    for (const serverMessage of [
      'Unrecognized key: "badge"',
      'Unrecognized keys: "a", "b"',
      'Terdapat bidang pengaturan yang tidak dikenali: "secret_flag"',
      'Terdapat bidang koordinat yang tidak dikenali: "lat_x"',
      'Terdapat bidang pengaturan retensi yang tidak dikenali: "purge_all"',
      'Terdapat bidang pengaturan cuaca yang tidak dikenali: "radar"',
      'Terdapat bidang yang tidak dikenali: "extra"',
    ]) {
      const error = Object.assign(httpFailure(400), { serverMessage });
      expect([serverMessage, toUserMessage(error).message]).toEqual([
        serverMessage,
        UNKNOWN_FIELD_MESSAGE,
      ]);
    }
  });

  it('does not swallow unrecognized value messages such as unknown role', () => {
    const serverMessage = 'Peran tidak dikenali. Gunakan "admin" atau "editor".';
    const error = Object.assign(httpFailure(400), { serverMessage });
    expect(toUserMessage(error).message).toBe(serverMessage);
  });

  it('maps the computed-comparison and CSV header sentences to approved wording', () => {
    const cases: Array<[string, string]> = [
      [
        'Indikator perbandingan terkomputasi membutuhkan value_previous (nilai tahun lalu).',
        PREVIOUS_REQUIRED_MESSAGE,
      ],
      [
        'Indikator perbandingan terkomputasi membutuhkan period_previous (periode tahun lalu).',
        PREVIOUS_REQUIRED_MESSAGE,
      ],
      ['Header CSV harus: rtNumber,name,phone', CSV_FORMAT_MESSAGE],
    ];
    for (const [serverMessage, expected] of cases) {
      const error = Object.assign(httpFailure(400), { serverMessage });
      expect(toUserMessage(error).message).toBe(expected);
    }
  });

  it('catches compound, cased and plural spellings of denylisted names', () => {
    for (const token of [
      'foo_rowKey',
      'RowKey',
      'rowKeys',
      'sectionIds',
      'Rt_Number',
      'point_ids',
      'row-key',
    ]) {
      const error = Object.assign(httpFailure(400), { serverMessage: `Kolom ${token} salah.` });
      expect([token, toUserMessage(error).message]).toEqual([token, USER_MESSAGES.validation]);
    }
  });

  it('strips raw point ids and maps the RT invariant sentence', () => {
    const id = 'cm1abcdefghijklmnopqrstuv';
    const point = Object.assign(httpFailure(400), {
      serverMessage: `Titik ketua_rt "${id}" harus mencakup tepat satu RT.`,
    });
    expect(toUserMessage(point).message).toBe('Titik Ketua RT harus mencakup tepat satu RT.');
    const invariant = Object.assign(httpFailure(400), {
      serverMessage: 'Invariant ketua_rt/RT dilanggar.',
    });
    expect(toUserMessage(invariant).message).toBe(RT_CONFLICT_MESSAGE);
  });

  it('leaves URLs and code containing enum values untouched', () => {
    for (const text of [
      'Lihat https://x.id/ketua_rt/1 untuk rincian.',
      'Gunakan `ketua_rt` persis.',
      'Berkas ketua_rt.csv tidak valid.',
      'Folder bank_sampah-data salah.',
    ]) {
      const error = Object.assign(httpFailure(400), { serverMessage: text });
      expect([text, toUserMessage(error).message]).toEqual([text, text]);
    }
  });

  it('falls back to the general text for any other sentence that names a field key', () => {
    const error = Object.assign(httpFailure(400), {
      serverMessage: 'Field sortOrder harus berupa angka.',
    });

    expect(toUserMessage(error).message).toBe('Periksa kembali isian yang ditandai.');
  });

  it('prefers the general text when a validation failure carries a field map', () => {
    const error = Object.assign(httpFailure(422), {
      serverMessage: 'Validasi gagal',
      fieldErrors: { label: 'Label wajib diisi' },
    });

    expect(toUserMessage(error).message).toBe('Periksa kembali isian yang ditandai.');
  });

  it('falls back to the general text for an empty or oversized server sentence', () => {
    for (const serverMessage of ['', '   ', 'x'.repeat(301), 42]) {
      const error = Object.assign(httpFailure(400), { serverMessage });
      expect(toUserMessage(error).message).toBe('Periksa kembali isian yang ditandai.');
    }
  });

  it('never shows a server sentence for statuses other than 400/422', () => {
    for (const status of [401, 403, 404, 409, 413, 429, 500, 502, 503]) {
      const error = Object.assign(httpFailure(status), {
        serverMessage: 'SQLSTATE[23000]: Duplicate entry at Object.<anonymous> (stack)',
      });
      expect(toUserMessage(error).message).not.toContain('SQLSTATE');
    }
  });

  it('words network and server failures neutrally for reads', () => {
    const net = (method: string) =>
      Object.assign(new Error('x'), { code: NETWORK_ERROR_CODE, status: 0, method });

    expect(toUserMessage(net('GET')).message).toBe(
      'Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.',
    );
    expect(toUserMessage(net('HEAD')).message).not.toContain('belum tersimpan');
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(toUserMessage(net(method)).message).toBe(USER_MESSAGES.network);
    }
    expect(toUserMessage(Object.assign(httpFailure(500), { method: 'GET' })).message).toBe(
      'Terjadi kendala di server. Coba lagi beberapa saat lagi.',
    );
    expect(toUserMessage(Object.assign(httpFailure(500), { method: 'PATCH' })).message).toBe(
      USER_MESSAGES.server,
    );
  });

  it('uses the caller-supplied method when a raw fetch rejection carries none', () => {
    const rejection = new TypeError('Failed to fetch');

    expect(toUserMessage(rejection, 'memuat halaman', 'GET').message).toBe(
      'Gagal memuat halaman. Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.',
    );
    expect(toUserMessage(rejection, 'menyimpan halaman').message).toBe(
      `Gagal menyimpan halaman. ${USER_MESSAGES.network}`,
    );
  });

  it('maps 429 to the rate-limit wording', () => {
    expect(toUserMessage(httpFailure(429)).message).toBe(
      'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.',
    );
  });

  it('maps 5xx to the server wording', () => {
    const expected =
      'Terjadi kendala di server. Perubahan belum tersimpan. Coba lagi beberapa saat lagi.';

    expect(toUserMessage(httpFailure(500)).message).toBe(expected);
    expect(toUserMessage(httpFailure(503)).message).toBe(expected);
    expect(toUserMessage(httpFailure(503)).kind).toBe('server');
  });

  it('falls back to the server wording for an unknown error', () => {
    const cases: unknown[] = [
      new Error('boom: SELECT * FROM users'),
      'plain string failure',
      null,
      undefined,
      { message: 'no status here' },
      httpFailure(418),
    ];

    for (const error of cases) {
      const result = toUserMessage(error);
      expect(result.kind).toBe('unknown');
      expect(result.message).toBe(USER_MESSAGES.server);
    }
  });

  it('never puts raw server text into the message', () => {
    const failures: unknown[] = [
      httpFailure(400, 'Label sudah dipakai'),
      httpFailure(401, 'Token tidak valid'),
      httpFailure(403, 'SQLSTATE[23000]: Duplicate entry'),
      httpFailure(404, 'Prisma P2002 unique constraint failed'),
      httpFailure(409, 'Label sudah dipakai'),
      httpFailure(413, 'Token tidak valid'),
      httpFailure(422, 'Label sudah dipakai'),
      httpFailure(429, 'Request failed with status code 500'),
      httpFailure(500, 'SQLSTATE[23000]: Duplicate entry'),
      new Error('TypeError: x is not a function'),
      new TypeError('Failed to fetch'),
    ];

    for (const error of failures) {
      const { message } = toUserMessage(error, 'menyimpan indikator');
      for (const raw of RAW_SERVER_TEXT) {
        expect(message).not.toContain(raw);
      }
    }
  });
});

describe('toUserMessage context phrase', () => {
  it('prefixes the approved text with the action context', () => {
    expect(toUserMessage(httpFailure(500), 'menyimpan indikator').message).toBe(
      'Gagal menyimpan indikator. Terjadi kendala di server. Perubahan belum tersimpan. Coba lagi beberapa saat lagi.',
    );
  });

  it('drops a trailing period in the context so the sentence is not doubled', () => {
    expect(toUserMessage(httpFailure(403), 'menghapus tabel.').message).toBe(
      'Gagal menghapus tabel. Anda tidak memiliki izin untuk tindakan ini.',
    );
  });

  it('ignores a blank context', () => {
    expect(toUserMessage(httpFailure(404), '   ').message).toBe(USER_MESSAGES.not_found);
  });
});

describe('toUserMessage field-level errors', () => {
  it('returns the server field map for a validation failure', () => {
    const error = Object.assign(httpFailure(422, 'Validasi gagal'), {
      fieldErrors: { label: 'Label wajib diisi', value: 'Angka tidak valid' },
    });

    const result = toUserMessage(error);

    expect(result.message).toBe('Periksa kembali isian yang ditandai.');
    expect(result.fieldErrors).toEqual({
      label: 'Label wajib diisi',
      value: 'Angka tidak valid',
    });
  });

  it('does not expose field errors for non-validation failures', () => {
    const error = Object.assign(httpFailure(409), {
      fieldErrors: { label: 'Label sudah dipakai' },
    });

    expect(toUserMessage(error).fieldErrors).toEqual({});
  });

  it('returns an empty map when the server sent no field map', () => {
    expect(toUserMessage(httpFailure(400)).fieldErrors).toEqual({});
  });

  it('sanitizes the field map', () => {
    expect(
      sanitizeFieldErrors({
        label: 'Label wajib diisi',
        tags: ['Pertama', 42],
        empty: '   ',
        count: 7,
        nothing: [],
      }),
    ).toEqual({ label: 'Label wajib diisi', tags: 'Pertama' });
  });

  it('drops prototype-polluting keys and non-object maps', () => {
    const hostile = JSON.parse('{"__proto__": "x", "label": "Label wajib diisi"}');

    expect(sanitizeFieldErrors(hostile)).toEqual({ label: 'Label wajib diisi' });
    expect(sanitizeFieldErrors(['not', 'a', 'map'])).toEqual({});
    expect(sanitizeFieldErrors('text')).toEqual({});
    expect(sanitizeFieldErrors(null)).toEqual({});
    expect(({} as Record<string, unknown>).__proto__).toBe(Object.prototype);
  });
});

describe('classifyFailure', () => {
  it('keeps the original HTTP status available for programmatic handling', () => {
    expect(classifyFailure(httpFailure(409))).toEqual({ kind: 'conflict', status: 409 });
    expect(classifyFailure(Object.assign(httpFailure(409), { code: 'STALE_WRITE' }))).toEqual({
      kind: 'stale',
      status: 409,
    });
    expect(classifyFailure(httpFailure(422))).toEqual({ kind: 'validation', status: 422 });
  });

  it('reports a null status when none was attached', () => {
    expect(classifyFailure(new Error('no status'))).toEqual({ kind: 'unknown', status: null });
  });
});
