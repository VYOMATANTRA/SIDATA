import { describe, expect, it } from 'vitest';
import {
  chapterNumberLabel,
  figureTreeLabel,
  sectionNumberLabel,
} from '../utils/ceritaTreeLabels';
import { safeImageSrc } from '../utils/ceritaFigures';

describe('ceritaTreeLabels', () => {
  it('numbers a chapter by its stored number, or by its position when it has none', () => {
    expect(chapterNumberLabel('2.1', 0)).toBe('2.1');
    expect(chapterNumberLabel(null, 2)).toBe('3');
    expect(chapterNumberLabel('  ', 0)).toBe('1');
  });

  it('numbers a section as chapter number and position in that chapter', () => {
    expect(sectionNumberLabel('1', 0)).toBe('1.1');
    expect(sectionNumberLabel('2.1', 1)).toBe('2.1.2');
  });

  it('names a figure by its kind and flags a section without one', () => {
    const photo = { kind: 'photo' as const, photos: [{ mediaId: 'm', alt: 'a' }] as [never] };
    expect(figureTreeLabel(null)).toEqual({ label: 'Figur kosong', empty: true });
    expect(figureTreeLabel(photo)).toEqual({ label: '1 gambar', empty: false });
    expect(figureTreeLabel({ kind: 'photos', photos: [] })).toEqual({
      label: 'Figur kosong',
      empty: true,
    });
    expect(figureTreeLabel({ kind: 'photos', photos: [{}, {}] as never })).toEqual({
      label: '2 gambar',
      empty: false,
    });
    expect(figureTreeLabel({ kind: 'photos', photos: [{}, {}, {}] as never })).toEqual({
      label: 'Galeri',
      empty: false,
    });
    expect(figureTreeLabel({ kind: 'diagram', title: 'Grafik' })).toEqual({
      label: 'Diagram',
      empty: false,
    });
  });
});

describe('safeImageSrc', () => {
  it('accepts a site path, an https address and a blob URL made by the page', () => {
    expect(safeImageSrc('/api/media/abc')).toBe('/api/media/abc');
    expect(safeImageSrc('https://example.com/a.webp')).toBe('https://example.com/a.webp');
    expect(safeImageSrc('blob:http://localhost:5180/0f3e')).toBe('blob:http://localhost:5180/0f3e');
  });

  it('refuses protocol-relative, javascript and empty sources', () => {
    expect(safeImageSrc('//evil.example/a.png')).toBeNull();
    expect(safeImageSrc('javascript:alert(1)')).toBeNull();
    expect(safeImageSrc('')).toBeNull();
    expect(safeImageSrc(undefined)).toBeNull();
  });
});
