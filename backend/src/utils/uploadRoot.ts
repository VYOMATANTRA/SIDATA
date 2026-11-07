import { randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

type ErrnoError = Error & { code?: string };

/**
 * Repository root, derived from this module's location (backend/src/utils -> repo root), never
 * from process.cwd(). `configs/index.ts` locates the root `.env` the same way, so the two can
 * never disagree about where "the repository" is, whatever directory the process was started in.
 */
export const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

/** Directories created under the upload root. Anything else under it is not ours to touch. */
export const UPLOAD_SUBDIRS = ['_staging', 'photos', 'documents', 'derivatives'] as const;

export class UploadRootError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadRootError';
  }
}

/**
 * Turns the optional `UPLOAD_DIR` setting into an absolute, normalized path. Pure: no
 * filesystem access. Unset/blank -> `<repo-root>/uploads`; relative -> resolved against the
 * repository root (never the working directory); absolute -> used as given.
 */
export function resolveUploadDirPath(
  raw: string | undefined,
  repoRoot: string = REPO_ROOT,
): string {
  const trimmed = raw?.trim();
  if (!trimmed) return path.join(repoRoot, 'uploads');
  if (trimmed.includes('\0')) {
    throw new UploadRootError('UPLOAD_DIR contains a NUL byte.');
  }
  return path.isAbsolute(trimmed) ? path.normalize(trimmed) : path.resolve(repoRoot, trimmed);
}

/** True when `child` is `parent` itself or lives anywhere beneath it (both already absolute). */
export function isInsideOrEqual(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * realpath of the deepest ancestor that already exists, re-joined with the not-yet-created
 * remainder. Lets us judge where a directory WOULD land (symlinks included) before mkdir
 * creates anything.
 */
async function realpathOfDeepestExisting(target: string): Promise<string> {
  const missing: string[] = [];
  let current = target;
  for (;;) {
    try {
      const real = await realpath(current);
      return path.join(real, ...missing.reverse());
    } catch (error) {
      const code = (error as ErrnoError).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      missing.push(path.basename(current));
      current = parent;
    }
  }
}

export interface UploadRootInitOptions {
  /** Directories the upload root must never sit inside (or contain). Defaults to the app's own. */
  forbiddenDirs?: readonly string[];
}

/** This backend's own directory, wherever it is mounted (/app in the container). */
const BACKEND_DIR = path.resolve(import.meta.dirname, '../..');

function defaultForbiddenDirs(): string[] {
  return [
    ...new Set([
      BACKEND_DIR,
      path.join(REPO_ROOT, 'backend'),
      path.join(path.dirname(BACKEND_DIR), 'frontend'),
      path.join(REPO_ROOT, 'frontend'),
    ]),
  ];
}

async function assertNotOverlapping(
  candidateReal: string,
  forbiddenDirs: readonly string[],
): Promise<void> {
  for (const dir of forbiddenDirs) {
    const forbiddenReal = await realpathOfDeepestExisting(dir);
    // Inside backend/ or frontend/ would put user uploads next to (or into) the source tree and
    // the bind-mounted code volume; containing them (e.g. UPLOAD_DIR=<repo root>) is just as
    // bad, because the root would then be an ancestor of application code.
    if (
      isInsideOrEqual(forbiddenReal, candidateReal) ||
      isInsideOrEqual(candidateReal, forbiddenReal)
    ) {
      throw new UploadRootError(
        `UPLOAD_DIR resolves to a location that overlaps the application source tree ` +
          `(${path.basename(dir)}/). Point UPLOAD_DIR at a directory outside backend/ and ` +
          `frontend/, e.g. <repo-root>/uploads or an absolute path on a mounted volume.`,
      );
    }
  }
}

/**
 * Boot-time preparation of the upload root: validates where it really is, creates it plus the
 * fixed subdirectories, proves it is writable, and returns its canonical (realpath) form — the
 * only form the rest of the media code ever compares against. Throws UploadRootError with an
 * operator-facing message; callers (src/index.ts at boot, the media request paths per request) log it and degrade media to 503.
 */
export async function initUploadRoot(
  configured: string,
  options: UploadRootInitOptions = {},
): Promise<string> {
  const forbidden = options.forbiddenDirs ?? defaultForbiddenDirs();
  const normalized = path.normalize(configured);

  try {
    // Judge the final location before creating anything, so a bad setting never leaves stray
    // directories inside the source tree.
    await assertNotOverlapping(await realpathOfDeepestExisting(normalized), forbidden);

    await mkdir(normalized, { recursive: true });
    const real = await realpath(normalized);
    await assertNotOverlapping(real, forbidden);

    await access(real, fsConstants.R_OK | fsConstants.W_OK | fsConstants.X_OK);
    const probe = path.join(real, `.write-test-${randomUUID()}`);
    await writeFile(probe, 'ok', { flag: 'wx' });
    await rm(probe, { force: true });

    for (const sub of UPLOAD_SUBDIRS) {
      await mkdir(path.join(real, sub), { recursive: true });
    }
    return real;
  } catch (error) {
    if (error instanceof UploadRootError) throw error;
    const code = (error as ErrnoError).code ?? 'UNKNOWN';
    throw new UploadRootError(
      `UPLOAD_DIR is not usable (${code}). Check that the directory exists or can be created, ` +
        `and that the server user may read and write it (bind-mount ownership/permissions).`,
    );
  }
}
