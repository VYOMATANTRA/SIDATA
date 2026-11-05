import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
  const migrationSqlPath = join(
    here,
    '../../prisma/migrations/20261105000000_backfill_cms_blocks/migration.sql',
  );

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

  it('migration 20261105000000_backfill_cms_blocks SQL values stay in sync with DEFAULT_CONTENT_BLOCKS', () => {
    assert.ok(existsSync(migrationSqlPath), 'migration SQL file must exist');
    const sql = readFileSync(migrationSqlPath, 'utf8');

    for (const slug of ['tentang-kelurahan-profil', 'publikasi-katalog']) {
      const beBlock = DEFAULT_CONTENT_BLOCKS.find((b) => b.slug === slug);
      assert.ok(beBlock, `DEFAULT_CONTENT_BLOCKS must define ${slug}`);

      assert.ok(sql.includes(`'${slug}'`), `Migration SQL must insert ${slug}`);
      assert.ok(sql.includes(`'${beBlock.title}'`), `Migration SQL must insert matching title for ${slug}`);
      assert.ok(sql.includes(`'${beBlock.body}'`), `Migration SQL must insert matching body for ${slug}`);

      // Verify metadata JSON embedded in the SQL matches
      const match = sql.match(new RegExp(`'${slug}',\\s*'[^']+',\\s*'[^']+',\\s*'({.+?})'`, 's'));
      assert.ok(match && match[1], `Metadata JSON for ${slug} must be extracted from migration SQL`);
      const parsedSqlMeta = JSON.parse(match[1]);
      assert.deepEqual(parsedSqlMeta, beBlock.metadata, `Metadata for ${slug} in migration SQL must match DEFAULT_CONTENT_BLOCKS`);
    }
  });
});
