import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CERITA_PAGES } from '../../prisma/ceritaPages.js';
import { CERITA_STORIES } from '../../prisma/ceritaStories/index.js';

describe('Cerita stories', () => {
  for (const [pageSlug, story] of Object.entries(CERITA_STORIES)) {
    describe(pageSlug, () => {
      const page = CERITA_PAGES.find((p) => p.slug === pageSlug);

      it('belongs to a seeded page', () => {
        assert.ok(page, `unknown page ${pageSlug}`);
        assert.equal(story.page, pageSlug);
      });

      it('targets seeded chapters and never repeats a section key or title in a chapter', () => {
        const keys = new Set<string>();
        const titles = new Set<string>();
        for (const s of story.sections) {
          assert.ok(
            page?.chapters.some((c) => c.slug === s.chapter),
            `unknown chapter ${s.chapter}`,
          );
          const key = `${s.chapter}/${s.section}`;
          const title = `${s.chapter}/${s.title.trim().toLowerCase()}`;
          assert.ok(!keys.has(key), `duplicate section ${key}`);
          assert.ok(!titles.has(title), `duplicate title ${title}`);
          keys.add(key);
          titles.add(title);
        }
      });

      it('has a title, and a plain body unless it is computed', () => {
        for (const s of story.sections) {
          assert.ok(s.title.trim().length > 0 && s.title.length <= 255);
          if (typeof s.body === 'string') {
            assert.ok(s.body.trim().length > 0, `${s.section} has an empty body`);
            assert.ok(!/<[a-z/][^>]*>/i.test(s.body), `${s.section} body contains HTML`);
          }
        }
      });

      it('has complete expectations', () => {
        for (const s of story.sections) {
          for (const e of s.expect ?? []) {
            if (e.indicator !== undefined) assert.notEqual(e.value, undefined, s.section);
            else assert.notEqual(e.table, undefined, s.section);
          }
        }
      });
    });
  }
});
