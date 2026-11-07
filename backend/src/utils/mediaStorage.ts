import { randomUUID } from 'node:crypto';
import { mkdir, realpath, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { UPLOAD_DIR } from '../configs/index.js';
import { MEDIA_ORIGINAL_NAME_MAX_LENGTH, type MediaKindName } from './mediaPolicy.js';
import { initUploadRoot, isInsideOrEqual } from './uploadRoot.js';

// ---------------------------------------------------------------------------------------------
// Upload root (canonical realpath), initialized lazily; only a successful init is cached.
// ---------------------------------------------------------------------------------------------

export interface UploadRootProvider {
  get(): Promise<string>;
  /** Test seam: pin the cached root (null forgets it). */
  set(root: string | Error | null): void;
}

/**
 * Lazily initializes the upload root and caches the SUCCESS only. A failed init is forgotten, so
 * the next caller retries and media recovers as soon as the storage becomes usable (mount fixed,
 * permissions repaired) without a restart.
 */
export function createUploadRootProvider(init: () => Promise<string>): UploadRootProvider {
  let rootPromise: Promise<string> | null = null;
  return {
    get() {
      if (!rootPromise) {
        const attempt = init();
        rootPromise = attempt;
        attempt.catch(() => {
          if (rootPromise === attempt) rootPromise = null;
        });
      }
      return rootPromise;
    },
    set(root) {
      if (root === null) {
        rootPromise = null;
      } else if (root instanceof Error) {
        rootPromise = Promise.reject(root);
        rootPromise.catch(() => undefined); // pinned failure: handled where it is awaited
      } else {
        rootPromise = Promise.resolve(root);
      }
    },
  };
}

const defaultProvider = createUploadRootProvider(() => initUploadRoot(UPLOAD_DIR));

/**
 * The canonical upload root. Boot (src/index.ts) probes it once and only WARNS on failure: the
 * rest of the API keeps serving, and every media request that needs the root retries here and
 * answers 503 MEDIA_STORAGE_UNAVAILABLE while it is unusable. Failures are never cached.
 */
export function getUploadRoot(): Promise<string> {
  return defaultProvider.get();
}

/**
 * Test seam: pin the cached root to an already-prepared temporary directory, or pin a failure
 * (an Error) to simulate an unusable UPLOAD_DIR. null resets.
 */
export function setUploadRootForTesting(root: string | Error | null): void {
  defaultProvider.set(root);
}

// ---------------------------------------------------------------------------------------------
// Storage layout: photos/<purpose>/<ownerKey>/<assetId>.webp, documents/..., derivatives/, _staging/
// ---------------------------------------------------------------------------------------------

export const STAGING_DIR = '_staging';
export const DERIVATIVES_DIR = 'derivatives';
export const THUMBNAIL_FILE = 'thumbnail.webp';

export function newAssetId(): string {
  return randomUUID();
}

export function buildStorageKey(
  kind: MediaKindName,
  purpose: string,
  ownerKey: string,
  assetId: string,
  extension: string,
): string {
  const top = kind === 'photo' ? 'photos' : 'documents';
  return path.posix.join(top, purpose, ownerKey, `${assetId}.${extension}`);
}

export function buildThumbnailKey(assetId: string): string {
  return path.posix.join(DERIVATIVES_DIR, assetId, THUMBNAIL_FILE);
}

export function stagingDirFor(root: string, uploadId: string): string {
  return path.join(root, STAGING_DIR, uploadId);
}

/** Removes a staging directory. Never throws: cleanup must not mask the original failure. */
export async function removeStagingDir(root: string, uploadId: string | undefined): Promise<void> {
  if (!uploadId || !/^[A-Za-z0-9-]{8,64}$/.test(uploadId)) return;
  try {
    await rm(stagingDirFor(root, uploadId), { recursive: true, force: true });
  } catch (error) {
    console.error('Gagal membersihkan direktori staging media:', (error as Error).message);
  }
}

/** Ensures the parent directory of a root-relative key exists and returns its absolute path. */
export async function prepareDestination(root: string, storageKey: string): Promise<string> {
  const absolute = lexicalResolve(root, storageKey);
  if (!absolute) throw new Error('Storage key escapes the upload root.');
  await mkdir(path.dirname(absolute), { recursive: true });
  return absolute;
}

/**
 * Join + containment without touching the disk. Rejects absolute keys, NULs, backslashes and any
 * `..` segment — keys we generate never contain them, so a hit means a corrupted row.
 */
export function lexicalResolve(root: string, storageKey: string): string | null {
  if (
    typeof storageKey !== 'string' ||
    storageKey.length === 0 ||
    storageKey.includes('\0') ||
    storageKey.includes('\\') ||
    path.posix.isAbsolute(storageKey) ||
    storageKey.split('/').some((segment) => segment === '..' || segment === '' || segment === '.')
  ) {
    return null;
  }
  const absolute = path.join(root, ...storageKey.split('/'));
  return isInsideOrEqual(root, absolute) && absolute !== root ? absolute : null;
}

/**
 * Resolves a stored key to a real file strictly inside the upload root: lexical check, then
 * realpath (so a symlink swapped in under the root cannot point serving outside it), then a
 * regular-file check. Returns null for anything missing or escaping — callers answer 404 with no
 * path in the body.
 */
export async function resolveStoredFile(root: string, storageKey: string): Promise<string | null> {
  const lexical = lexicalResolve(root, storageKey);
  if (!lexical) return null;
  try {
    const real = await realpath(lexical);
    if (!isInsideOrEqual(root, real) || real === root) return null;
    const info = await stat(real);
    return info.isFile() ? real : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Display names and response headers
// ---------------------------------------------------------------------------------------------

// Control characters (C0/C1), zero-width and bidi marks (LRM/RLM, embeddings/overrides, isolates)
// and the BOM. Built from escaped strings so no invisible character lives in the source.
const UNSAFE_NAME_CHARS = new RegExp(
  // eslint-disable-next-line no-control-regex
  '[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u202a-\\u202e\\u2066-\\u2069\\ufeff]',
  'g',
);
const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);
const HAS_LATIN1_HIGH = new RegExp('[\\u0080-\\u00ff]');
// eslint-disable-next-line no-control-regex
const HAS_BEYOND_LATIN1 = new RegExp('[^\\u0000-\\u00ff]');

/** multipart filenames arrive latin1-decoded; undo that when the bytes were really UTF-8. */
function repairFilenameEncoding(name: string): string {
  if (!HAS_LATIN1_HIGH.test(name) || HAS_BEYOND_LATIN1.test(name)) return name;
  const repaired = Buffer.from(name, 'latin1').toString('utf8');
  return repaired.includes(REPLACEMENT_CHAR) ? name : repaired;
}

/**
 * Display-only name for the DB and for Content-Disposition: basename only, no control/bidi
 * characters, bounded length. It is never used to build a filesystem path.
 */
export function sanitizeOriginalName(raw: unknown): string {
  if (typeof raw !== 'string') return 'berkas';
  let name = repairFilenameEncoding(raw).normalize('NFC');
  name = name.replace(UNSAFE_NAME_CHARS, '');
  name = name.split(/[\\/]/).pop() ?? '';
  name = name
    .replace(/[<>:"|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  name = name.replace(/^\.+/, '');
  if (!name) return 'berkas';
  if (name.length > MEDIA_ORIGINAL_NAME_MAX_LENGTH) {
    const ext = path.extname(name);
    const keep = ext.length > 0 && ext.length <= 10 ? ext : '';
    name = name.slice(0, MEDIA_ORIGINAL_NAME_MAX_LENGTH - keep.length) + keep;
  }
  return name;
}

/**
 * `Content-Disposition: attachment` with an ASCII fallback plus an RFC 5987 UTF-8 name. The
 * extension is forced to the stored type's, so a display name can never make a browser or OS
 * treat the download as a different kind of file.
 */
export function buildAttachmentDisposition(displayName: string, extension: string): string {
  const base = displayName.replace(/\.[A-Za-z0-9]{1,8}$/, '') || 'berkas';
  const full = `${base}.${extension}`;
  const ascii = full.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_') || `berkas.${extension}`;
  const encoded = encodeURIComponent(full).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
