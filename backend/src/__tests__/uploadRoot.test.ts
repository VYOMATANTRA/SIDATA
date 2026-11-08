import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, realpath, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  REPO_ROOT,
  UPLOAD_SUBDIRS,
  UploadRootError,
  initUploadRoot,
  isInsideOrEqual,
  resolveUploadDirPath,
} from '../utils/uploadRoot.js';

describe('resolveUploadDirPath', () => {
  const fakeRoot = path.join(path.sep, 'srv', 'sidata');

  it('defaults to <repo-root>/uploads when unset, empty or blank', () => {
    const expected = path.join(fakeRoot, 'uploads');
    assert.equal(resolveUploadDirPath(undefined, fakeRoot, 'development'), expected);
    assert.equal(resolveUploadDirPath('', fakeRoot, 'development'), expected);
    assert.equal(resolveUploadDirPath('   ', fakeRoot, 'development'), expected);
  });

  it('throws UploadRootError when NODE_ENV=production and UPLOAD_DIR is unset or empty', () => {
    assert.throws(
      () => resolveUploadDirPath(undefined, fakeRoot, 'production'),
      (error: unknown) =>
        error instanceof UploadRootError && /UPLOAD_DIR.*production/i.test(error.message),
    );
    assert.throws(
      () => resolveUploadDirPath('', fakeRoot, 'production'),
      (error: unknown) =>
        error instanceof UploadRootError && /UPLOAD_DIR.*production/i.test(error.message),
    );
    assert.throws(
      () => resolveUploadDirPath('   ', fakeRoot, 'production'),
      (error: unknown) =>
        error instanceof UploadRootError && /UPLOAD_DIR.*production/i.test(error.message),
    );

    const prevEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      assert.throws(
        () => resolveUploadDirPath(undefined, fakeRoot),
        (error: unknown) =>
          error instanceof UploadRootError && /UPLOAD_DIR.*production/i.test(error.message),
      );
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  it('resolves a relative path against the repository root', () => {
    assert.equal(
      resolveUploadDirPath('data/media', fakeRoot),
      path.join(fakeRoot, 'data', 'media'),
    );
    assert.equal(resolveUploadDirPath('./x/../media', fakeRoot), path.join(fakeRoot, 'media'));
  });

  it('uses an absolute path as given (normalized)', () => {
    assert.equal(
      resolveUploadDirPath('/var/lib/sidata/uploads/', fakeRoot),
      path.normalize('/var/lib/sidata/uploads/'),
    );
    assert.equal(
      resolveUploadDirPath('/var/lib//sidata/./uploads', fakeRoot),
      '/var/lib/sidata/uploads',
    );
  });

  it('rejects a NUL byte', () => {
    assert.throws(() => resolveUploadDirPath('a\0b', fakeRoot), UploadRootError);
  });

  it('derives the repository root from the module location, not process.cwd()', () => {
    const before = process.cwd();
    const elsewhere = os.tmpdir();
    try {
      process.chdir(elsewhere);
      const resolved = resolveUploadDirPath(undefined);
      assert.equal(resolved, path.join(REPO_ROOT, 'uploads'));
      assert.equal(resolveUploadDirPath('rel/dir'), path.join(REPO_ROOT, 'rel', 'dir'));
    } finally {
      process.chdir(before);
    }
    // backend/ is a direct child of the derived root.
    assert.ok(existsSync(path.join(REPO_ROOT, 'backend', 'package.json')));
  });
});

describe('isInsideOrEqual', () => {
  it('accepts the directory itself and descendants, rejects siblings and prefix lookalikes', () => {
    assert.equal(isInsideOrEqual('/a/b', '/a/b'), true);
    assert.equal(isInsideOrEqual('/a/b', '/a/b/c/d'), true);
    assert.equal(isInsideOrEqual('/a/b', '/a/bc'), false);
    assert.equal(isInsideOrEqual('/a/b', '/a'), false);
    assert.equal(isInsideOrEqual('/a/b', '/a/b/../c'), false);
  });
});

describe('initUploadRoot', () => {
  let sandbox: string;
  let fakeBackend: string;
  let fakeFrontend: string;

  beforeEach(async () => {
    sandbox = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sidata-uploadroot-')));
    fakeBackend = path.join(sandbox, 'repo', 'backend');
    fakeFrontend = path.join(sandbox, 'repo', 'frontend');
    await mkdir(fakeBackend, { recursive: true });
    await mkdir(fakeFrontend, { recursive: true });
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  const forbidden = () => ({ forbiddenDirs: [fakeBackend, fakeFrontend] });

  it('creates the root and fixed subdirectories and returns the canonical path', async () => {
    const target = path.join(sandbox, 'repo', 'uploads');
    const real = await initUploadRoot(target, forbidden());
    assert.equal(real, await realpath(target));
    for (const sub of UPLOAD_SUBDIRS) {
      assert.ok(existsSync(path.join(real, sub)), `${sub} must exist`);
    }
    // The writability probe cleans up after itself.
    const top = await readdir(real);
    assert.deepEqual(
      top.filter((name) => name.startsWith('.write-test')),
      [],
    );
  });

  it('is idempotent on re-run', async () => {
    const target = path.join(sandbox, 'uploads');
    const first = await initUploadRoot(target, forbidden());
    const second = await initUploadRoot(target, forbidden());
    assert.equal(first, second);
  });

  it('rejects a root inside backend/ or frontend/ and creates nothing there', async () => {
    for (const dir of [fakeBackend, fakeFrontend]) {
      const target = path.join(dir, 'uploads');
      await assert.rejects(() => initUploadRoot(target, forbidden()), UploadRootError);
      assert.equal(existsSync(target), false, 'no stray directory may be created');
    }
    await assert.rejects(() => initUploadRoot(fakeBackend, forbidden()), /source tree/);
  });

  it('rejects a root that contains the source tree (e.g. the repo root itself)', async () => {
    await assert.rejects(
      () => initUploadRoot(path.join(sandbox, 'repo'), forbidden()),
      /source tree/,
    );
    assert.equal(existsSync(path.join(sandbox, 'repo', '_staging')), false);
  });

  it('rejects a path that only reaches backend/ through a symlink (realpath check)', async () => {
    const link = path.join(sandbox, 'looks-harmless');
    await symlink(fakeBackend, link);
    await assert.rejects(() => initUploadRoot(link, forbidden()), UploadRootError);
    await assert.rejects(
      () => initUploadRoot(path.join(link, 'new-dir'), forbidden()),
      UploadRootError,
    );
    assert.equal(existsSync(path.join(fakeBackend, 'new-dir')), false);
    assert.equal(existsSync(path.join(fakeBackend, '_staging')), false);
  });

  it('accepts a symlinked root that resolves outside the source tree and returns the real target', async () => {
    const real = path.join(sandbox, 'volume');
    await mkdir(real);
    const link = path.join(sandbox, 'uploads-link');
    await symlink(real, link);
    assert.equal(await initUploadRoot(link, forbidden()), real);
  });

  it('applies the real backend/ and frontend/ of this repository by default', async () => {
    const inBackend = path.join(REPO_ROOT, 'backend', '__never_created_uploads__');
    await assert.rejects(() => initUploadRoot(inBackend), UploadRootError);
    assert.equal(existsSync(inBackend), false);
    const inFrontend = path.join(REPO_ROOT, 'frontend', '__never_created_uploads__');
    await assert.rejects(() => initUploadRoot(inFrontend), UploadRootError);
    assert.equal(existsSync(inFrontend), false);
  });

  it('fails with an operator-facing error when the path cannot be a directory', async () => {
    const file = path.join(sandbox, 'a-file');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, 'x');
    await assert.rejects(
      () => initUploadRoot(path.join(file, 'uploads'), forbidden()),
      (error: unknown) => {
        assert.ok(error instanceof UploadRootError);
        assert.match(error.message, /UPLOAD_DIR is not usable/);
        return true;
      },
    );
  });
});
