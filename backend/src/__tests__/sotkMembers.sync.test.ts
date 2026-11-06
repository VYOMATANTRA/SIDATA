import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { DEFAULT_CONTENT_BLOCKS } from '../services/contentBlocks.service.js';

/**
 * Backend cannot import the Vue frontend module graph directly, so the
 * tentang-kelurahan-profil SOTK defaults stay as a mirrored copy in backend.
 * This test asserts that roles and official names match the FE SOTK_MEMBERS list
 * in frontend/src/content/tentang.ts, that no NIP/phone columns exist, and that
 * duties are null (SPEC §10).
 */
describe('SOTK members FE↔BE sync', () => {
  it('DEFAULT_CONTENT_BLOCKS tentang-kelurahan-profil matches frontend SOTK_MEMBERS', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const fePath = join(here, '../../../frontend/src/content/tentang.ts');
    const feSource = readFileSync(fePath, 'utf8');

    const beBlock = DEFAULT_CONTENT_BLOCKS.find((b) => b.slug === 'tentang-kelurahan-profil');
    assert.ok(beBlock, 'tentang-kelurahan-profil block must exist in DEFAULT_CONTENT_BLOCKS');
    const sotkMembers = (beBlock!.metadata as { sotkMembers: Array<Record<string, unknown>> })
      .sotkMembers;
    assert.ok(Array.isArray(sotkMembers));
    assert.equal(sotkMembers.length, 5);

    // Verify expected roles
    const expectedRoles = [
      'Lurah',
      'Sekretaris Lurah',
      'Kasi Trantib L-H',
      'Kasi Pemerintahan dan Pelayanan Publik',
      'Kasi Pemberdayaan Masyarakat',
    ];
    assert.deepEqual(
      sotkMembers.map((m) => m['role']),
      expectedRoles,
    );

    for (const member of sotkMembers) {
      assert.equal(typeof member['role'], 'string');
      // Duties must be null until approved job description exists (SPEC §10)
      assert.equal(member['duties'], null);
      // NIP or phone must NEVER be present
      assert.equal(member['nip'], undefined);
      assert.equal(member['phone'], undefined);

      // Role and officialName (if string) must appear in the FE source
      assert.match(feSource, new RegExp(escapeRegExp(String(member['role']))));
      if (typeof member['officialName'] === 'string') {
        assert.match(feSource, new RegExp(escapeRegExp(member['officialName'])));
      }
    }
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
