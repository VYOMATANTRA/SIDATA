import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  deleteSectionFigure,
  figureFromBlock,
  saveSectionFigure,
} from '../services/ceritaFigure.service';
import type { ContentBlock } from '../stores/contentBlocks.store';
import { useAuthStore } from '../stores/auth';

function block(metadata: Record<string, unknown> | null, type = 'figure'): ContentBlock {
  return {
    id: 'b1',
    sectionId: 's1',
    type,
    slug: 'figure-s1',
    title: null,
    body: '',
    metadata,
    sortOrder: null,
    updatedAt: '2026-11-13T10:00:00.000Z',
  };
}

describe('figureFromBlock', () => {
  it('reads a photo, dropping empty caption and credit', () => {
    expect(
      figureFromBlock(
        block({
          kind: 'photo',
          photos: [{ mediaId: 'm1', alt: 'Balai', caption: '', credit: 'Tim' }],
        }),
      ),
    ).toEqual({ kind: 'photo', photos: [{ mediaId: 'm1', alt: 'Balai', credit: 'Tim' }] });
  });

  it('reads several photos in stored order', () => {
    const figure = figureFromBlock(
      block({
        kind: 'photos',
        photos: [
          { mediaId: 'm1', alt: 'a' },
          { mediaId: 'm2', alt: 'b' },
        ],
      }),
    );
    expect(figure).toMatchObject({ kind: 'photos' });
    expect(figure && figure.kind === 'photos' && figure.photos.map((p) => p.mediaId)).toEqual([
      'm1',
      'm2',
    ]);
  });

  it('reads a diagram with an image and bars', () => {
    expect(
      figureFromBlock(
        block({
          kind: 'diagram',
          title: 'Penduduk',
          source: 'BPS',
          image: { mediaId: 'm1', alt: 'Diagram' },
          bars: { unit: 'jiwa', items: [{ label: 'RT 1', value: 10 }] },
        }),
      ),
    ).toEqual({
      kind: 'diagram',
      title: 'Penduduk',
      source: 'BPS',
      image: { mediaId: 'm1', alt: 'Diagram' },
      bars: { unit: 'jiwa', items: [{ label: 'RT 1', value: 10 }] },
    });
  });

  it('returns null for anything that is not a readable figure', () => {
    expect(figureFromBlock(null)).toBeNull();
    expect(figureFromBlock(block(null))).toBeNull();
    expect(figureFromBlock(block({ kind: 'photo', photos: [] }))).toBeNull();
    expect(figureFromBlock(block({ kind: 'mystery' }))).toBeNull();
    expect(figureFromBlock(block({ kind: 'diagram' }))).toBeNull();
    expect(
      figureFromBlock(block({ kind: 'photo', photos: [{ mediaId: 'm' }] }, 'prose')),
    ).toBeNull();
  });
});

describe('figure writes', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useAuthStore().setAuth({ id: 'u', email: 'e@example.com', role: 'editor' }, 't');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends the section token with PUT and DELETE', async () => {
    const calls: Array<{ method?: string; url: string; body?: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input, init) => {
        if (String(input) === '/api/auth/csrf-token') {
          return { ok: true, status: 200, json: async () => ({ csrfToken: 'c' }) } as Response;
        }
        calls.push({ method: init?.method, url: String(input), body: init?.body });
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      }),
    );

    await saveSectionFigure('sec 1', '2026-11-13T10:00:00.000Z', {
      kind: 'photo',
      photos: [{ mediaId: 'm1', alt: 'Balai' }],
    });
    await deleteSectionFigure('sec 1', '2026-11-13T10:00:00.000Z');

    expect(calls[0]).toMatchObject({ method: 'PUT', url: '/api/sections/sec%201/figure' });
    expect(JSON.parse(calls[0]!.body as string)).toEqual({
      expectedUpdatedAt: '2026-11-13T10:00:00.000Z',
      figure: { kind: 'photo', photos: [{ mediaId: 'm1', alt: 'Balai' }] },
    });
    expect(calls[1]).toMatchObject({
      method: 'DELETE',
      url: '/api/sections/sec%201/figure?expectedUpdatedAt=2026-11-13T10%3A00%3A00.000Z',
    });
  });
});

describe('figureFromBlock shared credit', () => {
  const photos = [
    { mediaId: 'm1', alt: 'a' },
    { mediaId: 'm2', alt: 'b', credit: 'Own' },
  ];

  it('reads the group credit of a photo group and keeps each photo as stored', () => {
    expect(figureFromBlock(block({ kind: 'photos', credit: 'Tim', photos }))).toEqual({
      kind: 'photos',
      credit: 'Tim',
      photos: [
        { mediaId: 'm1', alt: 'a' },
        { mediaId: 'm2', alt: 'b', credit: 'Own' },
      ],
    });
  });

  it('drops a blank or non-text group credit', () => {
    expect(figureFromBlock(block({ kind: 'photos', credit: ' ', photos }))).toEqual({
      kind: 'photos',
      photos: [
        { mediaId: 'm1', alt: 'a' },
        { mediaId: 'm2', alt: 'b', credit: 'Own' },
      ],
    });
    expect(figureFromBlock(block({ kind: 'photos', credit: 7, photos }))).not.toHaveProperty(
      'credit',
    );
  });

  it('does not read a group credit on a single photo', () => {
    expect(
      figureFromBlock(
        block({ kind: 'photo', credit: 'Tim', photos: [{ mediaId: 'm1', alt: 'a' }] }),
      ),
    ).toEqual({ kind: 'photo', photos: [{ mediaId: 'm1', alt: 'a' }] });
  });
});

describe('saveSectionFigure shared credit', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useAuthStore().setAuth({ id: 'u', email: 'e@example.com', role: 'editor' }, 't');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends the group credit with the photo group', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input, init) => {
        if (String(input) === '/api/auth/csrf-token') {
          return { ok: true, status: 200, json: async () => ({ csrfToken: 'c' }) } as Response;
        }
        bodies.push(init?.body);
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      }),
    );
    await saveSectionFigure('s1', '2026-11-13T10:00:00.000Z', {
      kind: 'photos',
      credit: 'Tim Survei',
      photos: [
        { mediaId: 'm1', alt: 'a' },
        { mediaId: 'm2', alt: 'b' },
      ],
    });
    expect(JSON.parse(bodies[0] as string).figure).toEqual({
      kind: 'photos',
      credit: 'Tim Survei',
      photos: [
        { mediaId: 'm1', alt: 'a' },
        { mediaId: 'm2', alt: 'b' },
      ],
    });
  });
});
