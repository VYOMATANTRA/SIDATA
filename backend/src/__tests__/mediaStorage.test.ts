import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { MEDIA_PURPOSES, isMediaPurpose, resolveOwnerKey } from '../utils/mediaPolicy.js';
import {
  buildAttachmentDisposition,
  buildStorageKey,
  buildThumbnailKey,
  lexicalResolve,
  removeStagingDir,
  resolveStoredFile,
  sanitizeOriginalName,
  stagingDirFor,
} from '../utils/mediaStorage.js';

let sandbox: string;
let root: string;
let outside: string;

before(async () => {
  sandbox = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sidata-storage-')));
  root = path.join(sandbox, 'uploads');
  outside = path.join(sandbox, 'outside');
  await mkdir(path.join(root, 'photos', 'cerita', 'u1'), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(path.join(root, 'photos', 'cerita', 'u1', 'a.webp'), 'ok');
  await writeFile(path.join(outside, 'secret.txt'), 'secret');
});

after(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe('lexicalResolve', () => {
  it('joins a well-formed relative key under the root', () => {
    assert.equal(
      lexicalResolve(root, 'photos/cerita/u1/a.webp'),
      path.join(root, 'photos', 'cerita', 'u1', 'a.webp'),
    );
  });

  it('rejects traversal, absolute, backslash, empty-segment and NUL keys', () => {
    for (const key of [
      '../outside/secret.txt',
      'photos/../../outside/secret.txt',
      '/etc/passwd',
      'photos\\cerita\\a.webp',
      'photos//a.webp',
      './a.webp',
      '',
      'photos/a\0.webp',
      '..',
      'photos/..',
    ]) {
      assert.equal(lexicalResolve(root, key), null, `must reject ${JSON.stringify(key)}`);
    }
  });
});

describe('resolveStoredFile (realpath containment)', () => {
  it('returns the real path of a file inside the root', async () => {
    const file = await resolveStoredFile(root, 'photos/cerita/u1/a.webp');
    assert.equal(file, path.join(root, 'photos', 'cerita', 'u1', 'a.webp'));
  });

  it('returns null for missing files, directories and traversal keys', async () => {
    assert.equal(await resolveStoredFile(root, 'photos/cerita/u1/missing.webp'), null);
    assert.equal(await resolveStoredFile(root, 'photos/cerita'), null);
    assert.equal(await resolveStoredFile(root, '../outside/secret.txt'), null);
  });

  it('refuses a file symlink that points outside the root', async () => {
    await symlink(
      path.join(outside, 'secret.txt'),
      path.join(root, 'photos', 'cerita', 'u1', 'evil.webp'),
    );
    assert.equal(await resolveStoredFile(root, 'photos/cerita/u1/evil.webp'), null);
  });

  it('refuses a directory symlink that redirects a key outside the root', async () => {
    await symlink(outside, path.join(root, 'photos', 'escape'));
    assert.equal(await resolveStoredFile(root, 'photos/escape/secret.txt'), null);
  });

  it('accepts a symlink that stays inside the root', async () => {
    await symlink(
      path.join(root, 'photos', 'cerita', 'u1', 'a.webp'),
      path.join(root, 'photos', 'cerita', 'u1', 'alias.webp'),
    );
    assert.equal(
      await resolveStoredFile(root, 'photos/cerita/u1/alias.webp'),
      path.join(root, 'photos', 'cerita', 'u1', 'a.webp'),
    );
  });
});

describe('storage layout', () => {
  it('builds photos/ and documents/ keys from server-side parts only', () => {
    assert.equal(
      buildStorageKey('photo', 'portal-hero', 'hero', 'abc', 'webp'),
      'photos/portal-hero/hero/abc.webp',
    );
    assert.equal(
      buildStorageKey('document', 'publikasi-document', 'u1', 'abc', 'pdf'),
      'documents/publikasi-document/u1/abc.pdf',
    );
    assert.equal(
      buildStorageKey('data', 'sumber-daya-data', 'u1', 'abc', 'csv'),
      'documents/sumber-daya-data/u1/abc.csv',
    );
    assert.equal(buildThumbnailKey('abc'), 'derivatives/abc/thumbnail.webp');
  });

  it('only accepts allowlisted purposes', () => {
    for (const purpose of Object.keys(MEDIA_PURPOSES)) assert.equal(isMediaPurpose(purpose), true);
    for (const bad of [
      '',
      '../x',
      'hero',
      'PORTAL-HERO',
      'toString',
      '__proto__',
      'constructor',
      7,
      null,
    ]) {
      assert.equal(isMediaPurpose(bad), false, `must reject ${String(bad)}`);
    }
  });

  it('derives the owner key on the server: fixed for singletons, uploader id otherwise', () => {
    assert.equal(resolveOwnerKey('portal-hero', 'user-1'), 'hero');
    assert.equal(resolveOwnerKey('sambutan-lurah', 'user-1'), 'lurah');
    assert.equal(resolveOwnerKey('cerita', 'c0a8-user_1'), 'c0a8-user_1');
    assert.throws(() => resolveOwnerKey('cerita', '../etc'), /safe path segment/);
    assert.throws(() => resolveOwnerKey('cerita', 'a/b'), /safe path segment/);
  });

  it('removeStagingDir deletes the directory and ignores unsafe ids', async () => {
    const id = '11111111-2222-3333-4444-555555555555';
    const dir = stagingDirFor(root, id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'upload.bin'), 'x');
    await removeStagingDir(root, id);
    assert.equal(existsSync(dir), false);
    // A traversal-shaped id must not be interpreted as a path.
    await removeStagingDir(root, '../../outside');
    assert.equal(existsSync(path.join(outside, 'secret.txt')), true);
    await removeStagingDir(root, undefined);
  });
});

describe('sanitizeOriginalName', () => {
  it('keeps only a plain basename', () => {
    assert.equal(sanitizeOriginalName('../../etc/passwd'), 'passwd');
    assert.equal(sanitizeOriginalName('C:\\Users\\x\\laporan 2025.pdf'), 'laporan 2025.pdf');
    assert.equal(sanitizeOriginalName('/abs/path/foto.jpg'), 'foto.jpg');
    assert.equal(sanitizeOriginalName('.htaccess'), 'htaccess');
  });

  it('strips control, bidi and zero-width characters and reserved symbols', () => {
    assert.equal(sanitizeOriginalName('a\u0000b\u202ejpg.exe'), 'abjpg.exe');
    assert.equal(sanitizeOriginalName('a\r\nb.pdf'), 'ab.pdf');
    assert.equal(sanitizeOriginalName('we<ird>:"|?*.pdf'), 'we_ird______.pdf');
  });

  it('falls back for empty or non-string input and bounds the length keeping the extension', () => {
    assert.equal(sanitizeOriginalName(''), 'berkas');
    assert.equal(sanitizeOriginalName('///'), 'berkas');
    assert.equal(sanitizeOriginalName(undefined), 'berkas');
    const long = `${'a'.repeat(400)}.pdf`;
    const result = sanitizeOriginalName(long);
    assert.ok(result.length <= 120);
    assert.ok(result.endsWith('.pdf'));
  });

  it('repairs UTF-8 names that arrive latin1-decoded', () => {
    const mangled = Buffer.from('Laporan Peta é.pdf', 'utf8').toString('latin1');
    assert.equal(sanitizeOriginalName(mangled), 'Laporan Peta é.pdf');
  });
});

describe('buildAttachmentDisposition', () => {
  it('forces attachment and the stored extension', () => {
    const header = buildAttachmentDisposition('laporan.exe', 'pdf');
    assert.match(header, /^attachment; /);
    assert.match(header, /filename="laporan\.pdf"/);
    assert.doesNotMatch(header, /exe/);
  });

  it('keeps the header injection-safe and encodes non-ASCII names', () => {
    const header = buildAttachmentDisposition('a"b\r\nSet-Cookie: x=1; é.pdf', 'pdf');
    assert.doesNotMatch(header, /[\r\n]/);
    const ascii = /filename="([^"]*)"/.exec(header)?.[1] ?? '';
    assert.match(ascii, /^[A-Za-z0-9._-]+$/);
    assert.match(header, /filename\*=UTF-8''[A-Za-z0-9%._-]+$/);
  });
});
