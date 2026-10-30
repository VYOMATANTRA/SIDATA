import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { DEFAULT_CONTENT_BLOCKS } from '../services/contentBlocks.service.js';

/**
 * Backend cannot import the Vue frontend module graph, so the publikasi-katalog
 * default stays as a mirrored copy. This test locks titles/categories/sources/
 * isAvailableOnline to the FE PUBLICATIONS list in content/publikasi.ts.
 */
describe('publikasi catalog FE↔BE sync', () => {
  it('DEFAULT_CONTENT_BLOCKS publikasi-katalog matches frontend PUBLICATIONS', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const fePath = join(here, '../../../frontend/src/content/publikasi.ts');
    const feSource = readFileSync(fePath, 'utf8');

    const beBlock = DEFAULT_CONTENT_BLOCKS.find((b) => b.slug === 'publikasi-katalog');
    assert.ok(beBlock);
    const publications = (beBlock!.metadata as { publications: Array<Record<string, unknown>> })
      .publications;
    assert.ok(Array.isArray(publications));
    assert.equal(publications.length, 4);

    for (const item of publications) {
      assert.equal(typeof item['category'], 'string');
      assert.equal(typeof item['title'], 'string');
      assert.equal(typeof item['description'], 'string');
      assert.equal(typeof item['isAvailableOnline'], 'boolean');
      assert.equal(item['isAvailableOnline'], false);
      assert.equal(typeof item['source'], 'string');
      // Title + category + source must appear verbatim in the FE module.
      assert.match(feSource, new RegExp(escapeRegExp(String(item['title']))));
      assert.match(feSource, new RegExp(escapeRegExp(String(item['category']))));
      assert.match(feSource, new RegExp(escapeRegExp(String(item['source']))));
    }

    // Order: Prodeskel, Infografis, Eco Boba, Manggar dalam Angka
    assert.deepEqual(
      publications.map((p) => p['title']),
      [
        'Publikasi Prodeskel',
        'Infografis Kelurahan Manggar',
        'Booklet Eco Boba',
        'Manggar dalam Angka 2026',
      ],
    );
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
