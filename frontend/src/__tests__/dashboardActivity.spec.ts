import { describe, it, expect } from 'vitest';
import { activityPhrase, describeActivity } from '../utils/dashboardActivity';

describe('activityPhrase', () => {
  it.each([
    ['indicator.created', 'menambahkan', 'indikator'],
    ['indicator.updated', 'memperbarui', 'indikator'],
    ['indicator.deleted', 'menghapus', 'indikator'],
    ['indicator_table_row.updated', 'memperbarui', 'baris tabel indikator'],
    ['content_block.reordered', 'mengurutkan ulang', 'blok konten'],
    ['chapter.reordered', 'mengurutkan ulang', 'bab'],
    ['section.moved', 'memindahkan', 'bagian'],
    ['section.duplicated', 'menduplikasi', 'bagian'],
    ['section.figure_saved', 'menyimpan gambar', 'bagian'],
    ['rt_leader.imported', 'mengimpor', 'ketua RT'],
    ['rt_leader.sample_status_changed', 'memperbarui', 'ketua RT'],
    ['spatial_point_rt.deleted', 'menghapus', 'titik RT'],
    [
      'comparison_template.keyword_warning_overridden',
      'mengabaikan peringatan kata kunci',
      'templat kalimat',
    ],
  ])('%s -> %s %s', (action, verb, noun) => {
    expect(activityPhrase(action)).toEqual({ verb, noun });
  });

  it('uses the highlights wording for page.highlights_updated', () => {
    expect(activityPhrase('page.highlights_updated')).toEqual({
      verb: 'memperbarui statistik unggulan',
      noun: 'halaman',
    });
  });

  it('falls back to the generic verb for an unknown action', () => {
    expect(activityPhrase('indicator.exploded')).toEqual({ verb: 'mengubah', noun: 'indikator' });
    expect(activityPhrase('mystery.thing')).toEqual({ verb: 'mengubah', noun: 'data' });
    expect(activityPhrase('nodot')).toEqual({ verb: 'mengubah', noun: 'data' });
  });
});

describe('describeActivity', () => {
  const base = {
    action: 'indicator.updated',
    targetType: 'indicator',
    targetLabel: null,
    actorName: 'andi',
  };

  it('uses the target label when present', () => {
    expect(describeActivity({ ...base, targetLabel: 'Jumlah penduduk' })).toBe(
      'andi memperbarui Jumlah penduduk',
    );
  });

  it('uses the object noun when the target has no label', () => {
    expect(describeActivity(base)).toBe('andi memperbarui indikator');
  });

  it('reads "Seseorang" when the actor is unknown', () => {
    expect(describeActivity({ ...base, actorName: null })).toBe('Seseorang memperbarui indikator');
  });

  it('treats a blank label as missing', () => {
    expect(describeActivity({ ...base, targetLabel: '   ' })).toBe('andi memperbarui indikator');
  });
});
