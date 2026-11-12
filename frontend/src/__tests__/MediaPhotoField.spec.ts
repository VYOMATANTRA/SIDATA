import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import MediaPhotoField from '../components/common/MediaPhotoField.vue';
import { useAuthStore } from '../stores/auth';

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const MEDIA = {
  id: 'm-new',
  kind: 'photo',
  mimeType: 'image/webp',
  byteSize: 100,
  width: 10,
  height: 10,
  originalName: 'baru.jpg',
  previewUrl: '/api/media/m-new/preview',
};

let uploadResponse: () => Response | Promise<Response>;
let previewStatus: number;
let previewAuthHeaders: Array<string | null>;
let uploadCount: number;

function pickFile(wrapper: VueWrapper, name: string, type: string, size = 2048): void {
  const input = wrapper.find('input[type="file"]').element as HTMLInputElement;
  const picked = new File(['x'], name, { type });
  Object.defineProperty(picked, 'size', { value: size });
  Object.defineProperty(input, 'files', { value: [picked], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function lastBusy(wrapper: VueWrapper): unknown[] | undefined {
  const events = wrapper.emitted('busy') ?? [];
  return events[events.length - 1];
}

function mountField(props: Record<string, unknown> = {}): VueWrapper {
  return mount(MediaPhotoField, {
    props: { modelValue: null, purpose: 'cerita', label: 'Foto 1', ...props },
    attachTo: document.body,
  });
}

describe('MediaPhotoField', () => {
  let created: string[];
  let revoked: string[];

  beforeEach(() => {
    setActivePinia(createPinia());
    useAuthStore().setAuth({ id: 'u-1', email: 'e@example.com', role: 'editor' }, 'token-1');
    document.body.innerHTML = '';
    uploadResponse = () => json({ media: MEDIA }, 201);
    previewStatus = 200;
    previewAuthHeaders = [];
    uploadCount = 0;
    created = [];
    revoked = [];
    let counter = 0;
    URL.createObjectURL = vi.fn<(blob: Blob) => string>(() => {
      const url = `blob:test-${++counter}`;
      created.push(url);
      return url;
    });
    URL.revokeObjectURL = vi.fn<(url: string) => void>((url: string) => {
      revoked.push(url);
    });
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input, init) => {
        const url = String(input);
        if (url === '/api/auth/csrf-token') return json({ csrfToken: 'csrf' });
        if (url === '/api/media' && init?.method === 'POST') {
          uploadCount++;
          return uploadResponse();
        }
        if (url.endsWith('/preview')) {
          previewAuthHeaders.push(new Headers(init?.headers).get('Authorization'));
          return previewStatus === 200
            ? ({
                ok: true,
                status: 200,
                blob: async () => new Blob(['i'], { type: 'image/webp' }),
              } as Response)
            : json({ error: 'x' }, previewStatus);
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts empty with a labelled file button and the format hint', () => {
    const wrapper = mountField();

    expect(wrapper.find('[data-test="photo-preview"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="photo-pick"]').text()).toContain('Pilih foto');
    expect(wrapper.find('[data-test="photo-pick"]').attributes('for')).toBe(
      wrapper.find('input[type="file"]').attributes('id'),
    );
    expect(wrapper.text()).toContain('maksimal 5 MB');
    expect(wrapper.find('[data-test="photo-remove"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('uploads a picked photo with the purpose and emits the new asset id', async () => {
    const wrapper = mountField();

    pickFile(wrapper, 'baru.jpg', 'image/jpeg');
    await flushPromises();

    expect(uploadCount).toBe(1);
    expect(wrapper.emitted('update:modelValue')).toEqual([['m-new']]);
    expect(wrapper.emitted('uploaded')?.[0]?.[0]).toMatchObject({ id: 'm-new' });
    expect(wrapper.find('[data-test="photo-status"]').text()).toContain('berhasil diunggah');
    wrapper.unmount();
  });

  it('uploads a dropped photo and refuses more than one file at once', async () => {
    const wrapper = mountField();
    const zone = wrapper.find('[data-test="photo-dropzone"]');
    const one = new File(['x'], 'a.png', { type: 'image/png' });
    const two = new File(['x'], 'b.png', { type: 'image/png' });

    await zone.trigger('drop', { dataTransfer: { files: [one, two] } });
    expect(uploadCount).toBe(0);
    expect(wrapper.find('[data-test="photo-error"]').text()).toContain('satu foto');

    await zone.trigger('drop', { dataTransfer: { files: [one] } });
    await flushPromises();
    expect(uploadCount).toBe(1);
    expect(wrapper.emitted('update:modelValue')).toEqual([['m-new']]);
    wrapper.unmount();
  });

  it('shows the authenticated preview as a blob URL, never the API path', async () => {
    const wrapper = mountField({ modelValue: 'm-1' });
    await flushPromises();

    const image = wrapper.find('[data-test="photo-preview-image"]');
    expect(image.attributes('src')).toBe('blob:test-1');
    expect(previewAuthHeaders).toEqual(['Bearer token-1']);
    expect(wrapper.html()).not.toContain('/api/media');
    wrapper.unmount();
  });

  it('revokes the blob URL when the photo changes and when it unmounts', async () => {
    const wrapper = mountField({ modelValue: 'm-1' });
    await flushPromises();
    expect(created).toEqual(['blob:test-1']);

    await wrapper.setProps({ modelValue: 'm-2' });
    await flushPromises();
    expect(revoked).toEqual(['blob:test-1']);

    wrapper.unmount();
    expect(revoked).toEqual(['blob:test-1', 'blob:test-2']);
  });

  it('refuses a wrong file type before uploading and keeps the previous photo', async () => {
    const wrapper = mountField({ modelValue: 'm-1' });
    await flushPromises();

    pickFile(wrapper, 'dokumen.pdf', 'application/pdf');
    await flushPromises();

    expect(uploadCount).toBe(0);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.find('[data-test="photo-error"]').text()).toContain('JPEG, PNG, atau WebP');
    expect(wrapper.find('[data-test="photo-preview-image"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('refuses an oversize photo before uploading and keeps the previous photo', async () => {
    const wrapper = mountField({ modelValue: 'm-1' });
    await flushPromises();

    pickFile(wrapper, 'besar.jpg', 'image/jpeg', 6 * 1024 * 1024);
    await flushPromises();

    expect(uploadCount).toBe(0);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.find('[data-test="photo-error"]').text()).toContain('5 MB');
    wrapper.unmount();
  });

  it('keeps the previous photo and says why when the server refuses the upload', async () => {
    uploadResponse = () =>
      json({ error: 'Berkas bukan gambar yang valid', code: 'INVALID_IMAGE' }, 400);
    const wrapper = mountField({ modelValue: 'm-1' });
    await flushPromises();

    pickFile(wrapper, 'rusak.jpg', 'image/jpeg');
    await flushPromises();

    expect(uploadCount).toBe(1);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    const alert = wrapper.find('[data-test="photo-error"]');
    expect(alert.text()).toContain('rusak');
    expect(alert.text()).not.toMatch(/INVALID_IMAGE|400/);
    expect(wrapper.find('[data-test="photo-preview-image"]').attributes('src')).toBe('blob:test-1');
    wrapper.unmount();
  });

  it('words an oversize rejection from the server in plain Indonesian', async () => {
    uploadResponse = () => json({ error: 'Ukuran berkas melebihi', code: 'FILE_TOO_LARGE' }, 413);
    const wrapper = mountField();

    pickFile(wrapper, 'ok.jpg', 'image/jpeg');
    await flushPromises();

    expect(wrapper.find('[data-test="photo-error"]').text()).toContain('Ukuran foto melebihi 5 MB');
    wrapper.unmount();
  });

  it('reports busy while uploading and disables the controls', async () => {
    let finish: (response: Response) => void = () => undefined;
    uploadResponse = () => new Promise<Response>((resolve) => (finish = resolve));
    const wrapper = mountField({ modelValue: 'm-1' });
    await flushPromises();

    pickFile(wrapper, 'a.jpg', 'image/jpeg');
    await flushPromises();

    expect(lastBusy(wrapper)).toEqual([true]);
    expect(wrapper.find('input[type="file"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-test="photo-pick"]').text()).toContain('Mengunggah');

    finish(json({ media: MEDIA }, 201));
    await flushPromises();
    expect(lastBusy(wrapper)).toEqual([false]);
    wrapper.unmount();
  });

  it('removes the photo from the slot and moves focus back to the file input', async () => {
    const wrapper = mountField({ modelValue: 'm-1' });
    await flushPromises();

    await wrapper.find('[data-test="photo-remove"]').trigger('click');
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')).toEqual([[null]]);
    expect(document.activeElement).toBe(wrapper.find('input[type="file"]').element);
    wrapper.unmount();
  });

  it('offers a retry when the preview cannot be loaded', async () => {
    previewStatus = 500;
    const wrapper = mountField({ modelValue: 'm-1' });
    await flushPromises();

    expect(wrapper.find('[data-test="photo-preview-error"]').text()).toContain(
      'tidak dapat dimuat',
    );

    previewStatus = 200;
    await wrapper.find('[data-test="photo-preview-retry"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="photo-preview-image"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows a validation message from the parent and ties it to the input', () => {
    const wrapper = mountField({ error: 'Pilih foto untuk Foto 1.' });

    const input = wrapper.find('input[type="file"]');
    const errorId = wrapper.find('[data-test="photo-error"]').attributes('id');
    expect(wrapper.find('[data-test="photo-error"]').text()).toBe('Pilih foto untuk Foto 1.');
    expect(input.attributes('aria-invalid')).toBe('true');
    expect(input.attributes('aria-describedby')).toContain(errorId);
    wrapper.unmount();
  });
});
