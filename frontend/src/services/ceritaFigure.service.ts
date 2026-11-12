import { apiRequestJson } from '../utils/apiClient';
import type { ContentBlock } from '../stores/contentBlocks.store';

/**
 * Every call that concerns a section's figure (photo, photo series or diagram), in one place.
 *
 * The figure is stored as one `figure` content block per section (Wave 4 contract). It is read
 * through the ordinary content-block list and written only through the two section endpoints
 * below, so media attach/detach cannot be bypassed. If the backend contract shifts, this file is
 * the only one that changes.
 */

export interface FigurePhotoInput {
  mediaId: string;
  alt: string;
  caption?: string;
  credit?: string;
}

export type SectionFigure =
  | { kind: 'photo'; photos: [FigurePhotoInput] }
  | { kind: 'photos'; photos: FigurePhotoInput[] }
  | {
      kind: 'diagram';
      title: string;
      source?: string;
      image?: { mediaId: string; alt: string };
      bars?: { unit?: string; items: { label: string; value: number }[] };
    };

/** Limits mirrored from the contract; the server stays the authority. */
export const FIGURE_LIMITS = {
  photosMin: 2,
  photosMax: 12,
  alt: 300,
  caption: 200,
  credit: 120,
  diagramTitle: 120,
  diagramSource: 200,
  barsMax: 20,
  barLabel: 80,
  barUnit: 20,
} as const;

export const FIGURE_BLOCK_TYPE = 'figure';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function readPhotos(value: unknown): FigurePhotoInput[] {
  if (!Array.isArray(value)) return [];
  const photos: FigurePhotoInput[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item['mediaId'] !== 'string') continue;
    const caption = text(item['caption']);
    const credit = text(item['credit']);
    photos.push({
      mediaId: item['mediaId'],
      alt: typeof item['alt'] === 'string' ? item['alt'] : '',
      ...(caption ? { caption } : {}),
      ...(credit ? { credit } : {}),
    });
  }
  return photos;
}

/**
 * Reads the stored `metadata` of a figure block without ever throwing; anything that does not
 * look like a figure yields null (the screen then shows "no figure").
 */
export function figureFromBlock(block: ContentBlock | null | undefined): SectionFigure | null {
  const meta = block?.metadata;
  if (!block || block.type !== FIGURE_BLOCK_TYPE || !isRecord(meta)) return null;

  if (meta['kind'] === 'photo' || meta['kind'] === 'photos') {
    const photos = readPhotos(meta['photos']);
    if (photos.length === 0) return null;
    if (meta['kind'] === 'photo') {
      const [first] = photos;
      return first ? { kind: 'photo', photos: [first] } : null;
    }
    return { kind: 'photos', photos };
  }

  if (meta['kind'] === 'diagram') {
    const title = text(meta['title']);
    if (!title) return null;
    const source = text(meta['source']);
    const figure: SectionFigure = { kind: 'diagram', title };
    if (source) figure.source = source;

    const image = meta['image'];
    if (isRecord(image) && typeof image['mediaId'] === 'string') {
      figure.image = {
        mediaId: image['mediaId'],
        alt: typeof image['alt'] === 'string' ? image['alt'] : '',
      };
    }

    const bars = meta['bars'];
    if (isRecord(bars) && Array.isArray(bars['items'])) {
      const items = bars['items']
        .filter(isRecord)
        .filter((item) => typeof item['label'] === 'string' && typeof item['value'] === 'number')
        .map((item) => ({ label: item['label'] as string, value: item['value'] as number }));
      if (items.length > 0) {
        const unit = text(bars['unit']);
        figure.bars = { ...(unit ? { unit } : {}), items };
      }
    }
    return figure;
  }

  return null;
}

/** Creates or replaces the section's figure. `expectedUpdatedAt` is the section's token. */
export async function saveSectionFigure(
  sectionId: string,
  expectedUpdatedAt: string,
  figure: SectionFigure,
): Promise<void> {
  await apiRequestJson(`/api/sections/${encodeURIComponent(sectionId)}/figure`, {
    method: 'PUT',
    body: JSON.stringify({ expectedUpdatedAt, figure }),
  });
}

/** Removes the section's figure and releases its photos. */
export async function deleteSectionFigure(
  sectionId: string,
  expectedUpdatedAt: string,
): Promise<void> {
  await apiRequestJson(
    `/api/sections/${encodeURIComponent(sectionId)}/figure?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}`,
    { method: 'DELETE' },
  );
}
