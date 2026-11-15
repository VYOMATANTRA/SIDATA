import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import CeritaThumbnailDialog from '../components/admin/cerita/CeritaThumbnailDialog.vue';
import ImageCropModal from '../components/common/ImageCropModal.vue';
import { ceritaCoverFor } from '../content/ceritaCovers';
import { useAuthStore } from '../stores/auth';
import { DEFAULT_BANNER_ASPECT_RATIO } from '../utils/imageCrop';

const body = (): DOMWrapper<HTMLElement> => new DOMWrapper(document.body);

function json(bodyData: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => bodyData,
  } as Response;
}

function pickFile(name = 'foto.jpg', type = 'image/jpeg', size = 2048): void {
  const input = document.body.querySelector('input[type="file"]') as HTMLInputElement;
  const picked = new File(['image-bytes'], name, { type });
  Object.defineProperty(picked, 'size', { value: size });
  Object.defineProperty(input, 'files', { value: [picked], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function mountDialog(props: Record<string, unknown> = {}): VueWrapper {
  return mount(CeritaThumbnailDialog, {
    props: {
      open: true,
      pageSlug: 'kependudukan',
      pageTitle: 'Kependudukan',
      coverAssetId: null,
      ...props,
    },
    global: {
      stubs: { teleport: true },
    },
    attachTo: document.body,
  });
}

describe('CeritaThumbnailDialog', () => {
  let fetchCalls: Array<{ url: string; method: string; body: unknown; auth: string | null }>;
  let uploadResponse: () => Response | Promise<Response>;
  let originalImage: typeof globalThis.Image;
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;

  beforeEach(() => {
    setActivePinia(createPinia());
    useAuthStore().setAuth({ id: 'u-1', email: 'e@example.com', role: 'editor' }, 'token-1');
    document.body.innerHTML = '';

    fetchCalls = [];
    uploadResponse = () =>
      json(
        {
          media: {
            id: 'media-99',
            kind: 'photo',
            mimeType: 'image/webp',
            byteSize: 1200,
            width: 1851,
            height: 731,
            originalName: 'thumbnail.webp',
            previewUrl: '/api/media/media-99/preview',
          },
        },
        201,
      );

    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    let urlCounter = 0;
    URL.createObjectURL = vi.fn<(blob: Blob) => string>(() => `blob:thumb-${++urlCounter}`);
    URL.revokeObjectURL = vi.fn<(url: string) => void>();

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      return {
        fillStyle: '',
        fillRect: vi.fn<() => void>(),
        drawImage: vi.fn<() => void>(),
      } as unknown as CanvasRenderingContext2D;
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback: BlobCallback) => {
      callback(new Blob(['cropped'], { type: 'image/webp' }));
    });

    originalImage = globalThis.Image;
    class MockImage {
      naturalWidth = 2000;
      naturalHeight = 1200;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private _src = '';
      get src(): string {
        return this._src;
      }
      set src(value: string) {
        this._src = value;
        if (value) queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', MockImage);

    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input, init) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        const auth = new Headers(init?.headers).get('Authorization');
        if (url === '/api/auth/csrf-token') return json({ csrfToken: 'csrf-1' });
        fetchCalls.push({ url, method, body: init?.body, auth });
        if (url === '/api/media' && method === 'POST') return uploadResponse();
        if (url.endsWith('/preview')) {
          return {
            ok: true,
            status: 200,
            blob: async () => new Blob(['img'], { type: 'image/webp' }),
          } as Response;
        }
        throw new Error(`unexpected fetch: ${method} ${url}`);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    globalThis.Image = originalImage;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    document.body.innerHTML = '';
  });

  it('configures ImageCropModal with 1851/731 aspect ratio and loads authenticated preview when coverAssetId is set', async () => {
    const wrapper = mountDialog({ coverAssetId: 'asset-1' });
    await flushPromises();

    const cropModal = wrapper.findComponent(ImageCropModal);
    expect(cropModal.exists()).toBe(true);
    expect(cropModal.props('aspectRatio')).toBeCloseTo(DEFAULT_BANNER_ASPECT_RATIO, 6);
    expect(cropModal.props('hasCustomImage')).toBe(true);
    expect(fetchCalls).toContainEqual(
      expect.objectContaining({
        url: '/api/media/asset-1/preview',
        method: 'GET',
        auth: 'Bearer token-1',
      }),
    );
    expect(cropModal.props('currentPreviewUrl')).toBe('blob:thumb-1');
    wrapper.unmount();
  });

  it('uses bundled ceritaCoverFor preview and omits preview fetch when coverAssetId is null', async () => {
    const wrapper = mountDialog({ coverAssetId: null, pageSlug: 'kependudukan' });
    await flushPromises();

    const cropModal = wrapper.findComponent(ImageCropModal);
    expect(cropModal.props('hasCustomImage')).toBe(false);
    expect(cropModal.props('currentPreviewUrl')).toBe(ceritaCoverFor('kependudukan'));
    expect(fetchCalls.filter((call) => call.url.includes('/preview'))).toHaveLength(0);
    wrapper.unmount();
  });

  it('uploads cropped file with purpose cerita-cover on save and emits submit with media id', async () => {
    const wrapper = mountDialog({ coverAssetId: null });
    await flushPromises();

    await body().find('[data-test="image-crop-form"]').trigger('submit');
    await flushPromises();

    const uploadCall = fetchCalls.find((c) => c.url === '/api/media' && c.method === 'POST');
    expect(uploadCall).toBeDefined();
    expect(uploadCall!.body).toBeInstanceOf(FormData);
    expect((uploadCall!.body as FormData).get('purpose')).toBe('cerita-cover');
    expect(wrapper.emitted('submit')).toEqual([['media-99']]);
    wrapper.unmount();
  });

  it('emits remove when ImageCropModal triggers remove', async () => {
    const wrapper = mountDialog({ coverAssetId: 'asset-1' });
    await flushPromises();

    await body().find('[data-test="crop-remove"]').trigger('click');
    await flushPromises();

    expect(wrapper.emitted('remove')).toHaveLength(1);
    wrapper.unmount();
  });

  it('surfaces MediaUploadError in AlertBanner without losing picked photo or zoom state', async () => {
    uploadResponse = () =>
      json({ error: 'Ukuran berkas melebihi batas', code: 'FILE_TOO_LARGE' }, 413);
    const wrapper = mountDialog({ coverAssetId: null });
    await flushPromises();

    pickFile('sampul.jpg', 'image/jpeg', 2048);
    await flushPromises();
    await body().find('[data-test="crop-zoom-in"]').trigger('click');
    const zoomBefore = body().find('[data-test="crop-zoom-value"]').text();

    await body().find('[data-test="image-crop-form"]').trigger('submit');
    await flushPromises();

    expect(body().find('[data-test="crop-error"]').text()).toContain('5 MB');
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(body().find('[data-test="crop-zoom-value"]').text()).toBe(zoomBefore);
    wrapper.unmount();
  });
});
