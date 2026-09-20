import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Request, Response } from 'express';
import {
  getContentBlocksHandler,
  getContentBlockBySlugHandler,
  updateContentBlockHandler,
} from '../controllers/contentBlocks.controller.js';
import {
  getAllContentBlocks,
  getContentBlockBySlug,
  invalidateContentBlocksCache,
  contentBlocksCache,
} from '../services/contentBlocks.service.js';
import prisma from '../utils/prisma.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { fakeRes } from './helpers/fakeRes.js';

function makeReq(overrides: Record<string, unknown> = {}): AuthRequest {
  const req: Record<string, unknown> = {
    body: {},
    params: {},
    user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'TestAgent/1.0' },
    ...overrides,
  };
  if ('user' in overrides && overrides['user'] === undefined) {
    delete req['user'];
  }
  return req as unknown as AuthRequest;
}

/* =========================================================================
 * 1. GET ALL CONTENT BLOCKS
 * "Test the happy path last" — error handling, boundary conditions & resilience first
 * ========================================================================= */

describe('contentBlocks.controller getContentBlocksHandler', () => {
  it('returns 500 when database findMany throws an unhandled error', async () => {
    invalidateContentBlocksCache();
    const originalFindMany = prisma.contentBlock.findMany;
    prisma.contentBlock.findMany = (async () => {
      throw new Error('Database connection failure');
    }) as unknown as typeof prisma.contentBlock.findMany;

    try {
      const res = fakeRes();
      await getContentBlocksHandler({} as Request, res as unknown as Response);

      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { error: 'Terjadi kesalahan internal server' });
    } finally {
      prisma.contentBlock.findMany = originalFindMany;
      invalidateContentBlocksCache();
    }
  });

  it('returns empty array when no content blocks exist in DB', async () => {
    invalidateContentBlocksCache();
    const originalFindMany = prisma.contentBlock.findMany;
    prisma.contentBlock.findMany =
      (async () => []) as unknown as typeof prisma.contentBlock.findMany;

    try {
      const res = fakeRes();
      await getContentBlocksHandler({} as Request, res as unknown as Response);

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { blocks: [] });
    } finally {
      prisma.contentBlock.findMany = originalFindMany;
      invalidateContentBlocksCache();
    }
  });

  it('returns list of content blocks and serves cached data on second call', async () => {
    invalidateContentBlocksCache();
    let queryCount = 0;
    const originalFindMany = prisma.contentBlock.findMany;

    prisma.contentBlock.findMany = (async () => {
      queryCount++;
      return [
        {
          id: 'block-1',
          sectionId: null,
          type: 'hero',
          slug: 'landing-hero',
          title: 'Hero Title',
          body: 'Hero Body',
          metadata: { badge: 'Test' },
          sortOrder: null,
          updatedById: null,
          createdAt: new Date('2026-09-01'),
          updatedAt: new Date('2026-09-01'),
        },
      ];
    }) as unknown as typeof prisma.contentBlock.findMany;

    try {
      const res1 = fakeRes();
      await getContentBlocksHandler({} as Request, res1 as unknown as Response);
      assert.equal(res1.status, 200);
      assert.equal(queryCount, 1);

      // Second call must hit memory cache
      const res2 = fakeRes();
      await getContentBlocksHandler({} as Request, res2 as unknown as Response);
      assert.equal(res2.status, 200);
      assert.equal(queryCount, 1);
    } finally {
      prisma.contentBlock.findMany = originalFindMany;
      invalidateContentBlocksCache();
    }
  });

  it('preserves cache immutability against caller mutation via structuredClone', async () => {
    invalidateContentBlocksCache();
    const originalFindMany = prisma.contentBlock.findMany;

    prisma.contentBlock.findMany = (async () => [
      {
        id: 'block-immutable',
        sectionId: null,
        type: 'hero',
        slug: 'landing-hero',
        title: 'Original Title',
        body: 'Original Body',
        metadata: { badge: 'Original' },
        sortOrder: null,
        updatedById: null,
        createdAt: new Date('2026-09-01'),
        updatedAt: new Date('2026-09-01'),
      },
    ]) as unknown as typeof prisma.contentBlock.findMany;

    try {
      const first = await getAllContentBlocks();
      assert.equal(first[0]?.title, 'Original Title');

      // Attempt to mutate the returned object
      first[0]!.title = 'Hacked Title';
      if (first[0]?.metadata) {
        first[0]!.metadata['badge'] = 'Hacked';
      }

      // Second call must not reflect caller's in-place mutation
      const second = await getAllContentBlocks();
      assert.equal(second[0]?.title, 'Original Title');
      assert.equal(second[0]?.metadata?.['badge'], 'Original');
    } finally {
      prisma.contentBlock.findMany = originalFindMany;
      invalidateContentBlocksCache();
    }
  });

  it('anti-race: does not populate cache if cache was invalidated while async DB query was in-flight', async () => {
    invalidateContentBlocksCache();
    const originalFindMany = prisma.contentBlock.findMany;

    let resolveQuery: (val: unknown) => void;
    const queryPromise = new Promise((resolve) => {
      resolveQuery = resolve;
    });

    prisma.contentBlock.findMany = (() =>
      queryPromise) as unknown as typeof prisma.contentBlock.findMany;

    try {
      // Start in-flight query
      const fetchPromise = getAllContentBlocks();

      // Concurrently invalidate cache while query is pending
      invalidateContentBlocksCache();

      // Now resolve the in-flight query with stale data
      resolveQuery!([
        {
          id: 'block-stale',
          sectionId: null,
          type: 'hero',
          slug: 'landing-hero',
          title: 'Stale Title',
          body: 'Stale Body',
          metadata: null,
          sortOrder: null,
          updatedById: null,
          createdAt: new Date('2026-09-01'),
          updatedAt: new Date('2026-09-01'),
        },
      ]);

      const result = await fetchPromise;
      assert.equal(result[0]?.title, 'Stale Title');

      // Subsequent query must NOT hit cache; it must re-query DB
      let reQueryCalled = false;
      prisma.contentBlock.findMany = (async () => {
        reQueryCalled = true;
        return [];
      }) as unknown as typeof prisma.contentBlock.findMany;

      await getAllContentBlocks();
      assert.equal(reQueryCalled, true);
    } finally {
      prisma.contentBlock.findMany = originalFindMany;
      invalidateContentBlocksCache();
    }
  });

  it('enforces client isolation: transaction client bypasses cache and never populates shared cache', async () => {
    invalidateContentBlocksCache();
    const originalFindMany = prisma.contentBlock.findMany;

    // 1. Warm cache with root prisma client
    prisma.contentBlock.findMany = (async () => [
      {
        id: 'root-block',
        sectionId: null,
        type: 'hero',
        slug: 'landing-hero',
        title: 'Committed Root Title',
        body: 'Committed Body',
        metadata: null,
        sortOrder: null,
        updatedById: null,
        createdAt: new Date('2026-09-01'),
        updatedAt: new Date('2026-09-01'),
      },
    ]) as unknown as typeof prisma.contentBlock.findMany;

    try {
      const initial = await getAllContentBlocks();
      assert.equal(initial[0]?.title, 'Committed Root Title');

      // 2. Query with mock transaction client containing uncommitted data
      const mockTxClient = {
        contentBlock: {
          findMany: async () => [
            {
              id: 'tx-block',
              sectionId: null,
              type: 'hero',
              slug: 'landing-hero',
              title: 'Uncommitted Transaction Title',
              body: 'Uncommitted Body',
              metadata: null,
              sortOrder: null,
              updatedById: null,
              createdAt: new Date('2026-09-01'),
              updatedAt: new Date('2026-09-01'),
            },
          ],
        },
      };

      // Calling with tx client must bypass warm root cache and return uncommitted tx data
      const txResult = await getAllContentBlocks(mockTxClient as unknown as typeof prisma);
      assert.equal(txResult[0]?.title, 'Uncommitted Transaction Title');

      // Subsequent call with default root client must STILL return committed root data, NOT uncommitted tx data
      const subsequentRoot = await getAllContentBlocks();
      assert.equal(subsequentRoot[0]?.title, 'Committed Root Title');
    } finally {
      prisma.contentBlock.findMany = originalFindMany;
      invalidateContentBlocksCache();
    }
  });

  it('cold cache isolation: transactional read on cold cache does not warm the shared cache', async () => {
    invalidateContentBlocksCache();
    const mockTxClient = {
      contentBlock: {
        findMany: async () => [
          {
            id: 'tx-block-2',
            sectionId: null,
            type: 'hero',
            slug: 'landing-hero',
            title: 'Uncommitted Cold Title',
            body: 'Uncommitted Body',
            metadata: null,
            sortOrder: null,
            updatedById: null,
            createdAt: new Date('2026-09-01'),
            updatedAt: new Date('2026-09-01'),
          },
        ],
      },
    };

    const txResult = await getAllContentBlocks(mockTxClient as unknown as typeof prisma);
    assert.equal(txResult[0]?.title, 'Uncommitted Cold Title');

    // Shared cache must remain cold (null)
    assert.equal(contentBlocksCache.get(prisma), null);
  });
});

/* =========================================================================
 * 2. GET CONTENT BLOCK BY SLUG
 * ========================================================================= */

describe('contentBlocks.controller getContentBlockBySlugHandler', () => {
  it('returns 500 when database findUnique throws an error', async () => {
    invalidateContentBlocksCache();
    const originalFindUnique = prisma.contentBlock.findUnique;
    prisma.contentBlock.findUnique = (async () => {
      throw new Error('Database read failed');
    }) as unknown as typeof prisma.contentBlock.findUnique;

    try {
      const res = fakeRes();
      const req = { params: { slug: 'landing-hero' } } as unknown as Request;
      await getContentBlockBySlugHandler(req, res as unknown as Response);

      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { error: 'Terjadi kesalahan internal server' });
    } finally {
      prisma.contentBlock.findUnique = originalFindUnique;
      invalidateContentBlocksCache();
    }
  });

  it('returns 404 when slug does not exist or has invalid format', async () => {
    invalidateContentBlocksCache();
    const originalFindUnique = prisma.contentBlock.findUnique;
    prisma.contentBlock.findUnique = (async () =>
      null) as unknown as typeof prisma.contentBlock.findUnique;

    try {
      const res = fakeRes();
      const req = { params: { slug: 'nonexistent-block' } } as unknown as Request;
      await getContentBlockBySlugHandler(req, res as unknown as Response);

      assert.equal(res.status, 404);
      assert.deepEqual(res.body, {
        error: "Blok konten dengan slug 'nonexistent-block' tidak ditemukan",
      });
    } finally {
      prisma.contentBlock.findUnique = originalFindUnique;
      invalidateContentBlocksCache();
    }
  });

  it('returns 404 for malformed slug with spaces, uppercase, or special characters', async () => {
    const res = fakeRes();
    const req = { params: { slug: 'INVALID SLUG!' } } as unknown as Request;
    await getContentBlockBySlugHandler(req, res as unknown as Response);

    assert.equal(res.status, 404);
  });

  it('returns block data when slug exists', async () => {
    invalidateContentBlocksCache();
    const originalFindUnique = prisma.contentBlock.findUnique;
    prisma.contentBlock.findUnique = (async () => ({
      id: 'block-1',
      sectionId: null,
      type: 'hero',
      slug: 'landing-hero',
      title: 'Hero Title',
      body: 'Hero Body',
      metadata: { badge: 'Test' },
      sortOrder: null,
      updatedById: null,
      createdAt: new Date('2026-09-01'),
      updatedAt: new Date('2026-09-01'),
    })) as unknown as typeof prisma.contentBlock.findUnique;

    try {
      const res = fakeRes();
      const req = { params: { slug: 'landing-hero' } } as unknown as Request;
      await getContentBlockBySlugHandler(req, res as unknown as Response);

      assert.equal(res.status, 200);
      const body = res.body as { block: { slug: string; title: string } };
      assert.equal(body.block.slug, 'landing-hero');
      assert.equal(body.block.title, 'Hero Title');
    } finally {
      prisma.contentBlock.findUnique = originalFindUnique;
      invalidateContentBlocksCache();
    }
  });

  it('enforces client isolation: transaction client bypasses cache and queries client directly', async () => {
    invalidateContentBlocksCache();
    const originalFindMany = prisma.contentBlock.findMany;

    // Warm cache with root prisma client
    prisma.contentBlock.findMany = (async () => [
      {
        id: 'block-root',
        sectionId: null,
        type: 'hero',
        slug: 'landing-hero',
        title: 'Committed Hero Title',
        body: 'Committed Body',
        metadata: null,
        sortOrder: null,
        updatedById: null,
        createdAt: new Date('2026-09-01'),
        updatedAt: new Date('2026-09-01'),
      },
    ]) as unknown as typeof prisma.contentBlock.findMany;

    try {
      await getAllContentBlocks(); // Warms contentBlocksCache

      const mockTxClient = {
        contentBlock: {
          findUnique: async () => ({
            id: 'block-tx',
            sectionId: null,
            type: 'hero',
            slug: 'landing-hero',
            title: 'Uncommitted Tx Hero Title',
            body: 'Uncommitted Body',
            metadata: null,
            sortOrder: null,
            updatedById: null,
            createdAt: new Date('2026-09-01'),
            updatedAt: new Date('2026-09-01'),
          }),
        },
      };

      // Tx client must bypass warm cache and return uncommitted tx record
      const txBlock = await getContentBlockBySlug(
        'landing-hero',
        mockTxClient as unknown as typeof prisma,
      );
      assert.equal(txBlock?.title, 'Uncommitted Tx Hero Title');

      // Root client still reads from warm cache with committed title
      const rootBlock = await getContentBlockBySlug('landing-hero');
      assert.equal(rootBlock?.title, 'Committed Hero Title');
    } finally {
      prisma.contentBlock.findMany = originalFindMany;
      invalidateContentBlocksCache();
    }
  });
});

/* =========================================================================
 * 3. UPDATE CONTENT BLOCK (PATCH /api/content-blocks/:slug)
 * Exhaustive boundary, security & race-condition verification
 * ========================================================================= */

describe('contentBlocks.controller updateContentBlockHandler', () => {
  it('returns 401 when actor is missing from request', async () => {
    const res = fakeRes();
    const req = makeReq({ user: undefined, params: { slug: 'landing-hero' } });
    await updateContentBlockHandler(req, res as unknown as Response);

    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'Akses ditolak. Pengguna belum terautentikasi.' });
  });

  it('returns 400 when slug has invalid format (uppercase, spaces, double hyphens)', async () => {
    const invalidSlugs = ['Landing-Hero', 'landing hero', 'landing--hero', '-hero', 'hero-'];
    for (const badSlug of invalidSlugs) {
      const res = fakeRes();
      const req = makeReq({
        params: { slug: badSlug },
        body: { title: 'New Title' },
      });
      await updateContentBlockHandler(req, res as unknown as Response);

      assert.equal(res.status, 400);
      assert.match((res.body as { error: string }).error, /Format slug tidak valid/);
    }
  });

  it('returns 400 when payload is not an object (array, primitive, or null)', async () => {
    const invalidPayloads = [[], [1, 2, 3], null, 'string', 123];
    for (const badPayload of invalidPayloads) {
      const res = fakeRes();
      const req = makeReq({
        params: { slug: 'landing-hero' },
        body: badPayload as unknown as Record<string, unknown>,
      });
      await updateContentBlockHandler(req, res as unknown as Response);

      assert.equal(res.status, 400);
      assert.match((res.body as { error: string }).error, /harus berupa objek JSON/);
    }
  });

  it('returns 400 when payload contains unrecognized keys (.strict enforcement)', async () => {
    const res = fakeRes();
    const req = makeReq({
      params: { slug: 'landing-hero' },
      body: {
        title: 'Valid Title',
        unrecognizedField: 'malicious-injection',
        id: 'tamper-id',
      },
    });
    await updateContentBlockHandler(req, res as unknown as Response);

    assert.equal(res.status, 400);
    assert.match(
      (res.body as { error: string }).error,
      /(?:Terdapat bidang yang tidak dikenali|Unrecognized keys)/,
    );
  });

  it('returns 400 when no fields are provided in update payload', async () => {
    const res = fakeRes();
    const req = makeReq({
      params: { slug: 'landing-hero' },
      body: {},
    });
    await updateContentBlockHandler(req, res as unknown as Response);

    assert.equal(res.status, 400);
    assert.match((res.body as { error: string }).error, /Setidaknya salah satu bidang/);
  });

  it('returns 400 when body content is empty or only whitespace', async () => {
    const whitespaceBodies = ['', '   ', '\t\n  '];
    for (const badBody of whitespaceBodies) {
      const res = fakeRes();
      const req = makeReq({
        params: { slug: 'landing-hero' },
        body: { body: badBody },
      });
      await updateContentBlockHandler(req, res as unknown as Response);

      assert.equal(res.status, 400);
      assert.match((res.body as { error: string }).error, /wajib diisi/);
    }
  });

  it('returns 400 when title exceeds 255 characters', async () => {
    const res = fakeRes();
    const req = makeReq({
      params: { slug: 'landing-hero' },
      body: { title: 'a'.repeat(256) },
    });
    await updateContentBlockHandler(req, res as unknown as Response);

    assert.equal(res.status, 400);
    assert.match((res.body as { error: string }).error, /maksimal 255/);
  });

  it('returns 400 when metadata contains prototype pollution attempts', async () => {
    const pollutedPayloads: Array<{ metadata: unknown }> = [
      { metadata: { __proto__: { polluted: true } } },
      { metadata: { constructor: { prototype: { admin: true } } } },
      { metadata: { prototype: { evil: true } } },
      { metadata: { nested: { deep: { __proto__: { hacked: true } } } } },
    ];

    for (const payload of pollutedPayloads) {
      const res = fakeRes();
      const req = makeReq({
        params: { slug: 'landing-hero' },
        body: payload as unknown as Record<string, unknown>,
      });
      await updateContentBlockHandler(req, res as unknown as Response);

      assert.equal(res.status, 400);
      assert.match(
        (res.body as { error: string }).error,
        /Metadata memuat properti yang tidak diizinkan/,
      );
    }
  });

  it('returns 404 when updating a block that does not exist in DB', async () => {
    invalidateContentBlocksCache();
    const originalTransaction = prisma.$transaction;
    prisma.$transaction = (async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const mockTx = {
        $queryRaw: async () => [],
        contentBlock: {
          findUnique: async () => null,
        },
      };
      return fn(mockTx as unknown as typeof prisma);
    }) as unknown as typeof prisma.$transaction;

    try {
      const res = fakeRes();
      const req = makeReq({
        params: { slug: 'nonexistent-block' },
        body: { title: 'New Title' },
      });
      await updateContentBlockHandler(req, res as unknown as Response);

      assert.equal(res.status, 404);
      assert.deepEqual(res.body, {
        error: "Blok konten dengan slug 'nonexistent-block' tidak ditemukan",
      });
    } finally {
      prisma.$transaction = originalTransaction;
      invalidateContentBlocksCache();
    }
  });

  it('updates content block, sanitizes empty title to null, records diff in audit log, and invalidates cache', async () => {
    invalidateContentBlocksCache();
    const originalTransaction = prisma.$transaction;

    let updatedData: Record<string, unknown> | null = null;
    let auditEntry: unknown = null;

    const existingBlock = {
      id: 'uuid-hero-1',
      sectionId: null,
      type: 'hero',
      slug: 'landing-hero',
      title: 'Judul Lama',
      body: 'Konten Lama',
      metadata: { badge: 'Lama' },
      sortOrder: null,
      updatedById: null,
      createdAt: new Date('2026-09-01'),
      updatedAt: new Date('2026-09-01'),
    };

    prisma.$transaction = (async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const mockTx = {
        $queryRaw: async () => [],
        contentBlock: {
          findUnique: async () => existingBlock,
          update: async (args: { data: Record<string, unknown> }) => {
            updatedData = args.data;
            return {
              ...existingBlock,
              ...args.data,
              updatedAt: new Date('2026-09-17'),
            };
          },
        },
        auditLog: {
          create: async (args: { data: unknown }) => {
            auditEntry = args.data;
            return args.data;
          },
        },
      };
      return fn(mockTx as unknown as typeof prisma);
    }) as unknown as typeof prisma.$transaction;

    try {
      const res = fakeRes();
      const req = makeReq({
        params: { slug: 'landing-hero' },
        body: {
          title: '   ', // whitespace only title should be sanitized to null
          body: 'Konten Baru Lebih Informatif',
          metadata: { badge: 'Baru' },
        },
        user: { id: 'editor-1', email: 'editor@example.com', role: 'editor' },
      });

      await updateContentBlockHandler(req, res as unknown as Response);

      assert.equal(res.status, 200);
      assert.equal((res.body as { message: string }).message, 'Blok konten berhasil diperbarui');

      const block = (res.body as { block: { title: string | null; body: string } }).block;
      assert.equal(block.title, null); // sanitized
      assert.equal(block.body, 'Konten Baru Lebih Informatif');
      assert.ok(updatedData);
      assert.equal(updatedData!['title'], null);
      assert.equal(updatedData!['updatedById'], 'editor-1');

      // Verify audit trail entry
      assert.ok(auditEntry);
      const audit = auditEntry as {
        action: string;
        severity: string;
        targetType: string;
        targetId: string;
        metadata: { changes: Record<string, unknown> };
      };
      assert.equal(audit.action, 'content_block.updated');
      assert.equal(audit.severity, 'info');
      assert.equal(audit.targetType, 'content_block');
      assert.equal(audit.targetId, 'uuid-hero-1');
      assert.ok(audit.metadata.changes['title']);
      assert.ok(audit.metadata.changes['body']);
      assert.ok(audit.metadata.changes['metadata']);
    } finally {
      prisma.$transaction = originalTransaction;
      invalidateContentBlocksCache();
    }
  });

  it('returns existing block without writing audit log when no changes occur (including key-order invariance in metadata)', async () => {
    invalidateContentBlocksCache();
    const originalTransaction = prisma.$transaction;

    let updateCalled = false;
    let auditCalled = false;

    const existingBlock = {
      id: 'uuid-hero-1',
      sectionId: null,
      type: 'hero',
      slug: 'landing-hero',
      title: 'Judul Sama',
      body: 'Konten Sama',
      metadata: { a: 1, b: 2, c: [{ x: 10, y: 20 }] },
      sortOrder: null,
      updatedById: null,
      createdAt: new Date('2026-09-01'),
      updatedAt: new Date('2026-09-01'),
    };

    prisma.$transaction = (async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const mockTx = {
        $queryRaw: async () => [],
        contentBlock: {
          findUnique: async () => existingBlock,
          update: async () => {
            updateCalled = true;
            return existingBlock;
          },
        },
        auditLog: {
          create: async () => {
            auditCalled = true;
          },
        },
      };
      return fn(mockTx as unknown as typeof prisma);
    }) as unknown as typeof prisma.$transaction;

    try {
      const res = fakeRes();
      const req = makeReq({
        params: { slug: 'landing-hero' },
        body: {
          title: 'Judul Sama',
          body: 'Konten Sama',
          // Order reversed: { c, b, a } instead of { a, b, c }, and { y, x } instead of { x, y }
          metadata: { c: [{ y: 20, x: 10 }], b: 2, a: 1 },
        },
      });

      await updateContentBlockHandler(req, res as unknown as Response);

      assert.equal(res.status, 200);
      assert.equal(updateCalled, false);
      assert.equal(auditCalled, false);
    } finally {
      prisma.$transaction = originalTransaction;
      invalidateContentBlocksCache();
    }
  });

  it('boundary testing: rejects non-object metadata like empty arrays, zero, negative numbers, and max integers', async () => {
    const invalidMetadata = [[], [1, 2], 0, -1, Number.MAX_SAFE_INTEGER, 'invalid', true];
    for (const badMeta of invalidMetadata) {
      const res = fakeRes();
      const req = makeReq({
        params: { slug: 'landing-hero' },
        body: { metadata: badMeta as unknown as Record<string, unknown> },
      });
      await updateContentBlockHandler(req, res as unknown as Response);

      assert.equal(res.status, 400);
      assert.match((res.body as { error: string }).error, /Metadata harus berupa objek JSON/);
    }
  });

  it('boundary testing: rejects invalid types on title and body (zero, negative, arrays, objects, null body)', async () => {
    // Title invalid types
    for (const badTitle of [0, -1, Number.MAX_SAFE_INTEGER, [], {}]) {
      const res = fakeRes();
      const req = makeReq({
        params: { slug: 'landing-hero' },
        body: { title: badTitle as unknown as string },
      });
      await updateContentBlockHandler(req, res as unknown as Response);
      assert.equal(res.status, 400);
    }

    // Body invalid types & null
    for (const badBody of [null, 0, -1, Number.MAX_SAFE_INTEGER, [], {}]) {
      const res = fakeRes();
      const req = makeReq({
        params: { slug: 'landing-hero' },
        body: { body: badBody as unknown as string },
      });
      await updateContentBlockHandler(req, res as unknown as Response);
      assert.equal(res.status, 400);
    }
  });

  it('boundary testing: title trims leading/trailing whitespace before validating max 255 length', async () => {
    invalidateContentBlocksCache();
    const originalTransaction = prisma.$transaction;

    let savedTitle: unknown = undefined;
    const existingBlock = {
      id: 'uuid-hero-1',
      sectionId: null,
      type: 'hero',
      slug: 'landing-hero',
      title: 'Judul Lama',
      body: 'Konten Lama',
      metadata: null,
      sortOrder: null,
      updatedById: null,
      createdAt: new Date('2026-09-01'),
      updatedAt: new Date('2026-09-01'),
    };

    prisma.$transaction = (async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const mockTx = {
        $queryRaw: async () => [],
        contentBlock: {
          findUnique: async () => existingBlock,
          update: async (args: { data: Record<string, unknown> }) => {
            savedTitle = args.data.title;
            return { ...existingBlock, ...args.data };
          },
        },
        auditLog: {
          create: async () => {},
        },
      };
      return fn(mockTx as unknown as typeof prisma);
    }) as unknown as typeof prisma.$transaction;

    try {
      // 1. Title exceeding 255 characters after trim must be rejected with 400
      const resTooLong = fakeRes();
      const reqTooLong = makeReq({
        params: { slug: 'landing-hero' },
        body: { title: '   ' + 'a'.repeat(256) + '   ' },
      });
      await updateContentBlockHandler(reqTooLong, resTooLong as unknown as Response);
      assert.equal(resTooLong.status, 400);
      assert.match((resTooLong.body as { error: string }).error, /Judul maksimal 255 karakter/);

      // 2. Title with raw length > 255 (e.g. 260 chars) but trimmed length <= 255 (e.g. 250 chars) must succeed
      const rawTitle = '   ' + 'b'.repeat(250) + '       '; // 260 characters raw
      const resValid = fakeRes();
      const reqValid = makeReq({
        params: { slug: 'landing-hero' },
        body: { title: rawTitle },
      });
      await updateContentBlockHandler(reqValid, resValid as unknown as Response);
      assert.equal(resValid.status, 200);
      assert.equal(savedTitle, 'b'.repeat(250));
    } finally {
      prisma.$transaction = originalTransaction;
      invalidateContentBlocksCache();
    }
  });

  it('boundary testing: rejects slugs that exceed 100 characters', async () => {
    const res = fakeRes();
    const req = makeReq({
      params: { slug: 'a'.repeat(101) },
      body: { title: 'Valid Title' },
    });
    await updateContentBlockHandler(req, res as unknown as Response);

    assert.equal(res.status, 400);
    assert.match((res.body as { error: string }).error, /Format slug tidak valid/);
  });

  it('boundary testing: accepts valid numerical boundaries inside metadata (0, negative, max safe integer)', async () => {
    invalidateContentBlocksCache();
    const originalTransaction = prisma.$transaction;

    let savedMetadata: unknown = null;
    const existingBlock = {
      id: 'uuid-hero-1',
      sectionId: null,
      type: 'hero',
      slug: 'landing-hero',
      title: 'Judul Lama',
      body: 'Konten Lama',
      metadata: null,
      sortOrder: null,
      updatedById: null,
      createdAt: new Date('2026-09-01'),
      updatedAt: new Date('2026-09-01'),
    };

    prisma.$transaction = (async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const mockTx = {
        $queryRaw: async () => [],
        contentBlock: {
          findUnique: async () => existingBlock,
          update: async (args: { data: Record<string, unknown> }) => {
            savedMetadata = args.data.metadata;
            return { ...existingBlock, ...args.data };
          },
        },
        auditLog: {
          create: async () => {},
        },
      };
      return fn(mockTx as unknown as typeof prisma);
    }) as unknown as typeof prisma.$transaction;

    try {
      const res = fakeRes();
      const req = makeReq({
        params: { slug: 'landing-hero' },
        body: {
          metadata: {
            zeroVal: 0,
            negativeVal: -999,
            maxSafeInt: Number.MAX_SAFE_INTEGER,
            emptyNestedArray: [],
          },
        },
      });

      await updateContentBlockHandler(req, res as unknown as Response);

      assert.equal(res.status, 200);
      assert.ok(savedMetadata);
      assert.deepEqual(savedMetadata, {
        zeroVal: 0,
        negativeVal: -999,
        maxSafeInt: Number.MAX_SAFE_INTEGER,
        emptyNestedArray: [],
      });
    } finally {
      prisma.$transaction = originalTransaction;
      invalidateContentBlocksCache();
    }
  });

  it('boundary testing: handles Date objects including invalid Date (new Date(NaN)) without throwing RangeError', async () => {
    invalidateContentBlocksCache();
    const originalTransaction = prisma.$transaction;

    const existingBlock = {
      id: 'uuid-hero-1',
      sectionId: null,
      type: 'hero',
      slug: 'landing-hero',
      title: 'Judul',
      body: 'Konten',
      metadata: { validDate: new Date('2026-09-01T00:00:00.000Z'), invalidDate: new Date(NaN) },
      sortOrder: null,
      updatedById: null,
      createdAt: new Date('2026-09-01'),
      updatedAt: new Date('2026-09-01'),
    };

    prisma.$transaction = (async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const mockTx = {
        $queryRaw: async () => [],
        contentBlock: {
          findUnique: async () => existingBlock,
          update: async () => existingBlock,
        },
        auditLog: {
          create: async () => {},
        },
      };
      return fn(mockTx as unknown as typeof prisma);
    }) as unknown as typeof prisma.$transaction;

    try {
      const res = fakeRes();
      const req = makeReq({
        params: { slug: 'landing-hero' },
        body: {
          title: 'Judul Baru',
        },
      });

      // Must execute cleanly without throwing RangeError: Invalid time value
      await updateContentBlockHandler(req, res as unknown as Response);
      assert.equal(res.status, 200);
    } finally {
      prisma.$transaction = originalTransaction;
      invalidateContentBlocksCache();
    }
  });
});
