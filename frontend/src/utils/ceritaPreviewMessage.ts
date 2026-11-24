import type { ArticleFigure, ArticlePhoto, ChartTable } from '../types/ceritaArticle';

/**
 * The message protocol between the Cerita editor and its live preview (`/admin/cerita/pratinjau`).
 * The editor (parent) sends the unsaved draft; the preview (same-origin iframe) answers with its
 * readiness and content height. Both sides accept a message only from the same origin and from the
 * exact window they expect (see `isTrustedMessage`), and the preview shape-checks every payload
 * before it renders anything.
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

/** Limits mirror the editor's rules (SPEC §8) so a long draft is not refused by the preview. */
const TITLE_MAX = 255;
const BODY_MAX = 50_000;
const CHAPTER_LABEL_MAX = 300;
const PHOTO_MAX = 12;
const TEXT_MAX = 2_000;
const MAX_BARS = 20;
const MAX_HEIGHT = 20_000;

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

function isText(value: unknown, max = TEXT_MAX): value is string {
  return typeof value === 'string' && value.length <= max;
}

function isOptionalText(value: unknown, max = TEXT_MAX): boolean {
  return value === undefined || isText(value, max);
}

function isPhoto(value: unknown): value is ArticlePhoto {
  return (
    isRecord(value) &&
    isText(value['id'], 200) &&
    isText(value['src'], 2_000) &&
    isText(value['alt']) &&
    isOptionalText(value['caption']) &&
    isOptionalText(value['credit'])
  );
}

function isBars(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value['items'])) return false;
  if (value['items'].length > MAX_BARS) return false;
  if (!isOptionalText(value['unit'])) return false;
  return value['items'].every(
    (item) =>
      isRecord(item) &&
      isText(item['id'], 200) &&
      isText(item['label']) &&
      typeof item['value'] === 'number' &&
      Number.isFinite(item['value']),
  );
}

/** Shape of a figure the preview can draw. Unknown kinds and malformed fields are refused. */
export function isPreviewFigure(value: unknown): value is ArticleFigure {
  if (!isRecord(value)) return false;
  switch (value['kind']) {
    case 'photo':
      return isPhoto(value['photo']);
    case 'photos':
      return (
        Array.isArray(value['photos']) &&
        value['photos'].length <= PHOTO_MAX &&
        value['photos'].every(isPhoto)
      );
    case 'diagram':
      return (
        isText(value['title']) &&
        isOptionalText(value['src'], 2_000) &&
        isOptionalText(value['alt']) &&
        isOptionalText(value['source']) &&
        (value['bars'] === undefined || isBars(value['bars']))
      );
    case 'chart':
      return (
        isText(value['tableId'], 64) &&
        (value['chartType'] === 'bar' || value['chartType'] === 'column') &&
        (value['series'] === 'total' || value['series'] === 'by_sex') &&
        isText(value['title']) &&
        isOptionalText(value['source'])
      );
    default:
      return false;
  }
}

function isChartTable(value: unknown): value is ChartTable {
  if (!isRecord(value) || !isText(value['id'], 64) || !Array.isArray(value['rows'])) return false;
  if (!isOptionalText(value['period'])) return false;
  const nullableNumber = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v));
  return value['rows'].every(
    (row) =>
      isRecord(row) &&
      isText(row['id'], 64) &&
      isText(row['label']) &&
      nullableNumber(row['male']) &&
      nullableNumber(row['female']) &&
      nullableNumber(row['total']),
  );
}

function isTables(value: unknown): value is Record<string, ChartTable> {
  return isRecord(value) && Object.values(value).every(isChartTable);
}

/**
 * The draft from the editor, or null when the message is not a well-formed preview payload. Any
 * field that is missing or of the wrong type makes the whole payload invalid.
 */
export function parsePreviewPayload(data: unknown): CeritaPreviewPayload | null {
  if (!isRecord(data) || data['type'] !== PREVIEW_MESSAGE.data) return null;
  const { title, body, chapterLabel, figure, tables } = data;
  if (!isText(title, TITLE_MAX) || !isText(body, BODY_MAX)) return null;
  if (!isText(chapterLabel, CHAPTER_LABEL_MAX)) return null;
  if (figure !== null && !isPreviewFigure(figure)) return null;
  const tableMap = tables === undefined ? {} : tables;
  if (!isTables(tableMap)) return null;
  return { title, body, chapterLabel, figure, tables: tableMap };
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
  if (height <= 0 || height > MAX_HEIGHT) return null;
  return Math.ceil(height);
}
