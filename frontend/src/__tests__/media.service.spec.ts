import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ApiError } from '../utils/apiClient';
import { useAuthStore } from '../stores/auth';
import {
  MediaUploadError,
  PHOTO_MAX_BYTES,
  fetchMediaPreviewBlob,
  mediaErrorMessage,
  mediaPreviewPath,
  uploadMedia,
  validatePhotoFile,
} from '../services/media.service';

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function apiError(status: number, code?: string): ApiError {
  return new ApiError('server sentence', status, { code, method: 'POST' });
}

function file(name: string, type: string, size = 1024): File {
  const picked = new File(['x'], name, { type });
  Object.defineProperty(picked, 'size', { value: size });
  return picked;
}

describe('validatePhotoFile', () => {
  it('accepts JPEG, PNG and WebP up to the photo limit', () => {
    expect(validatePhotoFile(file('a.jpg', 'image/jpeg'))).toBeNull();
    expect(validatePhotoFile(file('a.png', 'image/png'))).toBeNull();
    expect(validatePhotoFile(file('a.webp', 'image/webp', PHOTO_MAX_BYTES))).toBeNull();
  });

  it('treats the non-standard image/jpg type as JPEG but still refuses HEIC and other non-images', () => {
    expect(validatePhotoFile(file('a.jpg', 'image/jpg'))).toBeNull();
    expect(validatePhotoFile(file('a.heic', 'image/heic'))).toContain('JPEG, PNG, atau WebP');
    expect(validatePhotoFile(file('a.heif', 'image/heif'))).not.toBeNull();
    expect(validatePhotoFile(file('a.gif', 'image/gif'))).not.toBeNull();
  });

  it('refuses a wrong type, an oversize photo and an empty file with plain sentences', () => {
    expect(validatePhotoFile(file('a.pdf', 'application/pdf'))).toContain('JPEG, PNG, atau WebP');
    expect(validatePhotoFile(file('a.svg', 'image/svg+xml'))).toContain('JPEG, PNG, atau WebP');
    expect(validatePhotoFile(file('a.jpg', 'image/jpeg', PHOTO_MAX_BYTES + 1))).toContain('5 MB');
    expect(validatePhotoFile(file('a.jpg', 'image/jpeg', 0))).toContain('kosong');
  });

  it('falls back to the extension when the browser reports no type', () => {
    expect(validatePhotoFile(file('foto.JPG', ''))).toBeNull();
    expect(validatePhotoFile(file('foto.exe', ''))).not.toBeNull();
  });
});

describe('mediaErrorMessage', () => {
  it.each([
    ['FILE_TOO_LARGE', 413, '5 MB'],
    ['UNSUPPORTED_TYPE', 415, 'JPEG, PNG, atau WebP'],
    ['TYPE_MISMATCH', 415, 'JPEG, PNG, atau WebP'],
    ['INVALID_IMAGE', 400, 'rusak'],
    ['EMPTY_FILE', 400, 'kosong'],
    ['MEDIA_PROCESSING_BUSY', 429, 'Tunggu sebentar'],
    ['MEDIA_STORAGE_UNAVAILABLE', 503, 'tidak tersedia'],
  ])('words %s in plain Indonesian', (code, status, fragment) => {
    const message = mediaErrorMessage(apiError(status, code));
    expect(message).toContain(fragment);
    expect(message).not.toContain(code);
    expect(message).not.toContain('server sentence');
  });

  it('names the CSV formula problem and how to fix it for data uploads', () => {
    const message = mediaErrorMessage(apiError(415, 'CSV_FORMULA'), 'sumber-daya-data');
    expect(message).toContain('tanda petik');
  });

  it('words the size limit for the kind of file the purpose accepts', () => {
    expect(mediaErrorMessage(apiError(413, 'FILE_TOO_LARGE'), 'publikasi-document')).toContain(
      '20 MB',
    );
  });

  it('treats a bare 413 from a proxy as an oversize photo', () => {
    expect(mediaErrorMessage(apiError(413))).toContain('5 MB');
  });

  it('never shows a status code or a raw server string for an unknown failure', () => {
    const message = mediaErrorMessage(apiError(500));
    expect(message).not.toMatch(/500|server sentence|HTTP/);
    expect(message).toContain('Gagal mengunggah foto');
  });

  it('asks for a connection check on a network failure', () => {
    const message = mediaErrorMessage(apiError(0, 'NETWORK_ERROR'));
    expect(message).toContain('koneksi');
  });
});

describe('uploadMedia and previews', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useAuthStore().setAuth({ id: 'u-1', email: 'e@example.com', role: 'editor' }, 'token-1');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts one file and the purpose as multipart with CSRF and the bearer token', async () => {
    let seen: { body: unknown; headers: Headers } | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input, init) => {
        if (String(input) === '/api/auth/csrf-token') return json({ csrfToken: 'csrf-1' });
        seen = { body: init?.body, headers: new Headers(init?.headers) };
        return json(
          {
            media: {
              id: 'm-1',
              kind: 'photo',
              mimeType: 'image/webp',
              byteSize: 10,
              width: 2,
              height: 2,
              originalName: 'a.jpg',
              previewUrl: '/api/media/m-1/preview',
            },
          },
          201,
        );
      }),
    );

    const result = await uploadMedia(file('a.jpg', 'image/jpeg'), 'cerita');

    expect(result.id).toBe('m-1');
    expect(seen?.body).toBeInstanceOf(FormData);
    const form = seen?.body as FormData;
    expect(form.get('purpose')).toBe('cerita');
    expect((form.get('file') as File).name).toBe('a.jpg');
    expect(seen?.headers.get('x-csrf-token')).toBe('csrf-1');
    expect(seen?.headers.get('Authorization')).toBe('Bearer token-1');
    expect(seen?.headers.get('Content-Type')).toBeNull();
  });

  it('turns a refused upload into a MediaUploadError with approved text only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input) =>
        String(input) === '/api/auth/csrf-token'
          ? json({ csrfToken: 'csrf-1' })
          : json({ error: 'Ukuran berkas melebihi batas', code: 'FILE_TOO_LARGE' }, 413),
      ),
    );

    const failure = await uploadMedia(file('a.jpg', 'image/jpeg'), 'cerita').catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(MediaUploadError);
    expect((failure as MediaUploadError).message).toContain('5 MB');
    expect((failure as MediaUploadError).code).toBe('FILE_TOO_LARGE');
  });

  it('fetches the preview with the bearer token and returns the blob', async () => {
    let auth: string | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (_input, init) => {
        auth = new Headers(init?.headers).get('Authorization');
        return {
          ok: true,
          status: 200,
          blob: async () => new Blob(['img'], { type: 'image/webp' }),
        } as Response;
      }),
    );

    const blob = await fetchMediaPreviewBlob(mediaPreviewPath('m-1'));

    expect(blob.size).toBe(3);
    expect(auth).toBe('Bearer token-1');
    expect(mediaPreviewPath('m-1')).toBe('/api/media/m-1/preview');
  });
});
