// The single home for what the media service accepts. Every limit, allowed type and purpose lives
// here as a named constant so policy changes are one reviewed diff, and so tests, validators and
// the multipart transport can never drift apart. See docs/SPEC.md §7 (media_assets).

export const MIB = 1024 * 1024;

export const MEDIA_KINDS = ['photo', 'document', 'data'] as const;
export type MediaKindName = (typeof MEDIA_KINDS)[number];

export const PHOTO_MAX_BYTES = 5 * MIB;
export const DOCUMENT_MAX_BYTES = 20 * MIB;
export const DATA_MAX_BYTES = 10 * MIB;

/** Photos are re-encoded: input pixel bound (decompression-bomb guard) and output long edge. */
export const PHOTO_MAX_INPUT_PIXELS = 40_000_000;
export const PHOTO_MAX_LONG_EDGE_PX = 2560;
export const PHOTO_THUMBNAIL_LONG_EDGE_PX = 320;
export const PHOTO_WEBP_QUALITY = 82;
export const PHOTO_THUMBNAIL_WEBP_QUALITY = 72;

/** OOXML (docx/xlsx) container inspection budget. Only the central directory is read. */
export const ZIP_CHECK_TIMEOUT_MS = 5_000;
export const ZIP_MAX_ENTRIES = 5_000;
export const ZIP_MAX_DECLARED_UNCOMPRESSED_BYTES = 500 * MIB;
export const ZIP_CONTENT_TYPES_MAX_BYTES = 512 * 1024;

export const MEDIA_ORIGINAL_NAME_MAX_LENGTH = 120;

export type MediaTypeKey = 'jpeg' | 'png' | 'webp' | 'pdf' | 'docx' | 'xlsx' | 'csv';

export interface MediaTypePolicy {
  kind: MediaKindName;
  /** MIME the server serves it as — always derived from the detected type, never the client. */
  mimeType: string;
  /** Extensions (lowercase, no dot) a client may declare for this detected type. */
  declaredExtensions: readonly string[];
  /** Extension used for the stored file when it is not transcoded. */
  storedExtension: string;
  maxBytes: number;
}

export const MEDIA_TYPE_POLICY: Record<MediaTypeKey, MediaTypePolicy> = {
  jpeg: {
    kind: 'photo',
    mimeType: 'image/jpeg',
    declaredExtensions: ['jpg', 'jpeg'],
    storedExtension: 'webp',
    maxBytes: PHOTO_MAX_BYTES,
  },
  png: {
    kind: 'photo',
    mimeType: 'image/png',
    declaredExtensions: ['png'],
    storedExtension: 'webp',
    maxBytes: PHOTO_MAX_BYTES,
  },
  webp: {
    kind: 'photo',
    mimeType: 'image/webp',
    declaredExtensions: ['webp'],
    storedExtension: 'webp',
    maxBytes: PHOTO_MAX_BYTES,
  },
  pdf: {
    kind: 'document',
    mimeType: 'application/pdf',
    declaredExtensions: ['pdf'],
    storedExtension: 'pdf',
    maxBytes: DOCUMENT_MAX_BYTES,
  },
  docx: {
    kind: 'document',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    declaredExtensions: ['docx'],
    storedExtension: 'docx',
    maxBytes: DOCUMENT_MAX_BYTES,
  },
  xlsx: {
    kind: 'data',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    declaredExtensions: ['xlsx'],
    storedExtension: 'xlsx',
    maxBytes: DATA_MAX_BYTES,
  },
  csv: {
    kind: 'data',
    mimeType: 'text/csv; charset=utf-8',
    declaredExtensions: ['csv'],
    storedExtension: 'csv',
    maxBytes: DATA_MAX_BYTES,
  },
};

/** The largest file any type may be; the multipart transport enforces this as a hard ceiling. */
export const MEDIA_TRANSPORT_MAX_BYTES = Math.max(
  ...Object.values(MEDIA_TYPE_POLICY).map((t) => t.maxBytes),
);

/** Multipart limits other than file size (one file per request, tiny text fields). */
export const MEDIA_MULTIPART_LIMITS = {
  files: 1,
  fields: 4,
  fieldSize: 256,
  fieldNameSize: 64,
  parts: 6,
  headerPairs: 50,
} as const;

/**
 * Where an asset's `<ownerKey>` path segment comes from. NEVER the client:
 *   fixed    - singleton slot with a constant key (one hero image, one Lurah portrait)
 *   uploader - the authenticated uploader's user id, a stable server-side identifier
 */
export type OwnerKeyRule = { type: 'fixed'; value: string } | { type: 'uploader' };

export interface MediaPurposePolicy {
  /** Which asset kinds this purpose may hold. */
  kinds: readonly MediaKindName[];
  owner: OwnerKeyRule;
}

/** Server-side purpose allowlist. A purpose not listed here is rejected before any bytes land. */
export const MEDIA_PURPOSES = {
  'portal-hero': { kinds: ['photo'], owner: { type: 'fixed', value: 'hero' } },
  'sambutan-lurah': { kinds: ['photo'], owner: { type: 'fixed', value: 'lurah' } },
  cerita: { kinds: ['photo'], owner: { type: 'uploader' } },
  tentang: { kinds: ['photo'], owner: { type: 'uploader' } },
  'publikasi-cover': { kinds: ['photo'], owner: { type: 'uploader' } },
  'publikasi-document': { kinds: ['document'], owner: { type: 'uploader' } },
  'sumber-daya-data': { kinds: ['data'], owner: { type: 'uploader' } },
} as const satisfies Record<string, MediaPurposePolicy>;

export type MediaPurpose = keyof typeof MEDIA_PURPOSES;

export function isMediaPurpose(value: unknown): value is MediaPurpose {
  return typeof value === 'string' && Object.hasOwn(MEDIA_PURPOSES, value);
}

/** Stored ownerKey segments must stay a single safe path component. */
const OWNER_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function resolveOwnerKey(purpose: MediaPurpose, uploaderId: string): string {
  const rule = MEDIA_PURPOSES[purpose].owner;
  const key = rule.type === 'fixed' ? rule.value : uploaderId;
  if (!OWNER_KEY_PATTERN.test(key)) {
    throw new Error('Owner key is not a safe path segment.');
  }
  return key;
}
