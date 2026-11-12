import { describe, expect, it } from 'vitest';
import { ApiError } from '../utils/apiClient';
import { ceritaFailure, dependentsMessage } from '../utils/ceritaAdminMessages';

describe('dependentsMessage', () => {
  it('lists what still blocks the delete in plain words', () => {
    const message = dependentsMessage('Bab', {
      contentBlocks: 2,
      indicators: 1,
      indicatorTables: 3,
    });
    expect(message).toBe(
      'Bab ini belum bisa dihapus karena masih berisi 2 paragraf atau gambar, 1 angka indikator dan 3 tabel. Hapus atau pindahkan isi tersebut terlebih dahulu.',
    );
  });

  it('skips the counts that are zero and falls back when none are known', () => {
    expect(
      dependentsMessage('Bagian', { contentBlocks: 0, indicators: 0, indicatorTables: 1 }),
    ).toContain('masih berisi 1 tabel.');
    expect(dependentsMessage('Halaman', null)).toContain('paragraf, gambar, angka, atau tabel');
  });
});

describe('ceritaFailure', () => {
  it('turns HAS_DEPENDENTS into the dependency sentence and marks it blocked', () => {
    const error = new ApiError('Halaman tidak dapat dihapus (blok konten: 2)', 409, {
      code: 'HAS_DEPENDENTS',
      body: { details: { dependencies: { contentBlocks: 2, indicators: 0, indicatorTables: 0 } } },
      method: 'DELETE',
    });
    const failure = ceritaFailure(error, 'menghapus halaman', { subject: 'Halaman' });
    expect(failure.blocked).toBe(true);
    expect(failure.stale).toBe(false);
    expect(failure.message).toContain('Halaman ini belum bisa dihapus');
    expect(failure.message).toContain('2 paragraf atau gambar');
    expect(failure.message).not.toMatch(/blok konten:|HAS_DEPENDENTS|409/);
  });

  it('marks a stale write and uses the neutral wording for a delete or reorder', () => {
    const stale = new ApiError('x', 409, { code: 'STALE_WRITE', method: 'PUT' });
    const failure = ceritaFailure(stale, 'mengurutkan bab');
    expect(failure.stale).toBe(true);
    expect(failure.message).toContain('Muat ulang');
    expect(failure.message).not.toContain('isian Anda');
  });

  it('keeps the form-draft wording for a save', () => {
    const stale = new ApiError('x', 409, { code: 'STALE_WRITE', method: 'PATCH' });
    expect(ceritaFailure(stale, 'mengubah judul bab').message).toContain('isian Anda');
  });

  it('replaces a plain 409 with the given wording and otherwise stays generic', () => {
    const conflict = new ApiError("Slug halaman 'x' sudah digunakan", 409, { method: 'POST' });
    expect(
      ceritaFailure(conflict, 'menambah halaman', { conflictMessage: 'Judul sudah ada.' }).message,
    ).toBe('Judul sudah ada.');
    const generic = ceritaFailure(conflict, 'menambah halaman').message;
    expect(generic).not.toContain('Slug');
  });

  it('never shows a status code or a server string for a server error', () => {
    const error = new ApiError('SQL syntax error near', 500, { method: 'POST' });
    const message = ceritaFailure(error, 'menambah bab').message;
    expect(message).not.toMatch(/500|SQL/);
    expect(message).toContain('Gagal menambah bab');
  });
});
