import { vi } from 'vitest';
import type { ContentBlock } from '../stores/contentBlocks.store';

/**
 * In-memory stand-in for the Cerita authoring API, shared by the `/admin/cerita` specs. It models
 * what the screen relies on: ordered siblings, `expectedUpdatedAt` tokens (STALE_WRITE on
 * mismatch), the HAS_DEPENDENTS refusal, and the figure endpoints of the Wave 4 contract.
 */

export interface FakeSection {
  id: string;
  slug: string;
  title: string | null;
  sortOrder: number;
  updatedAt: string;
}
export interface FakeChapter {
  id: string;
  slug: string;
  number: string | null;
  title: string;
  sortOrder: number;
  updatedAt: string;
  sections: FakeSection[];
}
export interface FakePage {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
  updatedAt: string;
  createdAt: string;
  chapters: FakeChapter[];
}

export interface RecordedRequest {
  method: string;
  url: string;
  body: unknown;
}

function json(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => structuredClone(body),
  } as Response;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function createFakeCerita() {
  let clock = 0;
  let counter = 0;
  const stamp = (): string => new Date(Date.UTC(2026, 10, 13, 10, 0, ++clock)).toISOString();
  const nextId = (prefix: string): string => `${prefix}-${++counter}`;

  const pages: FakePage[] = [];
  const blocks: ContentBlock[] = [];
  const requests: RecordedRequest[] = [];
  /** First matching override answers instead of the model, once. */
  const overrides: Array<{ match: (r: RecordedRequest) => boolean; response: Response }> = [];

  function addPage(
    title: string,
    chapters: Array<{ title: string; sections?: string[] }> = [],
  ): FakePage {
    const page: FakePage = {
      id: nextId('page'),
      slug: slugify(title),
      title,
      sortOrder: pages.length,
      updatedAt: stamp(),
      createdAt: stamp(),
      chapters: [],
    };
    chapters.forEach((chapter, ci) => {
      const created: FakeChapter = {
        id: nextId('chap'),
        slug: slugify(chapter.title),
        number: null,
        title: chapter.title,
        sortOrder: ci,
        updatedAt: stamp(),
        sections: [],
      };
      (chapter.sections ?? []).forEach((sectionTitle, si) =>
        created.sections.push({
          id: nextId('sec'),
          slug: slugify(sectionTitle),
          title: sectionTitle,
          sortOrder: si,
          updatedAt: stamp(),
        }),
      );
      page.chapters.push(created);
    });
    pages.push(page);
    return page;
  }

  function addParagraph(sectionId: string, title: string, body: string): ContentBlock {
    const siblings = blocks.filter((b) => b.sectionId === sectionId && b.type === 'prose');
    const block: ContentBlock = {
      id: nextId('blk'),
      sectionId,
      type: 'prose',
      slug: `${slugify(title)}-${counter}`,
      title,
      body,
      metadata: null,
      sortOrder: siblings.length,
      updatedAt: stamp(),
    };
    blocks.push(block);
    return block;
  }

  function findSection(id: string) {
    for (const page of pages) {
      for (const chapter of page.chapters) {
        const section = chapter.sections.find((s) => s.id === id);
        if (section) return { page, chapter, section };
      }
    }
    return undefined;
  }
  function findChapter(id: string) {
    for (const page of pages) {
      const chapter = page.chapters.find((c) => c.id === id);
      if (chapter) return { page, chapter };
    }
    return undefined;
  }

  const stale = (current: string): Response =>
    json(
      {
        error: 'Data sudah diubah oleh pengguna lain.',
        code: 'STALE_WRITE',
        details: { currentUpdatedAt: current },
      },
      409,
    );
  const notFound = (): Response => json({ error: 'Tidak ditemukan' }, 404);

  /** Same shape as the server's answer: figures are counted apart from other content blocks. */
  function dependentsOf(sectionIds: string[]): { contentBlocks: number; figures: number } {
    const held = blocks.filter((b) => b.sectionId !== null && sectionIds.includes(b.sectionId));
    return {
      contentBlocks: held.filter((b) => b.type !== 'figure').length,
      figures: held.filter((b) => b.type === 'figure').length,
    };
  }
  const hasDependents = (c: { contentBlocks: number; figures: number }): boolean =>
    c.contentBlocks + c.figures > 0;
  const dependents = (counts: { contentBlocks: number; figures: number }): Response =>
    json(
      {
        error: 'Tidak dapat dihapus karena masih memiliki data terkait (blok konten: 1).',
        code: 'HAS_DEPENDENTS',
        details: { dependencies: { ...counts, indicators: 0, indicatorTables: 0 } },
      },
      409,
    );

  function reorder<T extends { id: string; sortOrder: number | null }>(
    siblings: T[],
    items: Array<{ id: string; sortOrder: number }>,
  ): Response | null {
    const ids = new Set(items.map((i) => i.id));
    const orders = new Set(items.map((i) => i.sortOrder));
    if (ids.size !== items.length || orders.size !== items.length || ids.size !== siblings.length) {
      return json({ error: 'Daftar urutan harus mencakup semua data.' }, 400);
    }
    for (const item of items) {
      const target = siblings.find((s) => s.id === item.id);
      if (!target) return notFound();
      target.sortOrder = item.sortOrder;
    }
    return null;
  }

  const sorted = <T extends { sortOrder: number | null }>(list: T[]): T[] =>
    [...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  function handle(request: RecordedRequest): Response {
    const { method } = request;
    const url = new URL(request.url, 'http://localhost');
    const path = url.pathname;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const token = url.searchParams.get('expectedUpdatedAt');
    let m: RegExpMatchArray | null;

    if (path === '/api/auth/csrf-token') return json({ csrfToken: 'csrf' });

    if (method === 'GET' && path === '/api/pages') {
      return json({
        pages: sorted(pages).map((p) => ({
          ...p,
          chapters: sorted(p.chapters).map((c) => ({ ...c, sections: sorted(c.sections) })),
        })),
        total: pages.length,
      });
    }
    if (method === 'GET' && path === '/api/content-blocks') return json({ blocks });

    if (method === 'POST' && path === '/api/pages') {
      const title = String(body['title'] ?? '').trim();
      const slug = slugify(title);
      if (pages.some((p) => p.slug === slug)) {
        return json({ error: `Slug halaman '${slug}' sudah digunakan` }, 409);
      }
      const page = addPage(title);
      return json(
        { page: { id: page.id, slug, title, sortOrder: page.sortOrder, chapterCount: 0 } },
        201,
      );
    }
    if (method === 'PUT' && path === '/api/pages/reorder') {
      const failure = reorder(pages, body['items'] as Array<{ id: string; sortOrder: number }>);
      if (failure) return failure;
      pages.forEach((p) => (p.updatedAt = stamp()));
      return json({ pages });
    }
    if ((m = path.match(/^\/api\/pages\/([^/]+)\/chapters\/reorder$/)) && method === 'PUT') {
      const page = pages.find((p) => p.slug === m![1]);
      if (!page) return notFound();
      if (body['expectedUpdatedAt'] !== page.updatedAt) return stale(page.updatedAt);
      const failure = reorder(
        page.chapters,
        body['items'] as Array<{ id: string; sortOrder: number }>,
      );
      if (failure) return failure;
      page.updatedAt = stamp();
      return json({ chapters: page.chapters, page: { id: page.id, updatedAt: page.updatedAt } });
    }
    if ((m = path.match(/^\/api\/pages\/([^/]+)\/chapters$/)) && method === 'POST') {
      const page = pages.find((p) => p.slug === m![1]);
      if (!page) return notFound();
      const title = String(body['title'] ?? '').trim();
      const chapter: FakeChapter = {
        id: nextId('chap'),
        slug: slugify(title),
        number: null,
        title,
        sortOrder: page.chapters.length,
        updatedAt: stamp(),
        sections: [],
      };
      page.chapters.push(chapter);
      page.updatedAt = stamp();
      return json({ chapter, page: { id: page.id, updatedAt: page.updatedAt } }, 201);
    }
    if ((m = path.match(/^\/api\/pages\/([^/]+)$/))) {
      const page = pages.find((p) => p.slug === m![1]);
      if (!page) return notFound();
      if (method === 'PATCH') {
        if (body['expectedUpdatedAt'] !== page.updatedAt) return stale(page.updatedAt);
        page.title = String(body['title']);
        page.updatedAt = stamp();
        return json({ page });
      }
      if (method === 'DELETE') {
        if (token !== page.updatedAt) return stale(page.updatedAt);
        const sectionIds = page.chapters.flatMap((c) => c.sections.map((s) => s.id));
        const count = dependentsOf(sectionIds);
        if (hasDependents(count)) return dependents(count);
        pages.splice(pages.indexOf(page), 1);
        return json({ page });
      }
    }
    if ((m = path.match(/^\/api\/chapters\/([^/]+)\/sections\/reorder$/)) && method === 'PUT') {
      const found = findChapter(m[1]!);
      if (!found) return notFound();
      if (body['expectedUpdatedAt'] !== found.chapter.updatedAt)
        return stale(found.chapter.updatedAt);
      const failure = reorder(
        found.chapter.sections,
        body['items'] as Array<{ id: string; sortOrder: number }>,
      );
      if (failure) return failure;
      found.chapter.updatedAt = stamp();
      return json({ sections: found.chapter.sections });
    }
    if ((m = path.match(/^\/api\/chapters\/([^/]+)\/sections$/)) && method === 'POST') {
      const found = findChapter(m[1]!);
      if (!found) return notFound();
      const title = String(body['title'] ?? '').trim();
      const section: FakeSection = {
        id: nextId('sec'),
        slug: slugify(title),
        title,
        sortOrder: found.chapter.sections.length,
        updatedAt: stamp(),
      };
      found.chapter.sections.push(section);
      found.chapter.updatedAt = stamp();
      return json(
        { section, chapter: { id: found.chapter.id, updatedAt: found.chapter.updatedAt } },
        201,
      );
    }
    if ((m = path.match(/^\/api\/chapters\/([^/]+)$/))) {
      const found = findChapter(m[1]!);
      if (!found) return notFound();
      if (method === 'PATCH') {
        if (body['expectedUpdatedAt'] !== found.chapter.updatedAt)
          return stale(found.chapter.updatedAt);
        found.chapter.title = String(body['title']);
        found.chapter.updatedAt = stamp();
        return json({ chapter: found.chapter });
      }
      if (method === 'DELETE') {
        if (token !== found.chapter.updatedAt) return stale(found.chapter.updatedAt);
        const count = dependentsOf(found.chapter.sections.map((s) => s.id));
        if (hasDependents(count)) return dependents(count);
        found.page.chapters.splice(found.page.chapters.indexOf(found.chapter), 1);
        found.page.updatedAt = stamp();
        return json({ chapter: found.chapter });
      }
    }
    if (
      (m = path.match(/^\/api\/sections\/([^/]+)\/content-blocks\/reorder$/)) &&
      method === 'PUT'
    ) {
      const found = findSection(m[1]!);
      if (!found) return notFound();
      if (body['expectedUpdatedAt'] !== found.section.updatedAt)
        return stale(found.section.updatedAt);
      const siblings = blocks.filter((b) => b.sectionId === found.section.id && b.type === 'prose');
      const failure = reorder(siblings, body['items'] as Array<{ id: string; sortOrder: number }>);
      if (failure) return failure;
      found.section.updatedAt = stamp();
      return json({
        blocks: siblings,
        section: { id: found.section.id, updatedAt: found.section.updatedAt },
      });
    }
    if ((m = path.match(/^\/api\/sections\/([^/]+)\/content-blocks$/)) && method === 'POST') {
      const found = findSection(m[1]!);
      if (!found) return notFound();
      const block = addParagraph(found.section.id, String(body['title']), String(body['body']));
      found.section.updatedAt = stamp();
      return json(
        { block, section: { id: found.section.id, updatedAt: found.section.updatedAt } },
        201,
      );
    }
    if ((m = path.match(/^\/api\/sections\/([^/]+)\/figure$/))) {
      const found = findSection(m[1]!);
      if (!found) return notFound();
      const existing = blocks.find((b) => b.sectionId === found.section.id && b.type === 'figure');
      if (method === 'PUT') {
        if (body['expectedUpdatedAt'] !== found.section.updatedAt)
          return stale(found.section.updatedAt);
        const figure = body['figure'] as Record<string, unknown>;
        if (existing) {
          existing.metadata = figure;
          existing.updatedAt = stamp();
        } else {
          blocks.push({
            id: nextId('blk'),
            sectionId: found.section.id,
            type: 'figure',
            slug: `figure-${found.section.id}`,
            title: null,
            body: '',
            metadata: figure,
            sortOrder: null,
            updatedAt: stamp(),
          });
        }
        found.section.updatedAt = stamp();
        return json({
          block: existing ?? blocks[blocks.length - 1],
          section: { id: found.section.id, updatedAt: found.section.updatedAt },
        });
      }
      if (method === 'DELETE') {
        if (token !== found.section.updatedAt) return stale(found.section.updatedAt);
        if (!existing)
          return json({ error: 'Gambar tidak ditemukan', code: 'FIGURE_NOT_FOUND' }, 404);
        blocks.splice(blocks.indexOf(existing), 1);
        found.section.updatedAt = stamp();
        return json({ section: { id: found.section.id, updatedAt: found.section.updatedAt } });
      }
    }
    if ((m = path.match(/^\/api\/sections\/([^/]+)$/))) {
      const found = findSection(m[1]!);
      if (!found) return notFound();
      if (method === 'PATCH') {
        if (body['expectedUpdatedAt'] !== found.section.updatedAt)
          return stale(found.section.updatedAt);
        found.section.title = String(body['title']);
        found.section.updatedAt = stamp();
        return json({ section: found.section });
      }
      if (method === 'DELETE') {
        if (token !== found.section.updatedAt) return stale(found.section.updatedAt);
        const count = dependentsOf([found.section.id]);
        if (hasDependents(count)) return dependents(count);
        found.chapter.sections.splice(found.chapter.sections.indexOf(found.section), 1);
        found.chapter.updatedAt = stamp();
        return json({ section: found.section });
      }
    }
    if ((m = path.match(/^\/api\/content-blocks\/([^/]+)$/))) {
      const block = blocks.find((b) => b.slug === m![1]);
      if (!block) return notFound();
      if (method === 'PATCH') {
        if (body['expectedUpdatedAt'] !== block.updatedAt) return stale(block.updatedAt);
        block.title = (body['title'] as string | null) ?? null;
        block.body = String(body['body']);
        block.updatedAt = stamp();
        return json({ block });
      }
      if (method === 'DELETE') {
        if (token !== block.updatedAt) return stale(block.updatedAt);
        blocks.splice(blocks.indexOf(block), 1);
        const found = block.sectionId ? findSection(block.sectionId) : undefined;
        if (found) found.section.updatedAt = stamp();
        return json({ block });
      }
    }
    if (method === 'POST' && path === '/api/media') {
      const id = nextId('media');
      return json(
        {
          media: {
            id,
            kind: 'photo',
            mimeType: 'image/webp',
            byteSize: 100,
            width: 10,
            height: 10,
            originalName: 'foto.jpg',
            previewUrl: `/api/media/${id}/preview`,
          },
        },
        201,
      );
    }
    throw new Error(`unexpected fetch: ${method} ${request.url}`);
  }

  function install(): void {
    globalThis.fetch = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.endsWith('/preview')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          blob: async () => new Blob(['i'], { type: 'image/webp' }),
        } as Response;
      }
      let body: unknown;
      if (typeof init?.body === 'string') body = JSON.parse(init.body);
      else if (init?.body instanceof FormData) body = init.body;
      const request: RecordedRequest = { method, url, body };
      if (url !== '/api/auth/csrf-token') requests.push(request);
      const index = overrides.findIndex((o) => o.match(request));
      if (index >= 0) return overrides.splice(index, 1)[0]!.response;
      return handle(request);
    }) as typeof fetch;
  }

  return {
    pages,
    blocks,
    requests,
    addPage,
    addParagraph,
    findSection,
    install,
    /** The next request matching `match` answers with `response` instead of the model. */
    failNext(match: (r: RecordedRequest) => boolean, response: Response): void {
      overrides.push({ match, response });
    },
    /** Simulates another editor saving: bumps the token without the screen knowing. */
    touchSection(id: string): void {
      const found = findSection(id);
      if (found) found.section.updatedAt = stamp();
    },
    touchChapter(id: string): void {
      const found = findChapter(id);
      if (found) found.chapter.updatedAt = stamp();
    },
    /** Simulates another editor replacing the section's figure (figure block and section token). */
    changeFigureByOther(sectionId: string, figure: Record<string, unknown>): void {
      const found = findSection(sectionId);
      if (!found) return;
      const existing = blocks.find((b) => b.sectionId === sectionId && b.type === 'figure');
      if (existing) {
        existing.metadata = figure;
        existing.updatedAt = stamp();
      } else {
        blocks.push({
          id: nextId('blk'),
          sectionId,
          type: 'figure',
          slug: `figure-${sectionId}`,
          title: null,
          body: '',
          metadata: figure,
          sortOrder: null,
          updatedAt: stamp(),
        });
      }
      found.section.updatedAt = stamp();
    },
    touchPage(slug: string): void {
      const page = pages.find((p) => p.slug === slug);
      if (page) page.updatedAt = stamp();
    },
    touchBlock(slug: string): void {
      const block = blocks.find((b) => b.slug === slug);
      if (block) block.updatedAt = stamp();
    },
    writes(): RecordedRequest[] {
      return requests.filter((r) => r.method !== 'GET');
    },
    lastWrite(): RecordedRequest | undefined {
      const written = requests.filter((r) => r.method !== 'GET');
      return written[written.length - 1];
    },
    json,
  };
}

export type FakeCerita = ReturnType<typeof createFakeCerita>;
