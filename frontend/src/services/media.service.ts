import { ApiError, apiErrorFromResponse, apiFetch } from '../utils/apiClient';
import { toUserMessage } from '../utils/userMessages';

/**
 * Editor/admin side of the media store (SPEC §7 `media_assets`): upload one file and fetch its
 * private preview. Every call goes through `apiFetch`, so CSRF, the bearer token and one silent
 * session refresh come with it.
 *
 * The preview route authenticates with the `Authorization` header only (no cookie, no signed
 * URLs), so a bare `<img src>` would get 401. Callers load it with `fetchMediaPreviewBlob` (or
 * the `useAuthenticatedBlobUrl` composable) and display a blob URL.
 */

export type MediaPurpose =
  | 'portal-hero'
  | 'sambutan-lurah'
  | 'cerita'
  | 'tentang'
  | 'publikasi-cover'
  | 'publikasi-document'
  | 'sumber-daya-data';

type MediaKind = 'photo' | 'document' | 'data';

/** Which kind of file each purpose accepts, only to word an error for the right kind of file. */
const PURPOSE_KIND: Readonly<Record<MediaPurpose, MediaKind>> = {
  'portal-hero': 'photo',
  'sambutan-lurah': 'photo',
  cerita: 'photo',
  tentang: 'photo',
  'publikasi-cover': 'photo',
  'publikasi-document': 'document',
  'sumber-daya-data': 'data',
};

const MIB = 1024 * 1024;

/** Mirrors `backend/src/utils/mediaPolicy.ts`; the server stays the authority. */
export const PHOTO_MAX_BYTES = 5 * MIB;
export const PHOTO_MAX_MB_LABEL = '5 MB';
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';
// `image/jpg` is not a registered type, but some browsers and tools report it for a real JPEG.
const PHOTO_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);
const PHOTO_EXTENSIONS: ReadonlySet<string> = new Set(['jpg', 'jpeg', 'png', 'webp']);

export interface MediaUploadResult {
  id: string;
  kind: MediaKind;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  originalName: string;
  /** An API path, not a browser-loadable URL: load it with the authenticated client. */
  previewUrl: string;
}

/** Carries approved plain-Indonesian text only; the raw server sentence never reaches `message`. */
export class MediaUploadError extends Error {
  code: string | undefined;
  status: number | null;

  constructor(message: string, code?: string, status: number | null = null) {
    super(message);
    this.name = 'MediaUploadError';
    this.code = code;
    this.status = status;
  }
}

export const PHOTO_WRONG_TYPE_MESSAGE =
  'Jenis berkas tidak didukung. Gunakan foto berformat JPEG, PNG, atau WebP.';
export const PHOTO_TOO_LARGE_MESSAGE = `Ukuran foto melebihi ${PHOTO_MAX_MB_LABEL}. Perkecil foto lalu coba lagi.`;
export const PHOTO_EMPTY_MESSAGE = 'Berkas ini kosong. Pilih foto lain.';

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * Checks a picked photo before anything is sent, so the common mistakes (a PDF, a 12 MB camera
 * original) fail at once with a plain sentence. Returns null when the file may be uploaded. The
 * server repeats the check by file signature, which is the one that decides.
 */
export function validatePhotoFile(file: File): string | null {
  // Some browsers and platforms report no type or a generic one (`application/octet-stream`) for a
  // real photo, so whenever the reported type is not an allowed photo type the extension decides.
  // The server then checks the actual content.
  const typeOk = PHOTO_MIME_TYPES.has(file.type) || PHOTO_EXTENSIONS.has(extensionOf(file.name));
  if (!typeOk) return PHOTO_WRONG_TYPE_MESSAGE;
  if (file.size === 0) return PHOTO_EMPTY_MESSAGE;
  if (file.size > PHOTO_MAX_BYTES) return PHOTO_TOO_LARGE_MESSAGE;
  return null;
}

export const DOCUMENT_MAX_BYTES = 20 * MIB;
export const DOCUMENT_ACCEPT =
  'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.docx';
const DOCUMENT_EXTENSIONS: ReadonlySet<string> = new Set(['pdf', 'docx']);
export const DOCUMENT_WRONG_TYPE_MESSAGE = 'Jenis berkas tidak didukung. Gunakan PDF atau DOCX.';
export const DOCUMENT_TOO_LARGE_MESSAGE =
  'Ukuran berkas melebihi 20 MB. Perkecil berkas lalu coba lagi.';
export const DOCUMENT_EMPTY_MESSAGE = 'Berkas ini kosong. Pilih berkas lain.';

/** Same early check as `validatePhotoFile`, for a PDF or DOCX publication. */
export function validateDocumentFile(file: File): string | null {
  if (!DOCUMENT_EXTENSIONS.has(extensionOf(file.name))) return DOCUMENT_WRONG_TYPE_MESSAGE;
  if (file.size === 0) return DOCUMENT_EMPTY_MESSAGE;
  if (file.size > DOCUMENT_MAX_BYTES) return DOCUMENT_TOO_LARGE_MESSAGE;
  return null;
}

const NOUN: Readonly<Record<MediaKind, string>> = {
  photo: 'foto',
  document: 'dokumen',
  data: 'berkas data',
};
const LIMIT: Readonly<Record<MediaKind, string>> = {
  photo: '5 MB',
  document: '20 MB',
  data: '10 MB',
};

/** Plain-language text for every code `POST /api/media` can answer with. */
export function mediaErrorMessage(error: unknown, purpose: MediaPurpose = 'cerita'): string {
  const kind = PURPOSE_KIND[purpose];
  const noun = NOUN[kind];
  const code = error instanceof ApiError ? error.code : undefined;
  const status = error instanceof ApiError ? error.status : null;

  switch (code) {
    case 'FILE_TOO_LARGE':
      return `Ukuran ${noun} melebihi ${LIMIT[kind]}. Perkecil ${noun} lalu coba lagi.`;
    case 'UNSUPPORTED_TYPE':
    case 'TYPE_MISMATCH':
      return kind === 'photo'
        ? PHOTO_WRONG_TYPE_MESSAGE
        : `Jenis berkas tidak didukung untuk ${noun} ini.`;
    case 'INVALID_IMAGE':
      return 'Foto tidak dapat dibaca atau rusak. Pilih foto lain.';
    case 'EMPTY_FILE':
      return `Berkas ini kosong. Pilih ${noun} lain.`;
    case 'CSV_FORMULA':
      return "Ada sel di berkas CSV yang diawali tanda =, +, -, atau @. Awali nilai itu dengan tanda petik satu (') lalu unggah lagi.";
    case 'INVALID_CSV':
      return 'Berkas CSV tidak dapat dibaca. Simpan sebagai CSV UTF-8 tanpa karakter kontrol lalu coba lagi.';
    case 'INVALID_ARCHIVE':
      return 'Dokumen rusak atau tidak dapat diperiksa. Simpan ulang dokumen lalu coba lagi.';
    case 'MACRO_ENABLED':
      return 'Dokumen berisi makro sehingga tidak diterima. Simpan tanpa makro lalu coba lagi.';
    case 'MEDIA_PROCESSING_BUSY':
      return 'Server sedang memproses banyak berkas. Tunggu sebentar lalu coba lagi.';
    case 'MEDIA_STORAGE_UNAVAILABLE':
      return 'Penyimpanan berkas sedang tidak tersedia. Coba lagi nanti atau hubungi Admin.';
    case 'NETWORK_ERROR':
      return `Tidak dapat mengunggah ${noun}. Periksa koneksi lalu coba lagi.`;
    case 'FILE_REQUIRED':
      return `Pilih ${noun} terlebih dahulu.`;
    case 'INVALID_UPLOAD':
      return `Unggahan tidak valid. Pilih satu ${noun} saja lalu coba lagi.`;
    case 'INVALID_PURPOSE':
    case 'PURPOSE_KIND_MISMATCH':
      return `Jenis berkas ini tidak cocok untuk bagian tersebut. Pilih ${noun} yang sesuai.`;
    default:
      break;
  }

  // A proxy in front of the API can answer 413 without our body.
  if (status === 413) {
    return `Ukuran ${noun} melebihi ${LIMIT[kind]}. Perkecil ${noun} lalu coba lagi.`;
  }
  if (status === 415) {
    return kind === 'photo' ? PHOTO_WRONG_TYPE_MESSAGE : `Jenis berkas tidak didukung.`;
  }
  return toUserMessage(error, `mengunggah ${noun}`, 'POST').message;
}

/** `/api/media/<id>/preview`: where an editor can read any asset, attached or not. */
export function mediaPreviewPath(mediaId: string): string {
  return `/api/media/${encodeURIComponent(mediaId)}/preview`;
}

/** Uploads one file. One file per request; the server answers 201 with `{ media }`. */
export async function uploadMedia(file: File, purpose: MediaPurpose): Promise<MediaUploadResult> {
  const form = new FormData();
  form.append('purpose', purpose);
  form.append('file', file);

  let response: Response;
  try {
    response = await apiFetch('/api/media', { method: 'POST', body: form });
  } catch (error) {
    throw new MediaUploadError(mediaErrorMessage(error, purpose), undefined, null);
  }

  if (!response.ok) {
    const error = await apiErrorFromResponse(response, '/api/media', 'POST');
    throw new MediaUploadError(mediaErrorMessage(error, purpose), error.code, error.status);
  }

  const data = (await response.json()) as { media?: MediaUploadResult };
  if (!data.media || typeof data.media.id !== 'string') {
    throw new MediaUploadError(mediaErrorMessage(undefined, purpose));
  }
  return data.media;
}

/** Fetches a private preview with the bearer token so it can be shown from a blob URL. */
export async function fetchMediaPreviewBlob(previewPath: string): Promise<Blob> {
  const response = await apiFetch(previewPath);
  if (!response.ok) {
    throw await apiErrorFromResponse(response, previewPath, 'GET');
  }
  return response.blob();
}
