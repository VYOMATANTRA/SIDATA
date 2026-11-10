import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import prisma from '../../src/utils/prisma.js';
import { attachMedia, detachMedia } from '../../src/services/media.service.js';
import {
  createIsolatedClient,
  disconnectResetClient,
  innodbDeadlockCount,
  resetDatabase,
} from './helpers/db.js';

describe('media attach/detach concurrency against real MySQL', () => {
  const clientA = createIsolatedClient(20_000);
  const clientB = createIsolatedClient(20_000);

  beforeEach(async () => {
    await resetDatabase();
  });

  after(async () => {
    await resetDatabase();
    await disconnectResetClient();
    await clientA.$disconnect();
    await clientB.$disconnect();
    await prisma.$disconnect();
  });

  const ID_1 = '11111111-1111-4111-8111-111111111111';
  const ID_2 = '22222222-2222-4222-8222-222222222222';

  async function seedAssets(): Promise<void> {
    await prisma.mediaAsset.createMany({
      data: [
        {
          id: ID_1,
          provider: 'local',
          storageKey: `photos/cerita/global/${ID_1}.webp`,
          kind: 'photo',
          purpose: 'cerita',
          ownerKey: 'global',
          mimeType: 'image/webp',
          byteSize: 1024,
          originalName: 'photo1.jpg',
        },
        {
          id: ID_2,
          provider: 'local',
          storageKey: `photos/cerita/global/${ID_2}.webp`,
          kind: 'photo',
          purpose: 'cerita',
          ownerKey: 'global',
          mimeType: 'image/webp',
          byteSize: 2048,
          originalName: 'photo2.jpg',
        },
      ],
    });
  }

  it('serializes concurrent attachMedia with opposing id orders without deadlock', async () => {
    await seedAssets();
    const deadlocksBefore = await innodbDeadlockCount(prisma);

    // Run two concurrent transactions that request the same two rows in opposing orders:
    // txA requests [ID_1, ID_2]
    // txB requests [ID_2, ID_1]
    // Sorting by ascending ID in loadAndCheck ensures both acquire locks in ID_1, then ID_2 order.
    const promiseA = clientA.$transaction(async (tx) => {
      await attachMedia(tx, [ID_1, ID_2], { purpose: 'cerita' });
    });

    const promiseB = clientB.$transaction(async (tx) => {
      await attachMedia(tx, [ID_2, ID_1], { purpose: 'cerita' });
    });

    await Promise.all([promiseA, promiseB]);

    const deadlocksAfter = await innodbDeadlockCount(prisma);
    assert.equal(deadlocksAfter - deadlocksBefore, 0, 'No InnoDB deadlocks occurred');

    const assets = await prisma.mediaAsset.findMany({
      where: { id: { in: [ID_1, ID_2] } },
    });
    assert.equal(assets.length, 2);
    assert.ok(assets[0]?.attachedAt !== null);
    assert.ok(assets[1]?.attachedAt !== null);
  });

  it('serializes concurrent attachMedia and detachMedia on the same asset', async () => {
    await seedAssets();
    const deadlocksBefore = await innodbDeadlockCount(prisma);

    const now = new Date();

    // Concurrent attach and detach
    await Promise.all([
      clientA.$transaction(async (tx) => {
        await attachMedia(tx, [ID_1], { purpose: 'cerita' }, now);
      }),
      clientB.$transaction(async (tx) => {
        await detachMedia(tx, [ID_1], { purpose: 'cerita' }, now);
      }),
    ]);

    const deadlocksAfter = await innodbDeadlockCount(prisma);
    assert.equal(deadlocksAfter - deadlocksBefore, 0, 'No InnoDB deadlocks occurred');

    const asset = await prisma.mediaAsset.findUnique({ where: { id: ID_1 } });
    assert.ok(asset);
    // Either attach won (attachedAt != null, detachedAt == null) or detach won (attachedAt == null)
    const isAttached = asset.attachedAt !== null && asset.detachedAt === null;
    const isDetached = asset.attachedAt === null;
    assert.ok(isAttached || isDetached, 'Asset reached a consistent state');
  });

  it('tracks distinct content references in media_asset_references and rejects claimed assets', async () => {
    await seedAssets();
    const t1 = new Date('2026-08-01T00:00:00Z');
    const t2 = new Date('2026-08-02T00:00:00Z');
    const t3 = new Date('2026-08-03T00:00:00Z');
    const ref1 = { type: 'content_block', id: 'item-1', slot: 'hero' };
    const ref2 = { type: 'content_block', id: 'item-2', slot: 'hero' };

    await clientA.$transaction(async (tx) => {
      await attachMedia(tx, [ID_1], { purpose: 'cerita', reference: ref1 }, t1);
      // Duplicate attach of same tuple is idempotent
      await attachMedia(tx, [ID_1], { purpose: 'cerita', reference: ref1 }, t2);
      await attachMedia(tx, [ID_1], { purpose: 'cerita', reference: ref2 }, t2);
    });

    assert.equal(await prisma.mediaAssetReference.count({ where: { assetId: ID_1 } }), 2);

    // Detaching ref1 leaves ref2 active and asset attached
    await clientB.$transaction(async (tx) => {
      await detachMedia(tx, [ID_1], { purpose: 'cerita', reference: ref1 }, t3);
    });
    const stillAttached = await prisma.mediaAsset.findUnique({ where: { id: ID_1 } });
    assert.equal(stillAttached?.attachedAt?.toISOString(), t1.toISOString());
    assert.equal(stillAttached?.detachedAt, null);

    // Detaching ref2 transitions asset to unattached
    await clientB.$transaction(async (tx) => {
      await detachMedia(tx, [ID_1], { purpose: 'cerita', reference: ref2 }, t3);
    });
    const nowDetached = await prisma.mediaAsset.findUnique({ where: { id: ID_1 } });
    assert.equal(nowDetached?.attachedAt, null);
    assert.equal(nowDetached?.detachedAt?.toISOString(), t3.toISOString());

    // Claimed asset cannot be attached
    await prisma.mediaAsset.update({
      where: { id: ID_2 },
      data: { cleanupClaimedAt: t3 },
    });
    await assert.rejects(
      () =>
        clientA.$transaction(async (tx) => {
          await attachMedia(tx, [ID_2], { purpose: 'cerita', reference: ref1 }, t3);
        }),
      (err: unknown) => (err as { code?: string })?.code === 'MEDIA_NOT_FOUND',
    );
  });
});
