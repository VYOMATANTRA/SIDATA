import type { SectionFigure } from '../services/ceritaFigure.service';
import type { AdminSection } from '../stores/ceritaAdmin.store';
import { figureTreeLabel } from './ceritaTreeLabels';

/** One section card of the chapter overview, as the view prepares it from the loaded data. */
export interface OverviewCard {
  section: AdminSection;
  number: string;
  title: string;
  excerpt: string | null;
  figureBadge: string;
  completeness: Completeness;
  /** `/api/media/<id>/preview` of the thumbnail photo, or null for the icon placeholder. */
  thumbPath: string | null;
  thumbAlt: string;
}

/**
 * Pure helpers behind the chapter overview of the Cerita editor (`CeritaChapterOverview.vue`):
 * the one-line excerpt of a section, its figure badge, its completeness badge and the photo its
 * thumbnail shows. Kept out of the components so the wording and the rules are tested directly.
 */

export const EXCERPT_MAX_LENGTH = 140;

/**
 * The first paragraph as one plain line: the limited Markdown of a paragraph (SPEC §8) is stripped
 * (bold and italic markers, the address of a link, list dashes), whitespace is collapsed and the
 * line is cut at a word boundary with an ellipsis. Null when there is no text to show.
 */
export function plainExcerpt(
  body: string | null | undefined,
  max = EXCERPT_MAX_LENGTH,
): string | null {
  if (!body) return null;
  const plain = body
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^\s*- /gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain === '') return null;
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s,;:.-]+$/, '')}…`;
}

/** The figure badge of a section card: "1 gambar", "2 gambar", "Galeri", "Grafik", "Diagram". */
export function figureBadge(figure: SectionFigure | null): string {
  const tree = figureTreeLabel(figure);
  return tree.empty ? 'Tanpa gambar' : tree.label;
}

export type CompletenessLabel = 'Lengkap' | 'Belum lengkap' | 'Figur kosong';

export interface Completeness {
  label: CompletenessLabel;
  /** True only for "Lengkap"; the card shows the label as text, never as colour alone. */
  complete: boolean;
}

/**
 * "Lengkap" when the section has a title, at least one paragraph and a figure. Without a figure it
 * reads "Figur kosong"; otherwise (a title or a paragraph is missing) "Belum lengkap".
 */
export function sectionCompleteness(input: {
  title: string | null | undefined;
  paragraphCount: number;
  figure: SectionFigure | null;
}): Completeness {
  if (figureTreeLabel(input.figure).empty) return { label: 'Figur kosong', complete: false };
  const hasTitle = (input.title ?? '').trim() !== '';
  if (hasTitle && input.paragraphCount > 0) return { label: 'Lengkap', complete: true };
  return { label: 'Belum lengkap', complete: false };
}

/** The photo a section card's thumbnail shows: the first photo of a photo or gallery figure. */
export function thumbnailMediaId(figure: SectionFigure | null): string | null {
  if (!figure) return null;
  if (figure.kind === 'photo' || figure.kind === 'photos') {
    return figure.photos[0]?.mediaId ?? null;
  }
  return null;
}
