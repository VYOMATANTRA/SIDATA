import type { ArticleFigure, ArticlePhoto, ChartTable } from '../types/ceritaArticle';
import { isChartType } from './ceritaChart';

/**
 * The message protocol between the Cerita editor and its live preview (`/admin/cerita/pratinjau`).
 * The editor (parent) sends the unsaved draft; the preview (same-origin iframe) answers with its
 * readiness and content height. Both sides accept a message only from the same origin and from the
 * exact window they expect (see `isTrustedMessage`).
 *
 * Text that is too long is CLIPPED, never refused: a pasted 60,000-character body still updates the
 * preview, cut to the limit. Only a malformed shape (wrong type, unknown kind, bad id) drops the
 * payload. The parent clips with the same `limitPreviewPayload` before it posts, so both sides agree.
 */

export const PREVIEW_ROUTE = '/admin/cerita/pratinjau';

export const PREVIEW_MESSAGE = {
  /** Parent to preview: the draft to draw. */
  data: 'cerita-preview',
  /** Preview to parent: the route has mounted and listens. */
  ready: 'cerita-preview-ready',
  /** Preview to parent: the content height in CSS pixels at the preview's own width. */
  height: 'cerita-preview-height',
} as const;

/**
 * Clip limits. The figure limits mirror `FIGURE_LIMITS` (services/ceritaFigure.service.ts) and the
 * body limit mirrors the editor's `BODY_MAX_LENGTH`, so what the preview shows is what the site keeps.
 */
export const PREVIEW_LIMITS = {
  title: 255,
  body: 50_000,
  chapterLabel: 300,
  alt: 300,
  caption: 200,
  credit: 120,
  diagramTitle: 120,
  diagramSource: 200,
  barLabel: 80,
  barUnit: 20,
  bars: 20,
  photos: 12,
  tableLabel: 200,
  /** Ids (media, table, row) are not clipped: an over-long id is malformed. */
  id: 200,
  tableId: 64,
  height: 20_000,
  url: 2_000,
} as const;

export interface CeritaPreviewPayload {
  title: string;
  body: string;
  chapterLabel: string;
  figure: ArticleFigure | null;
  /** Indicator tables the figure's chart reads, by id. */
  tables: Record<string, ChartTable>;
}

/**
 * True only when the message comes from our own origin and from the window we talk to. A message
 * from any other origin, or from another window of the same origin, is ignored.
 */
export function isTrustedMessage(
  event: Pick<MessageEvent, 'origin' | 'source'>,
  peer: MessageEventSource | null,
  ownOrigin: string,
): boolean {
  return peer !== null && event.origin === ownOrigin && event.source === peer;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A string clipped to `max` characters, or null when the value is not a string at all. */
function clip(value: unknown, max: number): string | null {
  return typeof value === 'string' ? value.slice(0, max) : null;
}

/** An optional string clipped to `max`: undefined when absent, null when present but not a string. */
function clipOptional(value: unknown, max: number): string | undefined | null {
  if (value === undefined) return undefined;
  return clip(value, max);
}

/** An identifier: a string within `max`; a longer one is malformed (it names a record). */
function idOf(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
}

function nullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function photoOf(value: unknown): ArticlePhoto | null {
  if (!isRecord(value)) return null;
  const id = idOf(value['id'], PREVIEW_LIMITS.id);
  const src = clip(value['src'], PREVIEW_LIMITS.url);
  const alt = clip(value['alt'], PREVIEW_LIMITS.alt);
  const caption = clipOptional(value['caption'], PREVIEW_LIMITS.caption);
  const credit = clipOptional(value['credit'], PREVIEW_LIMITS.credit);
  if (id === null || src === null || alt === null || caption === null || credit === null) {
    return null;
  }
  return {
    id,
    src,
    alt,
    ...(caption !== undefined ? { caption } : {}),
    ...(credit !== undefined ? { credit } : {}),
  };
}

function photosOf(value: unknown): ArticlePhoto[] | null {
  if (!Array.isArray(value)) return null;
  const photos: ArticlePhoto[] = [];
  for (const item of value.slice(0, PREVIEW_LIMITS.photos)) {
    const photo = photoOf(item);
    if (!photo) return null;
    photos.push(photo);
  }
  return photos;
}

function barsOf(value: unknown): { unit?: string; items: { id: string; label: string; value: number }[] } | null {
  if (!isRecord(value) || !Array.isArray(value['items'])) return null;
  const unit = clipOptional(value['unit'], PREVIEW_LIMITS.barUnit);
  if (unit === null) return null;
  const items: { id: string; label: string; value: number }[] = [];
  for (const item of value['items'].slice(0, PREVIEW_LIMITS.bars)) {
    if (!isRecord(item)) return null;
    const id = idOf(item['id'], PREVIEW_LIMITS.id);
    const label = clip(item['label'], PREVIEW_LIMITS.barLabel);
    const amount = nullableNumber(item['value']);
    if (id === null || label === null || typeof amount !== 'number') return null;
    items.push({ id, label, value: amount });
  }
  return { ...(unit !== undefined ? { unit } : {}), items };
}

/** A figure clipped to its limits; null when its shape is malformed (the payload is then dropped). */
function figureOf(value: unknown): ArticleFigure | null {
  if (!isRecord(value)) return null;
  switch (value['kind']) {
    case 'photo': {
      const photo = photoOf(value['photo']);
      return photo ? { kind: 'photo', photo } : null;
    }
    case 'photos': {
      const photos = photosOf(value['photos']);
      return photos ? { kind: 'photos', photos } : null;
    }
    case 'diagram': {
      const title = clip(value['title'], PREVIEW_LIMITS.diagramTitle);
      const src = clipOptional(value['src'], PREVIEW_LIMITS.url);
      const alt = clipOptional(value['alt'], PREVIEW_LIMITS.alt);
      const source = clipOptional(value['source'], PREVIEW_LIMITS.diagramSource);
      const bars = value['bars'] === undefined ? undefined : barsOf(value['bars']);
      if (title === null || src === null || alt === null || source === null) return null;
      if (value['bars'] !== undefined && bars === null) return null;
      return {
        kind: 'diagram',
        title,
        ...(src !== undefined ? { src } : {}),
        ...(alt !== undefined ? { alt } : {}),
        ...(bars ? { bars } : {}),
        ...(source !== undefined ? { source } : {}),
      };
    }
    case 'chart': {
      const tableId = idOf(value['tableId'], PREVIEW_LIMITS.tableId);
      const title = clip(value['title'], PREVIEW_LIMITS.diagramTitle);
      const source = clipOptional(value['source'], PREVIEW_LIMITS.diagramSource);
      const chartType = value['chartType'];
      const series = value['series'];
      if (tableId === null || title === null || source === null) return null;
      if (!isChartType(chartType)) return null;
      if (series !== 'total' && series !== 'by_sex') return null;
      return {
        kind: 'chart',
        tableId,
        chartType,
        series,
        title,
        ...(source !== undefined ? { source } : {}),
      };
    }
    default:
      return null;
  }
}

/** A table of the page clipped to what the chart reads; null when malformed. */
function tableOf(value: unknown): ChartTable | null {
  if (!isRecord(value) || !Array.isArray(value['rows'])) return null;
  const id = idOf(value['id'], PREVIEW_LIMITS.tableId);
  const period = clipOptional(value['period'], PREVIEW_LIMITS.tableLabel);
  if (id === null || period === null) return null;
  const rows: ChartTable['rows'] = [];
  for (const row of value['rows']) {
    if (!isRecord(row)) return null;
    const rowId = idOf(row['id'], PREVIEW_LIMITS.id);
    const label = clip(row['label'], PREVIEW_LIMITS.tableLabel);
    const male = nullableNumber(row['male']);
    const female = nullableNumber(row['female']);
    const total = nullableNumber(row['total']);
    if (rowId === null || label === null) return null;
    if (male === undefined || female === undefined || total === undefined) return null;
    rows.push({ id: rowId, label, male, female, total });
  }
  return { id, ...(period !== undefined ? { period } : {}), rows };
}

function tablesOf(value: unknown): Record<string, ChartTable> | null {
  if (value === undefined) return {};
  if (!isRecord(value)) return null;
  const tables: Record<string, ChartTable> = {};
  for (const [key, table] of Object.entries(value)) {
    const clean = tableOf(table);
    if (!clean) return null;
    tables[key] = clean;
  }
  return tables;
}

/**
 * The draft clipped to the preview's limits, or null when its shape is malformed. Used by the parent
 * before it posts (so an over-long draft is clipped on both sides) and by the preview on receipt.
 * `type` is ignored here.
 */
export function limitPreviewPayload(input: unknown): CeritaPreviewPayload | null {
  if (!isRecord(input)) return null;
  const title = clip(input['title'], PREVIEW_LIMITS.title);
  const body = clip(input['body'], PREVIEW_LIMITS.body);
  const chapterLabel = clip(input['chapterLabel'], PREVIEW_LIMITS.chapterLabel);
  if (title === null || body === null || chapterLabel === null) return null;

  const figure = input['figure'] === null || input['figure'] === undefined ? null : figureOf(input['figure']);
  if (figure === null && input['figure'] !== null && input['figure'] !== undefined) return null;

  const tables = tablesOf(input['tables']);
  if (tables === null) return null;

  return { title, body, chapterLabel, figure, tables };
}

/** True when the editor's body is longer than the preview keeps (the preview then clips it). */
export function isBodyClipped(body: string): boolean {
  return body.length > PREVIEW_LIMITS.body;
}

/** The draft from the editor, or null when the message is not a well-formed preview payload. */
export function parsePreviewPayload(data: unknown): CeritaPreviewPayload | null {
  if (!isRecord(data) || data['type'] !== PREVIEW_MESSAGE.data) return null;
  return limitPreviewPayload(data);
}

/** True for the preview's "ready" message. */
export function isPreviewReady(data: unknown): boolean {
  return isRecord(data) && data['type'] === PREVIEW_MESSAGE.ready;
}

/** The content height the preview reported, or null for any other or malformed message. */
export function parsePreviewHeight(data: unknown): number | null {
  if (!isRecord(data) || data['type'] !== PREVIEW_MESSAGE.height) return null;
  const height = data['height'];
  if (typeof height !== 'number' || !Number.isFinite(height)) return null;
  if (height <= 0 || height > PREVIEW_LIMITS.height) return null;
  return Math.ceil(height);
}
