import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import prisma from '../../src/utils/prisma.js';
import { updateContentBlock } from '../../src/services/contentBlocks.service.js';
import { putSectionText } from '../../src/services/sectionText.service.js';
import { HierarchyServiceError } from '../../src/utils/hierarchyAuthoring.js';
import { ACTOR, REQUEST_CONTEXT, disconnectResetClient, resetDatabase } from './helpers/db.js';

const statusOf = (err: unknown) => (err as HierarchyServiceError).statusCode;

async function seedSection() {
  const page = await prisma.page.create({
    data: { slug: 'halaman', title: 'Halaman', sortOrder: 0 },
  });
  const chapter = await prisma.chapter.create({
    data: { pageId: page.id, slug: 'bab', title: 'Bab', sortOrder: 0 },
  });
  return prisma.section.create({
    data: { chapterId: chapter.id, slug: 'ringkasan', title: 'Ringkasan', sortOrder: 0 },
  });
}

const fresh = async (id: string) =>
  (await prisma.section.findUniqueOrThrow({ where: { id } })).updatedAt.toISOString();

const prose = (sectionId: string) =>
  prisma.contentBlock.findMany({
    where: { sectionId, type: 'prose' },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });

describe('putSectionText against real MySQL', () => {
  beforeEach(async () => resetDatabase());
  after(async () => {
    await resetDatabase();
    await disconnectResetClient();
    await prisma.$disconnect();
  });

  it('creates the single prose block, renames the section and keeps its slug', async () => {
    const section = await seedSection();
    const result = await putSectionText(
      section.id,
      { title: 'Judul baru', body: 'Satu.\n\nDua.', expectedUpdatedAt: await fresh(section.id) },
      ACTOR,
      REQUEST_CONTEXT,
    );

    assert.equal(result.section.title, 'Judul baru');
    assert.equal(result.section.slug, 'ringkasan');
    assert.equal(result.block?.body, 'Satu.\n\nDua.');
    const blocks = await prose(section.id);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0]?.title, 'Isi');
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'section.text_saved' },
    });
    assert.ok(!JSON.stringify(audit.metadata).includes('Satu'), 'the body is never logged');
  });

  it('merges several existing blocks into the first one', async () => {
    const section = await seedSection();
    for (const [i, slug] of ['a', 'b', 'c'].entries()) {
      await prisma.contentBlock.create({
        data: {
          sectionId: section.id,
          type: 'prose',
          slug: `${slug}-blok`,
          title: slug,
          body: slug,
          sortOrder: i,
        },
      });
    }
    const result = await putSectionText(
      section.id,
      { title: 'Ringkasan', body: 'Gabungan', expectedUpdatedAt: await fresh(section.id) },
      ACTOR,
    );

    const blocks = await prose(section.id);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0]?.slug, 'a-blok');
    assert.equal(blocks[0]?.body, 'Gabungan');
    assert.equal(result.block?.slug, 'a-blok');
  });

  it('removes every block when the body is emptied', async () => {
    const section = await seedSection();
    await prisma.contentBlock.create({
      data: {
        sectionId: section.id,
        type: 'prose',
        slug: 'x-blok',
        title: 'x',
        body: 'x',
        sortOrder: 0,
      },
    });
    const result = await putSectionText(
      section.id,
      { title: 'Ringkasan', body: '', expectedUpdatedAt: await fresh(section.id) },
      ACTOR,
    );
    assert.equal(result.block, null);
    assert.equal((await prose(section.id)).length, 0);
  });

  it('changes nothing, and writes no audit row, when title and body are the same', async () => {
    const section = await seedSection();
    await putSectionText(
      section.id,
      { title: 'Ringkasan', body: 'Sama', expectedUpdatedAt: await fresh(section.id) },
      ACTOR,
    );
    const token = await fresh(section.id);
    await putSectionText(
      section.id,
      { title: 'Ringkasan', body: 'Sama', expectedUpdatedAt: token },
      ACTOR,
    );

    assert.equal(await fresh(section.id), token);
    assert.equal(await prisma.auditLog.count({ where: { action: 'section.text_saved' } }), 1);
  });

  it('refuses a stale token (409), HTML (422/400) and an unknown section (404)', async () => {
    const section = await seedSection();
    await assert.rejects(
      putSectionText(
        section.id,
        { title: 'Ringkasan', body: 'x', expectedUpdatedAt: '2020-01-01T00:00:00.000Z' },
        ACTOR,
      ),
      (e) => statusOf(e) === 409,
    );
    await assert.rejects(
      putSectionText(
        section.id,
        { title: 'Ringkasan', body: '<b>x</b>', expectedUpdatedAt: await fresh(section.id) },
        ACTOR,
      ),
      (e) => statusOf(e) === 400,
    );
    await assert.rejects(
      putSectionText(
        '00000009-1111-4111-8111-111111111111',
        { title: 'Ringkasan', body: 'x', expectedUpdatedAt: await fresh(section.id) },
        ACTOR,
      ),
      (e) => statusOf(e) === 404,
    );
    assert.equal((await prose(section.id)).length, 0);
  });

  it('refuses a save made after someone edited a block on its own', async () => {
    const section = await seedSection();
    await prisma.contentBlock.create({
      data: {
        sectionId: section.id,
        type: 'prose',
        slug: 'a-blok',
        title: 'a',
        body: 'lama',
        sortOrder: 0,
      },
    });
    const seen = await fresh(section.id);

    await updateContentBlock('a-blok', { body: 'diubah orang lain' }, ACTOR, REQUEST_CONTEXT);

    assert.notEqual(await fresh(section.id), seen, 'a block edit moves the section token');
    await assert.rejects(
      putSectionText(
        section.id,
        { title: 'Ringkasan', body: 'timpa', expectedUpdatedAt: seen },
        ACTOR,
      ),
      (e) => statusOf(e) === 409,
    );
    assert.equal((await prose(section.id))[0]?.body, 'diubah orang lain');
  });

  it('removes a lone empty block when the body is empty', async () => {
    const section = await seedSection();
    await prisma.contentBlock.create({
      data: {
        sectionId: section.id,
        type: 'prose',
        slug: 'kosong',
        title: 'k',
        body: '',
        sortOrder: 0,
      },
    });
    await putSectionText(
      section.id,
      { title: 'Ringkasan', body: '', expectedUpdatedAt: await fresh(section.id) },
      ACTOR,
    );
    assert.equal((await prose(section.id)).length, 0);
  });
});
