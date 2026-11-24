import { describe, expect, it } from 'vitest';
import {
  isPreviewReady,
  isTrustedMessage,
  parsePreviewHeight,
  parsePreviewPayload,
} from '../utils/ceritaPreviewMessage';

const ORIGIN = 'http://localhost:5193';
const MEDIA = '0f3e1c2a-1111-4222-8333-444455556666';

function draft(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'cerita-preview',
    title: 'Sebaran penduduk',
    body: 'Satu paragraf.\n\nDua paragraf.',
    chapterLabel: 'Bab 1 · Jumlah Penduduk',
    figure: null,
    tables: {},
    ...extra,
  };
}

describe('isTrustedMessage', () => {
  const parent = {} as Window;

  it('accepts a message from our origin and from the expected window', () => {
    expect(isTrustedMessage({ origin: ORIGIN, source: parent }, parent, ORIGIN)).toBe(true);
  });

  it('rejects a message from another origin, even from the right window', () => {
    expect(isTrustedMessage({ origin: 'https://evil.example', source: parent }, parent, ORIGIN)).toBe(
      false,
    );
  });

  it('rejects a message from another window of the same origin', () => {
    const other = {} as Window;
    expect(isTrustedMessage({ origin: ORIGIN, source: other }, parent, ORIGIN)).toBe(false);
  });

  it('rejects every message while the expected window is not known yet', () => {
    expect(isTrustedMessage({ origin: ORIGIN, source: null }, null, ORIGIN)).toBe(false);
  });
});

describe('parsePreviewPayload', () => {
  it('reads a well-formed draft with a photo figure and tables', () => {
    const parsed = parsePreviewPayload(
      draft({
        figure: {
          kind: 'photo',
          photo: { id: '/api/media/x', src: 'blob:http://localhost/1', alt: 'Balai' },
        },
        tables: {
          't-1': {
            id: 't-1',
            rows: [{ id: 'r', label: '0-4', male: 1, female: null, total: 1 }],
          },
        },
      }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.title).toBe('Sebaran penduduk');
    expect(parsed?.figure?.kind).toBe('photo');
    expect(Object.keys(parsed?.tables ?? {})).toEqual(['t-1']);
  });

  it('accepts a section with no figure', () => {
    expect(parsePreviewPayload(draft({ figure: null }))?.figure).toBeNull();
  });

  it('refuses a payload of another message type or a non-object', () => {
    expect(parsePreviewPayload(draft({ type: 'other' }))).toBeNull();
    expect(parsePreviewPayload('cerita-preview')).toBeNull();
    expect(parsePreviewPayload(null)).toBeNull();
  });

  it('refuses a payload whose text fields have the wrong type or are too long', () => {
    expect(parsePreviewPayload(draft({ title: 42 }))).toBeNull();
    expect(parsePreviewPayload(draft({ body: 'x'.repeat(50_001) }))).toBeNull();
    expect(parsePreviewPayload(draft({ chapterLabel: undefined }))).toBeNull();
  });

  it('refuses a figure of an unknown kind or with a malformed photo', () => {
    expect(parsePreviewPayload(draft({ figure: { kind: 'video' } }))).toBeNull();
    expect(
      parsePreviewPayload(draft({ figure: { kind: 'photo', photo: { id: 'a', src: 1, alt: 'x' } } })),
    ).toBeNull();
  });

  it('refuses a chart with a bad chart type, series or table', () => {
    const chart = { kind: 'chart', tableId: 't-1', chartType: 'pie', series: 'total', title: 'x' };
    expect(parsePreviewPayload(draft({ figure: chart }))).toBeNull();
    expect(
      parsePreviewPayload(draft({ figure: { ...chart, chartType: 'bar', series: 'sum' } })),
    ).toBeNull();
    expect(
      parsePreviewPayload(draft({ tables: { 't-1': { id: 't-1', rows: 'nope' } } })),
    ).toBeNull();
  });

  it('refuses a table row with a non-numeric value', () => {
    const tables = {
      't-1': { id: 't-1', rows: [{ id: 'r', label: 'a', male: 'x', female: 1, total: 1 }] },
    };
    expect(parsePreviewPayload(draft({ tables }))).toBeNull();
  });

  it('refuses a photo group above the photo limit', () => {
    const photos = Array.from({ length: 13 }, (_, i) => ({
      id: `p${i}`,
      src: `/api/media/${MEDIA}`,
      alt: 'Foto',
    }));
    expect(parsePreviewPayload(draft({ figure: { kind: 'photos', photos } }))).toBeNull();
  });
});

describe('isPreviewReady and parsePreviewHeight', () => {
  it('recognises the ready message only', () => {
    expect(isPreviewReady({ type: 'cerita-preview-ready' })).toBe(true);
    expect(isPreviewReady({ type: 'cerita-preview-height', height: 10 })).toBe(false);
    expect(isPreviewReady('cerita-preview-ready')).toBe(false);
  });

  it('reads a height in a sensible range and rounds it up', () => {
    expect(parsePreviewHeight({ type: 'cerita-preview-height', height: 412.2 })).toBe(413);
  });

  it('refuses zero, negative, infinite, oversized and non-numeric heights', () => {
    const at = (height: unknown) => parsePreviewHeight({ type: 'cerita-preview-height', height });
    expect(at(0)).toBeNull();
    expect(at(-5)).toBeNull();
    expect(at(Number.POSITIVE_INFINITY)).toBeNull();
    expect(at(1_000_000)).toBeNull();
    expect(at('480')).toBeNull();
  });
});
