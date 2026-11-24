import { describe, expect, it } from 'vitest';
import { emptyDraft, emptyPhoto, type FigureDraft } from '../utils/ceritaFigureDraft';
import { previewFigureOf } from '../utils/ceritaPreviewFigure';

const A = '0f3e1c2a-1111-4222-8333-444455556666';
const B = '1f3e1c2a-1111-4222-8333-444455556666';
const C = '2f3e1c2a-1111-4222-8333-444455556666';

function withDraft(patch: Partial<FigureDraft>): FigureDraft {
  return { ...emptyDraft(), ...patch };
}

function photo(mediaId: string | null, alt = 'Foto', caption = '', credit = '') {
  return { mediaId, alt, caption, credit };
}

describe('previewFigureOf', () => {
  it('shows nothing while no figure kind is chosen', () => {
    expect(previewFigureOf(emptyDraft())).toBeNull();
  });

  it('maps "1 gambar" to a photo at the public media address, with its caption and credit', () => {
    const figure = previewFigureOf(
      withDraft({
        tile: 'photo',
        photos: [photo(A, 'Balai kelurahan', 'Zoom VB', 'Tim')],
      }),
    );
    expect(figure).toEqual({
      kind: 'photo',
      photo: {
        id: `/api/media/${A}`,
        src: `/api/media/${A}`,
        alt: 'Balai kelurahan',
        caption: 'Zoom VB',
        credit: 'Tim',
      },
    });
  });

  it('drops a photo without alt text, as the public reader does', () => {
    expect(previewFigureOf(withDraft({ tile: 'photo', photos: [photo(A, '')] }))).toBeNull();
  });

  it('skips a photo slot that has no upload yet', () => {
    const figure = previewFigureOf(
      withDraft({ tile: 'photos-2', photos: [photo(null), photo(B, 'Dua')] }),
    );
    expect(figure).toEqual({
      kind: 'photos',
      photos: [{ id: `/api/media/${B}`, src: `/api/media/${B}`, alt: 'Dua' }],
    });
  });

  it('maps "2 gambar" and "Galeri" to a photo group, with the shared credit as a fallback', () => {
    const figure = previewFigureOf(
      withDraft({
        tile: 'gallery',
        sharedCredit: 'Tim Inovasi',
        photos: [photo(A, 'Satu', '', ''), photo(B, 'Dua', '', 'Sendiri'), photo(C, 'Tiga')],
      }),
    );
    expect(figure?.kind).toBe('photos');
    if (figure?.kind !== 'photos') return;
    expect(figure.photos.map((p) => p.credit)).toEqual(['Tim Inovasi', 'Sendiri', 'Tim Inovasi']);
    expect(figure.photos.map((p) => p.alt)).toEqual(['Satu', 'Dua', 'Tiga']);
  });

  it('maps a chart of a table to the chart figure', () => {
    const figure = previewFigureOf(
      withDraft({
        tile: 'chart',
        grafikSource: 'table',
        chartTableId: 'tab-umur',
        chartType: 'column',
        chartSeries: 'by_sex',
        chartTitle: ' Penduduk menurut umur ',
        chartSource: 'Contoh BPS 2024',
      }),
    );
    expect(figure).toEqual({
      kind: 'chart',
      tableId: 'tab-umur',
      chartType: 'column',
      series: 'by_sex',
      title: 'Penduduk menurut umur',
      source: 'Contoh BPS 2024',
    });
  });

  it('shows no chart until a table is chosen', () => {
    expect(
      previewFigureOf(withDraft({ tile: 'chart', grafikSource: 'table', chartTitle: 'Judul' })),
    ).toBeNull();
  });

  it('maps an uploaded chart picture with its bars, and a non-numeric bar is left out', () => {
    const figure = previewFigureOf(
      withDraft({
        tile: 'chart',
        grafikSource: 'upload',
        diagramTitle: 'Grafik unggahan',
        diagramSource: 'Data',
        diagramImageId: A,
        diagramImageAlt: 'Grafik garis',
        barUnit: 'orang',
        bars: [
          { label: 'Jan', value: '1.200' },
          { label: 'Feb', value: 'x' },
          { label: '', value: '3' },
        ],
      }),
    );
    expect(figure).toEqual({
      kind: 'diagram',
      title: 'Grafik unggahan',
      src: `/api/media/${A}`,
      alt: 'Grafik garis',
      bars: { unit: 'orang', items: [{ id: 'bar-0', label: 'Jan', value: 1200 }] },
      source: 'Data',
    });
  });

  it('shows an uploaded chart with only its bars when there is no picture', () => {
    const figure = previewFigureOf(
      withDraft({
        tile: 'chart',
        grafikSource: 'upload',
        diagramTitle: 'Tanpa gambar',
        bars: [{ label: 'Jan', value: '2,5' }],
      }),
    );
    expect(figure?.kind).toBe('diagram');
    if (figure?.kind !== 'diagram') return;
    expect(figure.src).toBeUndefined();
    expect(figure.bars?.items).toEqual([{ id: 'bar-0', label: 'Jan', value: 2.5 }]);
  });

  it('does not put an empty photo row in the 1-gambar figure', () => {
    expect(previewFigureOf(withDraft({ tile: 'photo', photos: [emptyPhoto()] }))).toBeNull();
  });
});
