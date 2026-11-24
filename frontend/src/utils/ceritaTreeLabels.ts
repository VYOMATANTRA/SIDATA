import type { SectionFigure } from '../services/ceritaFigure.service';

/**
 * Labels of the Cerita structure tree (`components/admin/cerita/CeritaStructureTree.vue`): the
 * chapter and section numbers and the short meta line that says what a section's figure is.
 * Pure, so the wording and the numbering are tested without rendering the tree.
 */

/** "Bab 1": the chapter's stored number when it has one, its position (1-based) otherwise. */
export function chapterNumberLabel(number: string | null | undefined, index: number): string {
  const stored = number?.trim();
  return stored ? stored : String(index + 1);
}

/** "1.2": the chapter's number followed by the section's position in that chapter. */
export function sectionNumberLabel(chapterNumber: string, sectionIndex: number): string {
  return `${chapterNumber}.${sectionIndex + 1}`;
}

export interface FigureTreeLabel {
  /** Short text such as "1 gambar" or "Figur kosong". */
  label: string;
  /** A section without a figure: the tree shows it as a warning, in words and not only colour. */
  empty: boolean;
}

/** What a section's figure is, in one short word group; a missing figure is a warning. */
export function figureTreeLabel(figure: SectionFigure | null | undefined): FigureTreeLabel {
  if (!figure) return { label: 'Figur kosong', empty: true };
  switch (figure.kind) {
    case 'photo':
      return { label: '1 gambar', empty: false };
    case 'photos': {
      const count = figure.photos.length;
      if (count === 0) return { label: 'Figur kosong', empty: true };
      if (count === 1) return { label: '1 gambar', empty: false };
      return { label: count === 2 ? '2 gambar' : 'Galeri', empty: false };
    }
    case 'diagram':
      return { label: 'Diagram', empty: false };
    case 'chart':
      return { label: 'Grafik', empty: false };
  }
}
