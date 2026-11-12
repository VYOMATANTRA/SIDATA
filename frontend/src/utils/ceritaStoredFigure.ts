import type { ArticleFigure, ArticlePhoto } from '../types/ceritaArticle';
import { safeImageSrc } from './ceritaFigures';

/**
 * Turns the figure stored on a section (a `figure` content block, SPEC §7) into the `ArticleFigure`
 * the article components render. The stored `metadata` is validated by the backend on write, but
 * the reader still parses it defensively: anything it does not recognise yields no figure (or
 * leaves out that photo or bar), never an error, so one bad record cannot break a public page.
 */

export const FIGURE_BLOCK_TYPE = 'figure';

const MAX_PHOTOS = 12;
const MAX_BARS = 20;
const MEDIA_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The minimal block shape the mapping reads; `ContentBlock` satisfies it. */
export interface StoredFigureBlock {
  id: string;
  type: string;
  sectionId: string | null;
  metadata: unknown;
}

/** Public address of an attached photo. A malformed id never reaches a URL. */
export function mediaPublicUrl(mediaId: unknown): string | null {
  return typeof mediaId === 'string' && MEDIA_ID.test(mediaId)
    ? `/api/media/${mediaId.toLowerCase()}`
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function parsePhoto(raw: unknown): ArticlePhoto | null {
  if (!isRecord(raw)) return null;
  const src = safeImageSrc(mediaPublicUrl(raw['mediaId']));
  // Alt text is required: a picture nobody can describe is not shown.
  const alt = text(raw['alt']);
  if (!src || !alt) return null;
  const caption = text(raw['caption']);
  const credit = text(raw['credit']);
  return {
    id: src,
    src,
    alt,
    ...(caption ? { caption } : {}),
    ...(credit ? { credit } : {}),
  };
}

function parsePhotos(raw: unknown): ArticlePhoto[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const photos: ArticlePhoto[] = [];
  for (const item of raw) {
    const photo = parsePhoto(item);
    if (!photo || seen.has(photo.id)) continue;
    seen.add(photo.id);
    photos.push(photo);
    if (photos.length >= MAX_PHOTOS) break;
  }
  return photos;
}

function parseBars(
  raw: unknown,
): { unit?: string; items: { id: string; label: string; value: number }[] } | null {
  if (!isRecord(raw) || !Array.isArray(raw['items'])) return null;
  const items: { id: string; label: string; value: number }[] = [];
  for (const item of raw['items']) {
    if (!isRecord(item)) continue;
    const label = text(item['label']);
    const value = item['value'];
    if (!label || typeof value !== 'number' || !Number.isFinite(value)) continue;
    items.push({ id: `bar-${items.length}`, label, value });
    if (items.length >= MAX_BARS) break;
  }
  if (items.length === 0) return null;
  const unit = text(raw['unit']);
  return { ...(unit ? { unit } : {}), items };
}

/** Stored figure metadata to an `ArticleFigure`, or `null` when it is not a usable figure. */
export function storedFigureToArticleFigure(metadata: unknown): ArticleFigure | null {
  if (!isRecord(metadata)) return null;
  const kind = metadata['kind'];

  if (kind === 'photo') {
    const [photo] = parsePhotos(metadata['photos']);
    return photo ? { kind: 'photo', photo } : null;
  }

  if (kind === 'photos') {
    const photos = parsePhotos(metadata['photos']);
    return photos.length > 0 ? { kind: 'photos', photos } : null;
  }

  if (kind === 'diagram') {
    const title = text(metadata['title']);
    if (!title) return null;
    const image = isRecord(metadata['image']) ? metadata['image'] : null;
    const src = image ? safeImageSrc(mediaPublicUrl(image['mediaId'])) : null;
    const alt = image ? text(image['alt']) : undefined;
    // A picture without alt text is dropped, like a photo; the bars (if any) stay.
    const picture = src && alt ? { src, alt } : null;
    const bars = parseBars(metadata['bars']);
    if (!picture && !bars) return null;
    const source = text(metadata['source']);
    return {
      kind: 'diagram',
      title,
      ...(picture ?? {}),
      ...(bars ? { bars } : {}),
      ...(source ? { source } : {}),
    };
  }

  return null;
}

/**
 * The stored figure of every section, keyed by section id. A figure block without a section is
 * ignored, and a block that does not parse to a figure leaves its section without one. If a section
 * somehow carries two figure blocks, the one with the lowest id wins, so the choice is stable.
 */
export function figuresBySectionId(
  blocks: readonly StoredFigureBlock[],
): Record<string, ArticleFigure> {
  const result: Record<string, ArticleFigure> = {};
  const ordered = blocks
    .filter((block) => block.type === FIGURE_BLOCK_TYPE && block.sectionId)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const block of ordered) {
    const sectionId = block.sectionId as string;
    if (result[sectionId]) continue;
    const figure = storedFigureToArticleFigure(block.metadata);
    if (figure) result[sectionId] = figure;
  }
  return result;
}
