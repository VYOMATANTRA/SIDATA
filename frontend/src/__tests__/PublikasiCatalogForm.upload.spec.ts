import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import PublikasiCatalogForm from '../components/admin/publikasi/PublikasiCatalogForm.vue';
import type { ContentBlock } from '../stores/contentBlocks.store';

const mocks = vi.hoisted(() => ({
  uploadMedia: vi.fn<(file: File, purpose: string) => Promise<unknown>>(),
  render: vi.fn<(file: File) => Promise<File | null>>(),
}));

vi.mock('../services/media.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/media.service')>()),
  uploadMedia: mocks.uploadMedia,
  fetchMediaPreviewBlob: vi.fn<() => Promise<Blob>>(
    async () => new Blob(['x'], { type: 'image/webp' }),
  ),
}));
vi.mock('../utils/pdfFirstPageCover', () => ({ renderPdfFirstPage: mocks.render }));

const DOC_ID = '11111111-1111-4111-8111-111111111111';
const COVER_ID = '22222222-2222-4222-8222-222222222222';
const HAND_ID = '33333333-3333-4333-8333-333333333333';

const BASE = {
  category: 'Statistik',
  title: 'Dokumen Uji',
  description: 'Deskripsi uji.',
  isAvailableOnline: false,
};

function block(publications: Array<Record<string, unknown>>): ContentBlock {
  return {
    id: 'b-p',
    sectionId: null,
    type: 'prose',
    slug: 'publikasi-katalog',
    title: 'Katalog Uji',
    body: 'Narasi uji.',
    metadata: { publications },
    sortOrder: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

function pick(wrapper: VueWrapper, selector: string, name: string, type: string): void {
  const input = wrapper.find(selector).element as HTMLInputElement;
  const file = new File(['x'], name, { type });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

const DOC = '[data-test="document-input"]';
const PHOTO = '[data-test="photo-input"]';

function payloadOf(wrapper: VueWrapper): Record<string, unknown> {
  const emitted = wrapper.emitted('submit')?.[0]?.[0] as
    { metadata: { publications: Array<Record<string, unknown>> } } | undefined;
  if (!emitted) throw new Error('the form did not submit');
  return emitted.metadata.publications[0]!;
}

async function submit(wrapper: VueWrapper) {
  await wrapper.find('form').trigger('submit.prevent');
}

describe('PublikasiCatalogForm uploads', () => {
  beforeEach(() => {
    mocks.uploadMedia.mockReset();
    mocks.render.mockReset();
    URL.createObjectURL = vi.fn<(obj: Blob | MediaSource) => string>(() => 'blob:cover');
    URL.revokeObjectURL = vi.fn<(url: string) => void>();
  });
  afterEach(() => vi.restoreAllMocks());

  async function mountRow(row: Record<string, unknown> = BASE) {
    const wrapper = mount(PublikasiCatalogForm, { props: { block: block([row]) } });
    await wrapper.find('select#block-pub-mode-0').setValue('file');
    return wrapper;
  }

  it('uploads a PDF, makes the cover from page 1 and sends document, cover and the auto flag', async () => {
    mocks.uploadMedia
      .mockResolvedValueOnce({ id: DOC_ID, byteSize: 2_097_152, originalName: 'laporan.pdf' })
      .mockResolvedValueOnce({ id: COVER_ID, byteSize: 100, originalName: 'laporan-sampul.jpg' });
    mocks.render.mockResolvedValue(new File(['j'], 'laporan-sampul.jpg', { type: 'image/jpeg' }));

    const wrapper = await mountRow();
    pick(wrapper, DOC, 'laporan.pdf', 'application/pdf');
    await flushPromises();

    expect(mocks.uploadMedia).toHaveBeenNthCalledWith(1, expect.any(File), 'publikasi-document');
    expect(mocks.uploadMedia).toHaveBeenNthCalledWith(2, expect.any(File), 'publikasi-cover');
    expect(wrapper.find('[data-test="cover-auto-note"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="document-current"]').text()).toContain('PDF, 2 MB');

    await submit(wrapper);
    expect(payloadOf(wrapper)).toEqual({
      ...BASE,
      documentAssetId: DOC_ID,
      coverAssetId: COVER_ID,
      coverIsAuto: true,
      isAvailableOnline: true,
    });
  });

  it('keeps the document and asks for a manual cover when page 1 cannot be rendered', async () => {
    mocks.uploadMedia.mockResolvedValueOnce({ id: DOC_ID, byteSize: 10, originalName: 'a.pdf' });
    mocks.render.mockResolvedValue(null);

    const wrapper = await mountRow();
    pick(wrapper, DOC, 'a.pdf', 'application/pdf');
    await flushPromises();

    expect(wrapper.find('[data-test="cover-notice"]').text()).toContain('secara manual');
    await submit(wrapper);
    const saved = payloadOf(wrapper);
    expect(saved.documentAssetId).toBe(DOC_ID);
    expect('coverAssetId' in saved).toBe(false);
  });

  it('never replaces a cover the editor chose by hand', async () => {
    mocks.uploadMedia.mockResolvedValueOnce({ id: DOC_ID, byteSize: 10, originalName: 'a.pdf' });
    const wrapper = await mountRow({ ...BASE, coverAssetId: HAND_ID });
    pick(wrapper, DOC, 'a.pdf', 'application/pdf');
    await flushPromises();

    expect(mocks.render).not.toHaveBeenCalled();
    await submit(wrapper);
    expect(payloadOf(wrapper)).toMatchObject({ documentAssetId: DOC_ID, coverAssetId: HAND_ID });
    expect(payloadOf(wrapper).coverIsAuto).toBeUndefined();
  });

  it('replaces an automatic cover when a new PDF is chosen', async () => {
    mocks.uploadMedia
      .mockResolvedValueOnce({ id: DOC_ID, byteSize: 10, originalName: 'b.pdf' })
      .mockResolvedValueOnce({ id: COVER_ID, byteSize: 10, originalName: 'b.jpg' });
    mocks.render.mockResolvedValue(new File(['j'], 'b.jpg', { type: 'image/jpeg' }));
    const wrapper = await mountRow({ ...BASE, coverAssetId: HAND_ID, coverIsAuto: true });
    pick(wrapper, DOC, 'b.pdf', 'application/pdf');
    await flushPromises();
    await submit(wrapper);
    expect(payloadOf(wrapper)).toMatchObject({ coverAssetId: COVER_ID, coverIsAuto: true });
  });

  it('drops an automatic cover when the document is replaced by a DOCX or removed', async () => {
    mocks.uploadMedia.mockResolvedValueOnce({ id: DOC_ID, byteSize: 10, originalName: 'a.docx' });
    const wrapper = await mountRow({
      ...BASE,
      documentAssetId: DOC_ID,
      coverAssetId: COVER_ID,
      coverIsAuto: true,
      isAvailableOnline: true,
    });
    pick(
      wrapper,
      DOC,
      'a.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    await flushPromises();
    await submit(wrapper);
    expect('coverAssetId' in payloadOf(wrapper)).toBe(false);

    const second = await mountRow({
      ...BASE,
      documentAssetId: DOC_ID,
      coverAssetId: COVER_ID,
      coverIsAuto: true,
      isAvailableOnline: true,
    });
    await second.find('[data-test="document-remove"]').trigger('click');
    await second.find('select#block-pub-mode-0').setValue('none');
    await submit(second);
    expect('coverAssetId' in payloadOf(second)).toBe(false);
  });

  it('makes no automatic cover for a DOCX', async () => {
    mocks.uploadMedia.mockResolvedValueOnce({ id: DOC_ID, byteSize: 10, originalName: 'a.docx' });
    const wrapper = await mountRow();
    pick(
      wrapper,
      DOC,
      'a.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    await flushPromises();
    expect(mocks.render).not.toHaveBeenCalled();
    expect(mocks.uploadMedia).toHaveBeenCalledTimes(1);
  });

  it('a hand-picked cover is saved without the auto flag', async () => {
    mocks.uploadMedia.mockResolvedValueOnce({ id: HAND_ID, byteSize: 10, originalName: 'c.jpg' });
    const wrapper = await mountRow({ ...BASE, coverAssetId: COVER_ID, coverIsAuto: true });
    pick(wrapper, PHOTO, 'c.jpg', 'image/jpeg');
    await flushPromises();
    // file mode needs a document before the save is allowed
    expect(wrapper.find('[data-test="cover-auto-note"]').exists()).toBe(false);
    await wrapper.find('select#block-pub-mode-0').setValue('none');
    await submit(wrapper);
    expect(payloadOf(wrapper)).toMatchObject({ coverAssetId: HAND_ID });
    expect(payloadOf(wrapper).coverIsAuto).toBeUndefined();
  });

  it('blocks the save while "Unggah berkas" has no file', async () => {
    const wrapper = await mountRow();
    await submit(wrapper);
    expect(wrapper.emitted('submit')).toBeFalsy();
    expect(wrapper.find('#block-pub-mode-0-error').text()).toContain('pilih berkas');
  });

  it('rejects a file that is not a PDF or DOCX before uploading', async () => {
    const wrapper = await mountRow();
    pick(wrapper, DOC, 'foto.png', 'image/png');
    await flushPromises();
    expect(mocks.uploadMedia).not.toHaveBeenCalled();
    expect(wrapper.find('[data-test="document-error"]').text()).toContain('PDF atau DOCX');
  });

  it('removing the file drops it from the save', async () => {
    const wrapper = await mountRow({
      ...BASE,
      documentAssetId: DOC_ID,
      fileType: 'PDF',
      fileSizeBytes: 2048,
      isAvailableOnline: true,
    });
    await wrapper.find('[data-test="document-remove"]').trigger('click');
    await wrapper.find('select#block-pub-mode-0').setValue('none');
    await submit(wrapper);
    const saved = payloadOf(wrapper);
    expect('documentAssetId' in saved).toBe(false);
    expect(saved.isAvailableOnline).toBe(false);
  });

  it('does not send the stored format or size of an uploaded file (the server derives them)', async () => {
    const wrapper = mount(PublikasiCatalogForm, {
      props: {
        block: block([
          {
            ...BASE,
            documentAssetId: DOC_ID,
            fileType: 'PDF',
            fileSizeBytes: 2048,
            isAvailableOnline: true,
          },
        ]),
      },
    });
    await submit(wrapper);
    const saved = payloadOf(wrapper);
    expect(saved).toEqual({ ...BASE, documentAssetId: DOC_ID, isAvailableOnline: true });
  });
});
