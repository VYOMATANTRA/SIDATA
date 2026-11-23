import { describe, expect, it } from 'vitest';
import type { SectionFigure } from '../services/ceritaFigure.service';
import {
  EXCERPT_MAX_LENGTH,
  figureBadge,
  plainExcerpt,
  sectionCompleteness,
  thumbnailMediaId,
} from '../utils/ceritaChapterOverview';

const photo = (mediaId: string): SectionFigure => ({
  kind: 'photo',
  photos: [{ mediaId, alt: 'Foto' }],
});

describe('plainExcerpt', () => {
  it('strips bold, italic, link and list markers', () => {
    expect(plainExcerpt('**Tebal** dan *miring* lihat [sumber](https://x.id)')).toBe(
      'Tebal dan miring lihat sumber',
    );
    expect(plainExcerpt('- satu\n- dua')).toBe('satu dua');
  });

  it('collapses whitespace and line breaks into one line', () => {
    expect(plainExcerpt('Baris satu\n\nbaris   dua')).toBe('Baris satu baris dua');
  });

  it('returns null for an empty or whitespace-only paragraph', () => {
    expect(plainExcerpt(null)).toBeNull();
    expect(plainExcerpt('')).toBeNull();
    expect(plainExcerpt('   \n  ')).toBeNull();
  });

  it('cuts a long line at a word boundary with an ellipsis', () => {
    const long = 'kata '.repeat(60).trim();
    const excerpt = plainExcerpt(long);
    expect(excerpt).not.toBeNull();
    expect(excerpt!.endsWith('…')).toBe(true);
    expect(excerpt!.length).toBeLessThanOrEqual(EXCERPT_MAX_LENGTH + 1);
    expect(excerpt!.slice(0, -1).endsWith(' ')).toBe(false);
  });

  it('keeps a short line whole', () => {
    expect(plainExcerpt('Pendek saja.')).toBe('Pendek saja.');
  });
});

describe('figureBadge', () => {
  it('names each figure kind in words', () => {
    expect(figureBadge(photo('a'))).toBe('1 gambar');
    expect(
      figureBadge({
        kind: 'photos',
        photos: [
          { mediaId: 'a', alt: 'x' },
          { mediaId: 'b', alt: 'y' },
        ],
      }),
    ).toBe('2 gambar');
    expect(
      figureBadge({
        kind: 'photos',
        photos: [
          { mediaId: 'a', alt: 'x' },
          { mediaId: 'b', alt: 'y' },
          { mediaId: 'c', alt: 'z' },
        ],
      }),
    ).toBe('Galeri');
    expect(figureBadge({ kind: 'diagram', title: 'Diagram' })).toBe('Diagram');
    expect(
      figureBadge({
        kind: 'chart',
        tableId: 't1',
        chartType: 'bar',
        series: 'total',
        title: 'Grafik',
      }),
    ).toBe('Grafik');
  });

  it('reads "Tanpa gambar" when the section has no figure', () => {
    expect(figureBadge(null)).toBe('Tanpa gambar');
  });
});

describe('sectionCompleteness', () => {
  const figure = photo('a');

  it('is "Lengkap" with a title, a paragraph and a figure', () => {
    expect(sectionCompleteness({ title: 'Ringkasan', paragraphCount: 1, figure })).toEqual({
      label: 'Lengkap',
      complete: true,
    });
  });

  it('is "Figur kosong" when there is no figure, whatever else is filled', () => {
    expect(sectionCompleteness({ title: 'Ringkasan', paragraphCount: 2, figure: null })).toEqual({
      label: 'Figur kosong',
      complete: false,
    });
  });

  it('is "Belum lengkap" when the title or the paragraphs are missing', () => {
    expect(sectionCompleteness({ title: null, paragraphCount: 1, figure })).toEqual({
      label: 'Belum lengkap',
      complete: false,
    });
    expect(sectionCompleteness({ title: '  ', paragraphCount: 1, figure }).label).toBe(
      'Belum lengkap',
    );
    expect(sectionCompleteness({ title: 'Judul', paragraphCount: 0, figure }).label).toBe(
      'Belum lengkap',
    );
  });
});

describe('thumbnailMediaId', () => {
  it('uses the first photo of a photo or gallery figure', () => {
    expect(thumbnailMediaId(photo('media-1'))).toBe('media-1');
    expect(
      thumbnailMediaId({
        kind: 'photos',
        photos: [
          { mediaId: 'first', alt: 'a' },
          { mediaId: 'second', alt: 'b' },
        ],
      }),
    ).toBe('first');
  });

  it('has no thumbnail for a chart, a diagram or no figure', () => {
    expect(thumbnailMediaId(null)).toBeNull();
    expect(thumbnailMediaId({ kind: 'diagram', title: 'D' })).toBeNull();
    expect(
      thumbnailMediaId({
        kind: 'chart',
        tableId: 't',
        chartType: 'bar',
        series: 'total',
        title: 'G',
      }),
    ).toBeNull();
  });
});
