import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import PublikasiCatalogForm from '../components/admin/publikasi/PublikasiCatalogForm.vue';
import type { ContentBlock } from '../stores/contentBlocks.store';
import { PUBLICATIONS } from '../content/publikasi';

type Pub = Record<string, unknown>;

const AVAILABLE: Pub = {
  category: 'Statistik',
  title: 'Dokumen Uji A',
  description: 'Deskripsi uji A.',
  source: 'Sumber Uji A.pdf',
  href: 'https://example.com/a.pdf',
  fileType: 'PDF',
  fileSizeBytes: 1234567,
  isAvailableOnline: true,
};
const PENDING: Pub = {
  category: 'Infografis',
  title: 'Dokumen Uji B',
  description: 'Deskripsi uji B.',
  isAvailableOnline: false,
};

function block(publications: Pub[] | undefined): ContentBlock {
  return {
    id: 'b-p',
    sectionId: null,
    type: 'prose',
    slug: 'publikasi-katalog',
    title: 'Katalog Uji',
    body: 'Narasi uji.',
    metadata: publications === undefined ? null : { publications },
    sortOrder: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

function mountForm(publications?: Pub[]) {
  return mount(PublikasiCatalogForm, { props: { block: block(publications) } });
}

function payloadOf(wrapper: ReturnType<typeof mountForm>) {
  return wrapper.emitted('submit')?.[0]?.[0] as {
    metadata: { publications: Array<Record<string, unknown>> };
  };
}

async function useLink(wrapper: ReturnType<typeof mountForm>, index = 0) {
  await wrapper.find(`select#block-pub-mode-${index}`).setValue('link');
}

async function submit(wrapper: ReturnType<typeof mountForm>) {
  await wrapper.find('form').trigger('submit.prevent');
}

describe('PublikasiCatalogForm', () => {
  it('marks the catalog title as required instead of optional', () => {
    const wrapper = mountForm([AVAILABLE]);
    const label = wrapper.find('label[for$="-title"]');
    expect(label.text()).toContain('wajib');
    expect(wrapper.text()).not.toContain('ditampilkan di atas konten (opsional)');
  });

  it('round-trips every stored field unchanged, including source and exact byte size', async () => {
    const wrapper = mountForm([AVAILABLE, PENDING]);
    await submit(wrapper);
    expect(payloadOf(wrapper).metadata.publications).toEqual([AVAILABLE, PENDING]);
  });

  it('derives availability from the link so the two can never disagree', async () => {
    const wrapper = mountForm([PENDING]);
    expect(wrapper.find('[data-test="pub-status"]').text()).toContain('Segera hadir');

    await useLink(wrapper);
    await wrapper.find('input#block-pub-href-0').setValue('  https://example.com/b.pdf ');
    expect(wrapper.find('[data-test="pub-status"]').text()).toContain('Tersedia untuk diunduh');
    await submit(wrapper);
    expect(payloadOf(wrapper).metadata.publications[0]).toMatchObject({
      href: 'https://example.com/b.pdf',
      isAvailableOnline: true,
    });

    const wrapper2 = mountForm([AVAILABLE]);
    await wrapper2.find('input#block-pub-href-0').setValue('');
    await submit(wrapper2);
    const saved = payloadOf(wrapper2).metadata.publications[0]!;
    expect(saved.isAvailableOnline).toBe(false);
    expect('href' in saved).toBe(false);
  });

  it('rejects a link that is not https and blocks the save', async () => {
    const wrapper = mountForm([PENDING]);
    await useLink(wrapper);
    await wrapper.find('input#block-pub-href-0').setValue('http://example.com/b.pdf');
    await submit(wrapper);
    expect(wrapper.emitted('submit')).toBeFalsy();
    expect(wrapper.find('#block-pub-href-0-error').text()).toContain('https://');

    await wrapper.find('input#block-pub-href-0').setValue('https://');
    await submit(wrapper);
    expect(wrapper.emitted('submit')).toBeFalsy();
  });

  it('requires category, title and description per row with row-numbered errors', async () => {
    const wrapper = mountForm([AVAILABLE, PENDING]);
    await wrapper.find('input#block-pub-category-1').setValue('');
    await wrapper.find('input#block-pub-title-1').setValue('  ');
    await wrapper.find('textarea#block-pub-description-1').setValue('');
    await submit(wrapper);

    expect(wrapper.emitted('submit')).toBeFalsy();
    expect(wrapper.find('#block-pub-category-1-error').text()).toBe(
      'Publikasi 2: kategori wajib diisi.',
    );
    expect(wrapper.find('#block-pub-title-1-error').text()).toBe('Publikasi 2: judul wajib diisi.');
    expect(wrapper.find('#block-pub-description-1-error').text()).toBe(
      'Publikasi 2: deskripsi wajib diisi.',
    );
    expect(wrapper.find('input#block-pub-category-0').attributes('aria-invalid')).toBeUndefined();
  });

  it('enforces the backend length limits', async () => {
    const wrapper = mountForm([AVAILABLE]);
    expect(wrapper.find('input#block-pub-category-0').attributes('maxlength')).toBe('100');
    expect(wrapper.find('input#block-pub-title-0').attributes('maxlength')).toBe('255');
    expect(wrapper.find('textarea#block-pub-description-0').attributes('maxlength')).toBe('1000');
    expect(wrapper.find('input#block-pub-source-0').attributes('maxlength')).toBe('500');
    expect(wrapper.find('input#block-pub-fileType-0').attributes('maxlength')).toBe('20');
  });

  it('converts a typed size to whole bytes and keeps an untouched size exact', async () => {
    const wrapper = mountForm([{ ...PENDING }]);
    await useLink(wrapper);
    await wrapper.find('input#block-pub-size-0').setValue('2,5');
    await wrapper.find('select[aria-label^="Satuan"]').setValue('MB');
    await submit(wrapper);
    expect(payloadOf(wrapper).metadata.publications[0]!.fileSizeBytes).toBe(2621440);

    const kb = mountForm([{ ...PENDING }]);
    await useLink(kb);
    await kb.find('input#block-pub-size-0').setValue('300');
    await kb.find('select[aria-label^="Satuan"]').setValue('KB');
    await submit(kb);
    expect(payloadOf(kb).metadata.publications[0]!.fileSizeBytes).toBe(307200);

    // 1234567 bytes shows as 1.18 MB but is saved as 1234567 until the editor changes it.
    const untouched = mountForm([AVAILABLE]);
    expect((untouched.find('input#block-pub-size-0').element as HTMLInputElement).value).toBe(
      '1.18',
    );
    await submit(untouched);
    expect(payloadOf(untouched).metadata.publications[0]!.fileSizeBytes).toBe(1234567);
  });

  it('rejects a size that is not a positive number', async () => {
    const wrapper = mountForm([PENDING]);
    await useLink(wrapper);
    for (const bad of ['abc', '0', '-3', '1e3']) {
      await wrapper.find('input#block-pub-size-0').setValue(bad);
      await submit(wrapper);
      expect(wrapper.emitted('submit')).toBeFalsy();
      expect(wrapper.find('#block-pub-size-0-error').text()).toContain('lebih dari 0');
    }
    await wrapper.find('input#block-pub-size-0').setValue('');
    await submit(wrapper);
    const saved = payloadOf(wrapper).metadata.publications[0]!;
    expect('fileSizeBytes' in saved).toBe(false);
  });

  it('omits empty optional fields instead of sending blanks', async () => {
    const wrapper = mountForm([PENDING]);
    await submit(wrapper);
    const saved = payloadOf(wrapper).metadata.publications[0]!;
    expect(Object.keys(saved).sort()).toEqual([
      'category',
      'description',
      'isAvailableOnline',
      'title',
    ]);
  });

  it('adds, removes and reorders entries', async () => {
    const wrapper = mountForm([AVAILABLE, PENDING]);
    await wrapper.find('#block-pub-up-1').trigger('click');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Tambah publikasi')
      ?.trigger('click');
    await wrapper.find('input#block-pub-category-2').setValue('Lain');
    await wrapper.find('input#block-pub-title-2').setValue('Dokumen Uji C');
    await wrapper.find('textarea#block-pub-description-2').setValue('Deskripsi C');
    await wrapper.find('#block-pub-remove-1').trigger('click');
    await submit(wrapper);

    expect(payloadOf(wrapper).metadata.publications.map((p) => p.title)).toEqual([
      'Dokumen Uji B',
      'Dokumen Uji C',
    ]);
  });

  it('stops at 25 entries', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ ...PENDING, title: `Dokumen ${i}` }));
    const wrapper = mountForm(many);
    expect(
      wrapper
        .findAll('button')
        .find((b) => b.text() === 'Tambah publikasi')
        ?.attributes('disabled'),
    ).toBeDefined();
    expect(wrapper.find('[data-test="publications-full"]').text()).toContain('25 publikasi');
    expect(wrapper.text()).toContain('Maksimal 25 publikasi');
  });

  it('keeps a saved empty catalog empty: no default rows on open, [] on save', async () => {
    const wrapper = mountForm([]);
    expect(wrapper.findAll('li')).toHaveLength(0);
    expect(wrapper.find('[data-test="publications-empty"]').text()).toContain('daftar kosong');

    await submit(wrapper);
    expect(payloadOf(wrapper).metadata).toEqual({ publications: [] });

    // Reload of the saved block: still empty, never the built-in defaults.
    expect(mountForm([]).findAll('li')).toHaveLength(0);
  });

  it('pre-fills the built-in catalog only for a block that never stored a list', () => {
    const wrapper = mountForm(undefined);
    expect(wrapper.findAll('li')).toHaveLength(PUBLICATIONS.length);
  });

  it('keeps every row when the save fails', async () => {
    const wrapper = mountForm([AVAILABLE, PENDING]);
    await wrapper.find('input#block-pub-title-1').setValue('Judul draf');
    await submit(wrapper);
    await wrapper.setProps({ serverError: 'Gagal menyimpan perubahan blok konten.' });

    expect((wrapper.find('input#block-pub-title-1').element as HTMLInputElement).value).toBe(
      'Judul draf',
    );
    expect(wrapper.text()).toContain('Gagal menyimpan perubahan blok konten.');
    expect(wrapper.findAll('li')).toHaveLength(2);
  });
});
