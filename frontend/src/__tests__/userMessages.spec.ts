import { describe, expect, it } from 'vitest';
import {
  classifyFailure,
  NETWORK_ERROR_CODE,
  sanitizeFieldErrors,
  SESSION_EXPIRED_MESSAGE,
  toUserMessage,
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

  it('keeps the session-ended wording for 401', () => {
    const result = toUserMessage(httpFailure(401));

    expect(result.kind).toBe('session');
    expect(result.message).toBe(SESSION_EXPIRED_MESSAGE);
  });

  it('maps 403 to the permission wording', () => {
    expect(toUserMessage(httpFailure(403)).message).toBe(
      'Anda tidak memiliki izin untuk tindakan ini.',
    );
  });

  it('maps 404 to the not-found wording', () => {
    expect(toUserMessage(httpFailure(404)).message).toBe(
      'Data yang dicari tidak ditemukan. Muat ulang halaman.',
    );
  });

  it('maps a plain 409 to the neutral data-conflict wording', () => {
    expect(toUserMessage(httpFailure(409)).message).toBe(
      'Perubahan belum tersimpan karena bentrok dengan data yang sudah ada. Periksa kembali isian Anda, lalu coba lagi.',
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

  it('does not use the concurrent-edit wording for a duplicate-value 409', () => {
    const error = Object.assign(httpFailure(409, 'Email ini sudah dipakai'), {
      code: 'DUPLICATE_EMAIL',
    });

    expect(toUserMessage(error).kind).toBe('conflict');
    expect(toUserMessage(error).message).not.toContain('diubah oleh orang lain');
  });

  it('maps 413 to the file-size wording', () => {
    expect(toUserMessage(httpFailure(413)).message).toBe('Berkas terlalu besar.');
  });

  it('maps 400 and 422 to the validation wording', () => {
    expect(toUserMessage(httpFailure(400)).message).toBe('Periksa kembali isian yang ditandai.');
    expect(toUserMessage(httpFailure(422)).message).toBe('Periksa kembali isian yang ditandai.');
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
    expect(
      classifyFailure(Object.assign(httpFailure(409), { code: 'STALE_WRITE' })),
    ).toEqual({ kind: 'stale', status: 409 });
    expect(classifyFailure(httpFailure(422))).toEqual({ kind: 'validation', status: 422 });
  });

  it('reports a null status when none was attached', () => {
    expect(classifyFailure(new Error('no status'))).toEqual({ kind: 'unknown', status: null });
  });
});
