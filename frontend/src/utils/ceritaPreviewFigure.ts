import type { ArticleFigure } from '../types/ceritaArticle';
import { kindOfDraft, parseBarValue, type FigureDraft } from './ceritaFigureDraft';
import { storedFigureToArticleFigure } from './ceritaStoredFigure';

/**
 * The figure the editor's draft would show on the site, for the live preview. The draft is not
 * validated here (a half-typed figure still previews what is there); the public mapping
 * (`storedFigureToArticleFigure`) then applies the reader's own rules: a photo without alt text is
 * left out, a chart needs a table id, and so on. Photos are addressed as `/api/media/<id>`; the
 * preview swaps those for blob URLs (`useStoredFigurePreview`).
 */
export function previewFigureOf(draft: FigureDraft): ArticleFigure | null {
  const kind = kindOfDraft(draft);
  if (kind === null) return null;

  if (kind === 'chart') {
    return storedFigureToArticleFigure({
      kind: 'chart',
      tableId: draft.chartTableId,
      chartType: draft.chartType,
      series: draft.chartSeries,
      title: draft.chartTitle.trim(),
      source: draft.chartSource.trim(),
    });
  }

  if (kind === 'diagram') {
    const items = draft.bars.flatMap((bar) => {
      const label = bar.label.trim();
      const value = parseBarValue(bar.value);
      return label !== '' && value !== null ? [{ label, value }] : [];
    });
    const imageId = draft.diagramImageId;
    return storedFigureToArticleFigure({
      kind: 'diagram',
      title: draft.diagramTitle.trim(),
      ...(imageId ? { image: { mediaId: imageId, alt: draft.diagramImageAlt.trim() } } : {}),
      ...(items.length > 0 ? { bars: { unit: draft.barUnit.trim(), items } } : {}),
      source: draft.diagramSource.trim(),
    });
  }

  // Photo tiles: "1 gambar" shows its first photo; "2 gambar" and "Galeri" share the group.
  const rows = draft.tile === 'photo' ? draft.photos.slice(0, 1) : draft.photos;
  const photos = rows.flatMap((row) =>
    row.mediaId
      ? [
          {
            mediaId: row.mediaId,
            alt: row.alt.trim(),
            caption: row.caption.trim(),
            credit: row.credit.trim(),
          },
        ]
      : [],
  );
  if (draft.tile === 'photo') return storedFigureToArticleFigure({ kind: 'photo', photos });
  return storedFigureToArticleFigure({
    kind: 'photos',
    credit: draft.sharedCredit.trim(),
    photos,
  });
}
