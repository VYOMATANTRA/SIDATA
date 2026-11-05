import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';
import { DEFAULT_CONTENT_BLOCKS } from '../services/contentBlocks.service.js';

interface PublicationLike {
  category: string;
  title: string;
  description: string;
  source?: string | null;
  href?: string | null;
  isAvailableOnline: boolean;
}

interface NormalizedPublication {
  category: string;
  title: string;
  description: string;
  source: string | null;
  href: string | null;
  isAvailableOnline: boolean;
}

function normalize(item: PublicationLike): NormalizedPublication {
  return {
    category: item.category,
    title: item.title,
    description: item.description,
    source: item.source ?? null,
    href: item.href ?? null,
    isAvailableOnline: item.isAvailableOnline,
  };
}

/**
 * Backend cannot import the Vue frontend module graph at build time, so the
 * publikasi-katalog default stays as a mirrored copy. This test loads the
 * frontend module at runtime (it is plain TypeScript) and compares the actual
 * exported data, not source text.
 */
describe('publikasi catalog FE↔BE sync', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const fePath = join(here, '../../../frontend/src/content/publikasi.ts');

  it(
    'DEFAULT_CONTENT_BLOCKS publikasi-katalog matches frontend PUBLICATIONS',
    {
      skip: existsSync(fePath) ? false : 'frontend source is not in this checkout',
    },
    async () => {
      const feModule = (await import(pathToFileURL(fePath).href)) as {
        PUBLICATIONS?: unknown;
      };
      assert.ok(Array.isArray(feModule.PUBLICATIONS), 'PUBLICATIONS must be an array');
      const fePublications = feModule.PUBLICATIONS as PublicationLike[];
      assert.ok(fePublications.length > 0);

      const beBlock = DEFAULT_CONTENT_BLOCKS.find((b) => b.slug === 'publikasi-katalog');
      assert.ok(beBlock);
      const publications = (beBlock!.metadata as { publications: PublicationLike[] }).publications;
      assert.ok(Array.isArray(publications));

      assert.deepEqual(publications.map(normalize), fePublications.map(normalize));
    },
  );
});
