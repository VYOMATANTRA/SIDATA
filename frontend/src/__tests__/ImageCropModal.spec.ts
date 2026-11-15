import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ImageCropModal from '../components/common/ImageCropModal.vue';
import { PHOTO_ACCEPT } from '../services/media.service';

const mountOptions = {
  global: {
    stubs: { teleport: true },
  },
};

function pickFile(wrapper: VueWrapper, name: string, type: string, size = 2048): void {
  const input = wrapper.find('input[type="file"]').element as HTMLInputElement;
  const picked = new File(['image-bytes'], name, { type });
  Object.defineProperty(picked, 'size', { value: size });
  Object.defineProperty(input, 'files', { value: [picked], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function mountModal(props: Record<string, unknown> = {}): VueWrapper {
  return mount(ImageCropModal, {
    props: {
      open: true,
      title: 'Ubah thumbnail halaman',
      description: 'Sesuaikan area gambar untuk tampilan beranda.',
      ...props,
    },
    global: mountOptions.global,
    attachTo: document.body,
  });
}

describe('ImageCropModal.vue', () => {
  let createdUrls: string[];
  let revokedUrls: string[];
  let drawImageSpy: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;
  let fillRectSpy: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;
  let toBlobMime: string;
  let originalImage: typeof globalThis.Image;

  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = '';

    createdUrls = [];
    revokedUrls = [];
    let urlCounter = 0;

    URL.createObjectURL = vi.fn<(blob: Blob) => string>(() => {
      const url = `blob:crop-test-${++urlCounter}`;
      createdUrls.push(url);
      return url;
    });
    URL.revokeObjectURL = vi.fn<(url: string) => void>((url: string) => {
      revokedUrls.push(url);
    });

    drawImageSpy = vi.fn<(...args: unknown[]) => void>();
    fillRectSpy = vi.fn<(...args: unknown[]) => void>();
    toBlobMime = 'image/webp';

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      return {
        fillStyle: '',
        fillRect: fillRectSpy,
        drawImage: drawImageSpy,
      } as unknown as CanvasRenderingContext2D;
    });

    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      callback: BlobCallback,
      type?: string,
    ) {
      const mime = toBlobMime || type || 'image/png';
      callback(new Blob(['cropped-image'], { type: mime }));
    });

    originalImage = globalThis.Image;
    class MockImage {
      naturalWidth = 1600;
      naturalHeight = 1200;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private _src = '';

      get src(): string {
        return this._src;
      }

      set src(value: string) {
        this._src = value;
        if (value) {
          queueMicrotask(() => {
            this.onload?.();
          });
        }
      }
    }
    vi.stubGlobal('Image', MockImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    globalThis.Image = originalImage;
    document.body.innerHTML = '';
  });

  it('renders BaseModal, file input with PHOTO_ACCEPT, current preview, and conditional Hapus thumbnail button', async () => {
    const wrapper = mountModal({
      currentPreviewUrl: 'blob:existing-cover',
      hasCustomImage: false,
    });
    await flushPromises();

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(wrapper.find('input[type="file"]').attributes('accept')).toBe(PHOTO_ACCEPT);
    expect(wrapper.find('[data-test="crop-canvas"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="crop-safe-zone"]').exists()).toBe(true);
    expect(drawImageSpy).toHaveBeenCalled();
    expect(wrapper.find('[data-test="crop-remove"]').exists()).toBe(false);

    await wrapper.setProps({ hasCustomImage: true });
    const removeBtn = wrapper.find('[data-test="crop-remove"]');
    expect(removeBtn.exists()).toBe(true);
    expect(removeBtn.text()).toContain('Hapus thumbnail');

    await removeBtn.trigger('click');
    expect(wrapper.emitted('remove')).toHaveLength(1);

    wrapper.unmount();
  });

  it('rejects invalid file type or oversize file via validatePhotoFile without clearing existing preview', async () => {
    const wrapper = mountModal({
      currentPreviewUrl: 'blob:existing-cover',
      hasCustomImage: true,
    });
    await flushPromises();

    const drawCountBefore = drawImageSpy.mock.calls.length;

    pickFile(wrapper, 'dokumen.pdf', 'application/pdf', 1024);
    await flushPromises();
    expect(wrapper.find('[data-test="crop-error"]').text()).toContain('JPEG, PNG, atau WebP');
    expect(createdUrls).toEqual([]);
    expect(drawImageSpy.mock.calls.length).toBe(drawCountBefore);

    pickFile(wrapper, 'terlalu-besar.jpg', 'image/jpeg', 6 * 1024 * 1024);
    await flushPromises();
    expect(wrapper.find('[data-test="crop-error"]').text()).toContain('5 MB');
    expect(createdUrls).toEqual([]);
    expect(wrapper.find('[data-test="crop-canvas"]').exists()).toBe(true);

    wrapper.unmount();
  });

  it('updates zoom and pan with keyboard arrow keys and +/- controls and updates aria-valuenow', async () => {
    const wrapper = mountModal({
      currentPreviewUrl: 'blob:existing-cover',
    });
    await flushPromises();

    const stage = wrapper.find('[data-test="crop-stage"]');
    const slider = wrapper.find('[data-test="crop-zoom-slider"]');

    expect(stage.attributes('tabindex')).toBe('0');
    expect(slider.attributes('aria-valuenow')).toBe('1');

    // Keyboard '+' zooms in and updates aria-valuenow
    await stage.trigger('keydown', { key: '+' });
    const zoomAfterPlus = Number(slider.attributes('aria-valuenow'));
    expect(zoomAfterPlus).toBeGreaterThan(1);

    // '+' button zooms in further, '-' button zooms back out
    await wrapper.find('[data-test="crop-zoom-in"]').trigger('click');
    const zoomAfterBtnIn = Number(slider.attributes('aria-valuenow'));
    expect(zoomAfterBtnIn).toBeGreaterThan(zoomAfterPlus);

    await wrapper.find('[data-test="crop-zoom-out"]').trigger('click');
    expect(Number(slider.attributes('aria-valuenow'))).toBeCloseTo(zoomAfterPlus, 2);

    // Keyboard '-' zooms out
    await stage.trigger('keydown', { key: '-' });
    expect(Number(slider.attributes('aria-valuenow'))).toBeCloseTo(1, 2);

    // Zoom in so both horizontal and vertical pan have room, then test arrow keys
    await wrapper.find('[data-test="crop-zoom-in"]').trigger('click');
    drawImageSpy.mockClear();

    await stage.trigger('keydown', { key: 'ArrowRight' });
    const sxRight = drawImageSpy.mock.calls[0]?.[1] as number;
    await stage.trigger('keydown', { key: 'ArrowLeft' });
    const sxLeft = drawImageSpy.mock.calls[1]?.[1] as number;
    expect(sxRight).not.toBe(sxLeft);

    await stage.trigger('keydown', { key: 'ArrowDown' });
    const syDown = drawImageSpy.mock.calls[2]?.[2] as number;
    await stage.trigger('keydown', { key: 'ArrowUp' });
    const syUp = drawImageSpy.mock.calls[3]?.[2] as number;
    expect(syDown).not.toBe(syUp);

    // Reset button restores zoom=1 and centered pan
    await wrapper.find('[data-test="crop-reset"]').trigger('click');
    expect(slider.attributes('aria-valuenow')).toBe('1');

    wrapper.unmount();
  });

  it('exports a cropped File on Simpan click and emits save', async () => {
    const wrapper = mountModal({
      currentPreviewUrl: 'blob:existing-cover',
    });
    await flushPromises();

    pickFile(wrapper, 'foto-baru.png', 'image/png', 2048);
    await flushPromises();
    expect(createdUrls).toEqual(['blob:crop-test-1']);

    await wrapper.find('[data-test="crop-save"]').trigger('click');
    await flushPromises();

    const saved = wrapper.emitted('save');
    expect(saved).toHaveLength(1);
    const file = saved?.[0]?.[0] as File;
    expect(file).toBeInstanceOf(File);
    expect(['image/webp', 'image/png']).toContain(file.type);

    wrapper.unmount();
    expect(revokedUrls).toContain('blob:crop-test-1');
  });

  it('displays AlertBanner on error and stale reload box on stale', async () => {
    const wrapper = mountModal({
      currentPreviewUrl: 'blob:existing-cover',
      error: 'Gagal mengunggah gambar.',
      errorKind: 'network',
      stale: true,
    });
    await flushPromises();

    const alert = wrapper.find('[data-test="crop-error"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('Gagal mengunggah gambar.');

    const staleBox = wrapper.find('[data-test="crop-stale"]');
    expect(staleBox.exists()).toBe(true);

    await wrapper.find('[data-test="crop-reload"]').trigger('click');
    expect(wrapper.emitted('reload')).toHaveLength(1);

    wrapper.unmount();
  });

  it('supports pointer drag-to-pan, slider input, and dropzone validation', async () => {
    const wrapper = mountModal({
      currentPreviewUrl: 'blob:existing-cover',
    });
    await flushPromises();

    // Zoom via slider input
    const slider = wrapper.find('[data-test="crop-zoom-slider"]');
    const sliderEl = slider.element as HTMLInputElement;
    sliderEl.value = '2';
    await slider.trigger('input');
    expect(slider.attributes('aria-valuenow')).toBe('2');

    // Drag to pan on stage
    drawImageSpy.mockClear();
    const stage = wrapper.find('[data-test="crop-stage"]');
    const dispatchPointer = (type: string, clientX: number, clientY: number) => {
      const ev = new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY });
      Object.defineProperty(ev, 'pointerId', { value: 1 });
      Object.defineProperty(ev, 'pointerType', { value: 'mouse' });
      stage.element.dispatchEvent(ev);
    };
    dispatchPointer('pointerdown', 200, 150);
    dispatchPointer('pointermove', 240, 170);
    dispatchPointer('pointerup', 240, 170);
    await flushPromises();
    expect(drawImageSpy).toHaveBeenCalled();

    // Reject dropping multiple files without clearing existing preview
    const zone = wrapper.find('[data-test="crop-dropzone"]');
    const f1 = new File(['a'], 'a.png', { type: 'image/png' });
    const f2 = new File(['b'], 'b.png', { type: 'image/png' });
    await zone.trigger('drop', { dataTransfer: { files: [f1, f2] } });
    expect(wrapper.find('[data-test="crop-error"]').text()).toContain('satu foto');
    expect(createdUrls).toEqual([]);

    // Accept dropping one valid photo
    await zone.trigger('drop', { dataTransfer: { files: [f1] } });
    await flushPromises();
    expect(createdUrls).toEqual(['blob:crop-test-1']);
    expect(slider.attributes('aria-valuenow')).toBe('1');

    wrapper.unmount();
  });
});
