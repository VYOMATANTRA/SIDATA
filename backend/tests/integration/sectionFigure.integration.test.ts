import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import prisma from '../../src/utils/prisma.js';
import { deleteSectionFigure, putSectionFigure } from '../../src/services/sectionFigure.service.js';
import { deleteSection } from '../../src/services/sections.service.js';
import { createProseBlock, reorderProseBlocks } from '../../src/services/proseBlocks.service.js';
import {
  getAllContentBlocks,
  updateContentBlock,
} from '../../src/services/contentBlocks.service.js';
import { deleteProseBlock } from '../../src/services/proseBlocks.service.js';
import { HierarchyServiceError } from '../../src/utils/hierarchyAuthoring.js';
import {
  ACTOR,
  REQUEST_CONTEXT,
  createIsolatedClient,
  disconnectResetClient,
  innodbDeadlockCount,
  resetDatabase,
} from './helpers/db.js';

const clientA = createIsolatedClient(20_000) as unknown as typeof prisma;
const clientB = createIsolatedClient(20_000) as unknown as typeof prisma;

const ID = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const photo = (n: number) => ({ mediaId: ID(n), alt: `Foto sintetis ${n}` });
const single = (n: number) => ({ kind: 'photo', photos: [photo(n)] });
const group = (...ns: number[]) => ({ kind: 'photos', photos: ns.map(photo) });

async function seedSection(slug = 'ringkasan'): Promise<{ id: string; updatedAt: string }> {
  const page =
    (await prisma.page.findUnique({ where: { slug: 'halaman-uji' } })) ??
    (await prisma.page.create({
      data: { slug: 'halaman-uji', title: 'Halaman Uji', sortOrder: 0 },
    }));
  const chapter =
    (await prisma.chapter.findFirst({ where: { pageId: page.id } })) ??
    (await prisma.chapter.create({
      data: { pageId: page.id, slug: 'bab-uji', title: 'Bab Uji', sortOrder: 0 },
    }));
  const count = await prisma.section.count({ where: { chapterId: chapter.id } });
  const section = await prisma.section.create({
    data: { chapterId: chapter.id, slug, title: `Bagian ${slug}`, sortOrder: count },
  });
  return { id: section.id, updatedAt: section.updatedAt.toISOString() };
}

async function seedPhotos(...ns: number[]): Promise<void> {
  await prisma.mediaAsset.createMany({
    data: ns.map((n) => ({
      id: ID(n),
      provider: 'local',
      storageKey: `photos/cerita/synthetic/${ID(n)}.webp`,
      kind: 'photo' as const,
      purpose: 'cerita',
      ownerKey: 'synthetic',
      mimeType: 'image/webp',
      byteSize: 1024,
      originalName: `foto-${n}.jpg`,
    })),
  });
}

const asset = (n: number) => prisma.mediaAsset.findUniqueOrThrow({ where: { id: ID(n) } });
const refCount = (n: number) => prisma.mediaAssetReference.count({ where: { assetId: ID(n) } });
const figureBlocks = (sectionId: string) =>
  prisma.contentBlock.findMany({ where: { sectionId, type: 'figure' } });

const save = (
  sectionId: string,
  expectedUpdatedAt: string,
  figure: unknown,
  client: typeof prisma = prisma,
) => putSectionFigure(sectionId, { expectedUpdatedAt, figure }, ACTOR, REQUEST_CONTEXT, client);

const statusOf = (err: unknown) => (err as HierarchyServiceError).statusCode;
const codeOf = (err: unknown) => (err as HierarchyServiceError).code;

describe('section figure against real MySQL', () => {
  beforeEach(async () => resetDatabase());
  after(async () => {
    await resetDatabase();
    await disconnectResetClient();
    await clientA.$disconnect();
    await clientB.$disconnect();
    await prisma.$disconnect();
  });

  it('create, replace and delete drive the media attach/detach states and the audit trail', async () => {
    await seedPhotos(1, 2, 3);
    const section = await seedSection();

    // Create with two photos.
    const created = await save(section.id, section.updatedAt, group(1, 2));
    assert.equal(created.block.slug, `figure-${section.id}`);
    assert.equal(created.block.sortOrder, null);
    const rows = await figureBlocks(section.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.body, '');
    assert.equal(rows[0]!.title, null);
    assert.equal(rows[0]!.sectionId, section.id);
    for (const n of [1, 2]) {
      const a = await asset(n);
      assert.notEqual(a.attachedAt, null, `photo ${n} attached`);
      assert.equal(a.detachedAt, null);
      assert.equal(await refCount(n), 1);
    }
    assert.equal((await asset(3)).attachedAt, null);
    const reference = await prisma.mediaAssetReference.findFirstOrThrow({
      where: { assetId: ID(1) },
    });
    assert.equal(reference.referenceType, 'content_block');
    assert.equal(reference.referenceId, rows[0]!.id);
    assert.equal(reference.slot, 'figure');

    // Replace: drop photo 1, keep 2, add 3.
    const replaced = await save(section.id, created.section.updatedAt, group(2, 3));
    assert.equal(replaced.block.id, created.block.id);
    assert.equal((await figureBlocks(section.id)).length, 1);
    const dropped = await asset(1);
    assert.equal(dropped.attachedAt, null);
    assert.notEqual(dropped.detachedAt, null, 'grace period starts on removal');
    assert.equal(await refCount(1), 0);
    assert.equal((await asset(2)).detachedAt, null);
    assert.notEqual((await asset(3)).attachedAt, null);
    assert.equal(await refCount(2), 1);
    assert.equal(await refCount(3), 1);

    // Delete.
    const removed = await deleteSectionFigure(
      section.id,
      replaced.section.updatedAt,
      ACTOR,
      REQUEST_CONTEXT,
    );
    assert.equal(removed.section.id, section.id);
    assert.equal((await figureBlocks(section.id)).length, 0);
    for (const n of [2, 3]) {
      const a = await asset(n);
      assert.equal(a.attachedAt, null);
      assert.notEqual(a.detachedAt, null);
      assert.equal(await refCount(n), 0);
    }
    assert.equal(await prisma.mediaAssetReference.count(), 0);

    // Audit rows: info, info, warning, metadata free of text.
    const audits = await prisma.auditLog.findMany({
      where: { action: { in: ['section.figure_saved', 'section.figure_deleted'] } },
      orderBy: { createdAt: 'asc' },
    });
    assert.deepEqual(
      audits.map((a) => [a.action, a.severity]),
      [
        ['section.figure_saved', 'info'],
        ['section.figure_saved', 'info'],
        ['section.figure_deleted', 'warning'],
      ],
    );
    for (const a of audits)
      assert.equal(JSON.stringify(a.metadata).includes('Foto sintetis'), false);
  });

  it('re-saving the identical figure re-attaches a photo whose bookkeeping was lost, changing nothing else', async () => {
    await seedPhotos(1, 2);
    const section = await seedSection();
    const created = await save(section.id, section.updatedAt, group(1, 2));
    const auditCount = await prisma.auditLog.count();
    const blockBefore = await prisma.contentBlock.findUniqueOrThrow({
      where: { id: created.block.id },
    });

    // Cleanup-style loss: photo 1 unpublished and its reference gone.
    await prisma.mediaAssetReference.deleteMany({ where: { assetId: ID(1) } });
    await prisma.mediaAsset.update({
      where: { id: ID(1) },
      data: { attachedAt: null, detachedAt: new Date() },
    });

    const again = await save(section.id, created.section.updatedAt, group(1, 2));

    const repaired = await asset(1);
    assert.notEqual(repaired.attachedAt, null);
    assert.equal(repaired.detachedAt, null);
    assert.equal(await refCount(1), 1);
    assert.equal(await refCount(2), 1);
    assert.equal(again.section.updatedAt, created.section.updatedAt);
    assert.equal(await prisma.auditLog.count(), auditCount);
    const blockAfter = await prisma.contentBlock.findUniqueOrThrow({
      where: { id: created.block.id },
    });
    assert.equal(blockAfter.updatedAt.getTime(), blockBefore.updatedAt.getTime());
    const sectionAfter = await prisma.section.findUniqueOrThrow({ where: { id: section.id } });
    assert.equal(sectionAfter.updatedAt.toISOString(), created.section.updatedAt);

    // A photo claimed for deletion is refused with the same plain 400 as a normal save.
    await prisma.mediaAssetReference.deleteMany({ where: { assetId: ID(2) } });
    await prisma.mediaAsset.update({
      where: { id: ID(2) },
      data: { attachedAt: null, cleanupClaimedAt: new Date() },
    });
    await assert.rejects(save(section.id, created.section.updatedAt, group(1, 2)), (err) => {
      assert.equal(statusOf(err), 400);
      return true;
    });
    assert.equal(await prisma.auditLog.count(), auditCount);
  });

  it('the public content-block list reflects each write (cache invalidation)', async () => {
    await seedPhotos(1);
    const section = await seedSection();

    const before = await getAllContentBlocks();
    assert.equal(
      before.some((b) => b.type === 'figure'),
      false,
    );

    const created = await save(section.id, section.updatedAt, single(1));
    const during = await getAllContentBlocks();
    const listed = during.find((b) => b.type === 'figure');
    assert.ok(listed, 'figure appears in the public list after create');
    assert.equal(listed.sectionId, section.id);
    assert.deepEqual(listed.metadata, single(1));

    await deleteSectionFigure(section.id, created.section.updatedAt, ACTOR, REQUEST_CONTEXT);
    assert.equal(
      (await getAllContentBlocks()).some((b) => b.type === 'figure'),
      false,
    );
  });

  it('refuses media of another purpose and leaves no block, reference or audit row', async () => {
    await seedPhotos(1);
    await prisma.mediaAsset.create({
      data: {
        id: ID(2),
        provider: 'local',
        storageKey: `photos/portal-hero/synthetic/${ID(2)}.webp`,
        kind: 'photo',
        purpose: 'portal-hero',
        ownerKey: 'synthetic',
        mimeType: 'image/webp',
        byteSize: 1024,
        originalName: 'hero.jpg',
      },
    });
    const section = await seedSection();

    await assert.rejects(save(section.id, section.updatedAt, group(1, 2)), (err) => {
      assert.equal(statusOf(err), 400);
      return true;
    });

    assert.equal((await figureBlocks(section.id)).length, 0);
    assert.equal(await prisma.mediaAssetReference.count(), 0);
    assert.equal((await asset(1)).attachedAt, null);
    assert.equal(await prisma.auditLog.count({ where: { action: 'section.figure_saved' } }), 0);
  });

  it('answers a stale token with 409 STALE_WRITE and writes nothing', async () => {
    await seedPhotos(1, 2);
    const section = await seedSection();
    const created = await save(section.id, section.updatedAt, single(1));

    await assert.rejects(save(section.id, section.updatedAt, single(2)), (err) => {
      assert.equal(statusOf(err), 409);
      assert.equal(codeOf(err), 'STALE_WRITE');
      assert.equal(
        (err as HierarchyServiceError).details?.currentUpdatedAt,
        created.section.updatedAt,
      );
      return true;
    });
    await assert.rejects(
      deleteSectionFigure(section.id, section.updatedAt, ACTOR, REQUEST_CONTEXT),
      (err) => codeOf(err) === 'STALE_WRITE',
    );
    assert.deepEqual((await figureBlocks(section.id))[0]!.metadata, single(1));
    assert.equal(await refCount(2), 0);
  });

  it('deleting a missing figure is 404 FIGURE_NOT_FOUND', async () => {
    const section = await seedSection();
    await assert.rejects(
      deleteSectionFigure(section.id, section.updatedAt, ACTOR, REQUEST_CONTEXT),
      (err) => statusOf(err) === 404 && codeOf(err) === 'FIGURE_NOT_FOUND',
    );
  });

  it('concurrent PUTs with the same token: one wins, the other gets STALE_WRITE, one figure remains', async () => {
    await seedPhotos(1, 2);
    const section = await seedSection();
    const deadlocksBefore = await innodbDeadlockCount(prisma);

    const results = await Promise.allSettled([
      save(section.id, section.updatedAt, single(1), clientA),
      save(section.id, section.updatedAt, single(2), clientB),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(fulfilled.length, 1, 'exactly one writer succeeds');
    assert.equal(rejected.length, 1);
    assert.equal(codeOf((rejected[0] as PromiseRejectedResult).reason), 'STALE_WRITE');

    const rows = await figureBlocks(section.id);
    assert.equal(rows.length, 1);
    const winner = (rows[0]!.metadata as { photos: Array<{ mediaId: string }> }).photos[0]!.mediaId;
    const loser = winner === ID(1) ? 2 : 1;
    assert.notEqual((await asset(winner === ID(1) ? 1 : 2)).attachedAt, null);
    assert.equal((await asset(loser)).attachedAt, null, 'the losing writer attached nothing');
    assert.equal(await prisma.mediaAssetReference.count(), 1);
    assert.equal(await innodbDeadlockCount(prisma), deadlocksBefore, 'no deadlock');
  });

  it('two sections swapping the same photos in opposite directions finish without deadlock', async () => {
    await seedPhotos(1, 2);
    const one = await seedSection('satu');
    const two = await seedSection('dua');
    const a = await save(one.id, one.updatedAt, single(1));
    const b = await save(two.id, two.updatedAt, single(2));
    const deadlocksBefore = await innodbDeadlockCount(prisma);

    await Promise.all([
      save(one.id, a.section.updatedAt, single(2), clientA),
      save(two.id, b.section.updatedAt, single(1), clientB),
    ]);

    assert.equal(await innodbDeadlockCount(prisma), deadlocksBefore, 'no deadlock, no retry');
    assert.equal(await refCount(1), 1);
    assert.equal(await refCount(2), 1);
    assert.notEqual((await asset(1)).attachedAt, null);
    assert.notEqual((await asset(2)).attachedAt, null);
    assert.equal((await figureBlocks(one.id)).length, 1);
    assert.equal((await figureBlocks(two.id)).length, 1);
  });

  it('a photo shared by two sections stays published until the last figure lets go', async () => {
    await seedPhotos(1, 2);
    const one = await seedSection('satu');
    const two = await seedSection('dua');
    const a = await save(one.id, one.updatedAt, single(1));
    const b = await save(two.id, two.updatedAt, single(1));
    assert.equal(await refCount(1), 2);

    await deleteSectionFigure(one.id, a.section.updatedAt, ACTOR, REQUEST_CONTEXT);
    assert.equal(await refCount(1), 1);
    assert.notEqual((await asset(1)).attachedAt, null);

    await deleteSectionFigure(two.id, b.section.updatedAt, ACTOR, REQUEST_CONTEXT);
    assert.equal(await refCount(1), 0);
    assert.equal((await asset(1)).attachedAt, null);
  });

  it('generic PATCH and DELETE refuse the figure block; the media stays attached', async () => {
    await seedPhotos(1);
    const section = await seedSection();
    const created = await save(section.id, section.updatedAt, single(1));
    const slug = created.block.slug;

    await assert.rejects(
      updateContentBlock(slug, { body: 'Disusupkan' }, ACTOR, REQUEST_CONTEXT),
      (err) => statusOf(err) === 409 && codeOf(err) === 'FIGURE_BLOCK_PROTECTED',
    );
    await assert.rejects(
      deleteProseBlock(slug, created.block.updatedAt, ACTOR, REQUEST_CONTEXT),
      (err) => statusOf(err) === 409 && codeOf(err) === 'FIGURE_BLOCK_PROTECTED',
    );

    assert.equal((await figureBlocks(section.id)).length, 1);
    assert.notEqual((await asset(1)).attachedAt, null);
    assert.equal(await refCount(1), 1);
  });

  it('a section holding a figure cannot be deleted and the database RESTRICT backs it up', async () => {
    await seedPhotos(1);
    const section = await seedSection();
    const created = await save(section.id, section.updatedAt, single(1));

    await assert.rejects(
      deleteSection(section.id, created.section.updatedAt, ACTOR, REQUEST_CONTEXT),
      (err) => {
        assert.equal(statusOf(err), 409);
        assert.equal(codeOf(err), 'HAS_DEPENDENTS');
        assert.deepEqual((err as HierarchyServiceError).details?.dependencies, {
          contentBlocks: 0,
          figures: 1,
          indicators: 0,
          indicatorTables: 0,
        });
        assert.match((err as Error).message, /gambar: 1/);
        return true;
      },
    );
    await assert.rejects(prisma.section.delete({ where: { id: section.id } }));
  });

  it('prose create and reorder work around the figure (NULL sort_order is not a sibling)', async () => {
    await seedPhotos(1);
    const section = await seedSection();
    const first = await createProseBlock(
      section.id,
      { title: 'Satu', body: 'Isi satu.' },
      ACTOR,
      REQUEST_CONTEXT,
    );
    const withFigure = await save(section.id, first.section.updatedAt, single(1));
    const second = await createProseBlock(
      section.id,
      { title: 'Dua', body: 'Isi dua.' },
      ACTOR,
      REQUEST_CONTEXT,
    );
    assert.equal(first.block.sortOrder, 0);
    assert.equal(second.block.sortOrder, 1);

    const reordered = await reorderProseBlocks(
      section.id,
      {
        expectedUpdatedAt: second.section.updatedAt,
        items: [
          { id: first.block.id, sortOrder: 1 },
          { id: second.block.id, sortOrder: 0 },
        ],
      },
      ACTOR,
      REQUEST_CONTEXT,
    );
    assert.deepEqual(
      reordered.blocks.map((b) => b.id),
      [second.block.id, first.block.id],
    );
    const figure = (await figureBlocks(section.id))[0]!;
    assert.equal(figure.sortOrder, null);
    assert.equal(figure.id, withFigure.block.id);

    await assert.rejects(
      reorderProseBlocks(
        section.id,
        {
          expectedUpdatedAt: reordered.section.updatedAt,
          items: [
            { id: first.block.id, sortOrder: 0 },
            { id: second.block.id, sortOrder: 1 },
            { id: figure.id, sortOrder: 2 },
          ],
        },
        ACTOR,
        REQUEST_CONTEXT,
      ),
      (err) => statusOf(err) === 400,
    );
  });

  describe('a damaged stored figure', () => {
    /** Writes a figure straight into the table: photo 1 belongs to another purpose, photo 9 is
     * missing, photo 2 is healthy. The service would refuse to save this, but it must still be removable. */
    async function seedDamagedFigure(sectionId: string): Promise<string> {
      await seedPhotos(2);
      await prisma.mediaAsset.create({
        data: {
          id: ID(1),
          provider: 'local',
          storageKey: `photos/portal-hero/synthetic/${ID(1)}.webp`,
          kind: 'photo',
          purpose: 'portal-hero',
          ownerKey: 'synthetic',
          mimeType: 'image/webp',
          byteSize: 1024,
          originalName: 'hero.jpg',
          attachedAt: new Date(),
        },
      });
      await prisma.mediaAsset.update({ where: { id: ID(2) }, data: { attachedAt: new Date() } });
      const block = await prisma.contentBlock.create({
        data: {
          sectionId,
          type: 'figure',
          slug: `figure-${sectionId}`,
          title: null,
          body: '',
          sortOrder: null,
          metadata: { kind: 'photos', photos: [photo(1), photo(9), photo(2)] },
        },
      });
      await prisma.mediaAssetReference.createMany({
        data: [1, 2].map((n) => ({
          assetId: ID(n),
          referenceType: 'content_block',
          referenceId: block.id,
          slot: 'figure',
        })),
      });
      return block.id;
    }

    it('DELETE removes it and releases what it can', async () => {
      const section = await seedSection();
      await seedDamagedFigure(section.id);
      const fresh = await prisma.section.findUniqueOrThrow({ where: { id: section.id } });

      const result = await deleteSectionFigure(
        section.id,
        fresh.updatedAt.toISOString(),
        ACTOR,
        REQUEST_CONTEXT,
      );

      assert.equal(result.section.id, section.id);
      assert.equal((await figureBlocks(section.id)).length, 0);
      assert.equal(await prisma.mediaAssetReference.count(), 0);
      assert.equal((await asset(2)).attachedAt, null);
      assert.notEqual((await asset(2)).detachedAt, null);
      assert.equal(await prisma.auditLog.count({ where: { action: 'section.figure_deleted' } }), 1);
      // The section is deletable again.
      await deleteSection(section.id, result.section.updatedAt, ACTOR, REQUEST_CONTEXT);
    });

    it('PUT can replace it', async () => {
      await seedPhotos(3);
      const section = await seedSection();
      const blockId = await seedDamagedFigure(section.id);
      const fresh = await prisma.section.findUniqueOrThrow({ where: { id: section.id } });

      const saved = await save(section.id, fresh.updatedAt.toISOString(), single(3));

      assert.equal(saved.block.id, blockId);
      assert.equal(await refCount(1), 0);
      assert.equal(await refCount(2), 0);
      assert.equal(await refCount(3), 1);
      assert.notEqual((await asset(3)).attachedAt, null);
    });
  });
});
