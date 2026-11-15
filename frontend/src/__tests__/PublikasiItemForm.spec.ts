import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import PublikasiItemForm from '../components/admin/publikasi/PublikasiItemForm.vue';

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

function mountForm(publication: Pub | null = null) {
  return mount(PublikasiItemForm, { props: { publication } });
}

type Wrapper = ReturnType<typeof mountForm>;

function payloadOf(wrapper: Wrapper): Pub {
  const emitted = wrapper.emitted('submit')?.[0]?.[0] as Pub | undefined;
  if (!emitted) throw new Error('the form did not submit');
  return emitted;
}

async function useLink(wrapper: Wrapper) {
  await wrapper.find('select#publikasi-item-mode').setValue('link');
}

async function submit(wrapper: Wrapper) {
  await wrapper.find('form').trigger('submit.prevent');
}

describe('PublikasiItemForm', () => {
  it('marks category, title and description as required', () => {
    const wrapper = mountForm(null);
    expect(wrapper.find('label[for="publikasi-item-category"]').text()).toContain('wajib');
    expect(wrapper.find('label[for="publikasi-item-title"]').text()).toContain('wajib');
    expect(wrapper.find('label[for="publikasi-item-description"]').text()).toContain('wajib');
  });

  it('round-trips every stored field unchanged, including source and exact byte size', async () => {
    const wrapper = mountForm(AVAILABLE);
    await submit(wrapper);
    expect(payloadOf(wrapper)).toEqual(AVAILABLE);

    const pending = mountForm(PENDING);
    await submit(pending);
    expect(payloadOf(pending)).toEqual(PENDING);
  });

  it('starts a new publication empty and sends only what was typed', async () => {
    const wrapper = mountForm(null);
    expect(wrapper.find('select#publikasi-item-mode').element).toHaveProperty('value', 'none');
    await wrapper.find('input#publikasi-item-category').setValue('Lain');
    await wrapper.find('input#publikasi-item-title').setValue('Dokumen Baru');
    await wrapper.find('textarea#publikasi-item-description').setValue('Deskripsi baru');
    await submit(wrapper);
    expect(payloadOf(wrapper)).toEqual({
      category: 'Lain',
      title: 'Dokumen Baru',
      description: 'Deskripsi baru',
      isAvailableOnline: false,
    });
  });

  it('derives availability from the link so the two can never disagree', async () => {
    const wrapper = mountForm(PENDING);
    expect(wrapper.find('[data-test="pub-status"]').text()).toContain('Segera hadir');

    await useLink(wrapper);
    await wrapper.find('input#publikasi-item-href').setValue('  https://example.com/b.pdf ');
    expect(wrapper.find('[data-test="pub-status"]').text()).toContain('Tersedia untuk diunduh');
    await submit(wrapper);
    expect(payloadOf(wrapper)).toMatchObject({
      href: 'https://example.com/b.pdf',
      isAvailableOnline: true,
    });

    const cleared = mountForm(AVAILABLE);
    await cleared.find('input#publikasi-item-href').setValue('');
    await submit(cleared);
    const saved = payloadOf(cleared);
    expect(saved.isAvailableOnline).toBe(false);
    expect('href' in saved).toBe(false);
  });

  it('rejects a link that is not https and blocks the save', async () => {
    const wrapper = mountForm(PENDING);
    await useLink(wrapper);
    await wrapper.find('input#publikasi-item-href').setValue('http://example.com/b.pdf');
    await submit(wrapper);
    expect(wrapper.emitted('submit')).toBeFalsy();
    expect(wrapper.find('#publikasi-item-href-error').text()).toContain('https://');

    await wrapper.find('input#publikasi-item-href').setValue('https://');
    await submit(wrapper);
    expect(wrapper.emitted('submit')).toBeFalsy();
  });

  it('requires category, title and description with field-tied errors', async () => {
    const wrapper = mountForm(AVAILABLE);
    await wrapper.find('input#publikasi-item-category').setValue('');
    await wrapper.find('input#publikasi-item-title').setValue('  ');
    await wrapper.find('textarea#publikasi-item-description').setValue('');
    await submit(wrapper);

    expect(wrapper.emitted('submit')).toBeFalsy();
    expect(wrapper.find('#publikasi-item-category-error').text()).toBe('Kategori wajib diisi.');
    expect(wrapper.find('#publikasi-item-title-error').text()).toBe('Judul wajib diisi.');
    expect(wrapper.find('#publikasi-item-description-error').text()).toBe(
      'Deskripsi wajib diisi.',
    );
    expect(wrapper.find('[role="alert"]').text()).toContain('Kategori wajib diisi.');
    expect(
      wrapper.find('input#publikasi-item-category').attributes('aria-invalid'),
    ).toBe('true');
  });

  it('enforces the backend length limits', () => {
    const wrapper = mountForm(AVAILABLE);
    expect(wrapper.find('input#publikasi-item-category').attributes('maxlength')).toBe('100');
    expect(wrapper.find('input#publikasi-item-title').attributes('maxlength')).toBe('255');
    expect(wrapper.find('textarea#publikasi-item-description').attributes('maxlength')).toBe(
      '1000',
    );
    expect(wrapper.find('input#publikasi-item-source').attributes('maxlength')).toBe('500');
    expect(wrapper.find('input#publikasi-item-fileType').attributes('maxlength')).toBe('20');
  });

  it('converts a typed size to whole bytes and keeps an untouched size exact', async () => {
    const wrapper = mountForm(PENDING);
    await useLink(wrapper);
    await wrapper.find('input#publikasi-item-size').setValue('2,5');
    await wrapper.find('select[aria-label="Satuan ukuran berkas"]').setValue('MB');
    await submit(wrapper);
    expect(payloadOf(wrapper).fileSizeBytes).toBe(2621440);

    const kb = mountForm(PENDING);
    await useLink(kb);
    await kb.find('input#publikasi-item-size').setValue('300');
    await kb.find('select[aria-label="Satuan ukuran berkas"]').setValue('KB');
    await submit(kb);
    expect(payloadOf(kb).fileSizeBytes).toBe(307200);

    // 1234567 bytes shows as 1.18 MB but is saved as 1234567 until the editor changes it.
    const untouched = mountForm(AVAILABLE);
    expect((untouched.find('input#publikasi-item-size').element as HTMLInputElement).value).toBe(
      '1.18',
    );
    await submit(untouched);
    expect(payloadOf(untouched).fileSizeBytes).toBe(1234567);
  });

  it('rejects a size that is not a positive number', async () => {
    const wrapper = mountForm(PENDING);
    await useLink(wrapper);
    for (const bad of ['abc', '0', '-3', '1e3']) {
      await wrapper.find('input#publikasi-item-size').setValue(bad);
      await submit(wrapper);
      expect(wrapper.emitted('submit')).toBeFalsy();
      expect(wrapper.find('#publikasi-item-size-error').text()).toContain('lebih dari 0');
    }
    await wrapper.find('input#publikasi-item-size').setValue('');
    await submit(wrapper);
    expect('fileSizeBytes' in payloadOf(wrapper)).toBe(false);
  });

  it('omits empty optional fields instead of sending blanks', async () => {
    const wrapper = mountForm(PENDING);
    await submit(wrapper);
    expect(Object.keys(payloadOf(wrapper)).sort()).toEqual([
      'category',
      'description',
      'isAvailableOnline',
      'title',
    ]);
  });

  it('sends a page count and a publication date when they are entered', async () => {
    const wrapper = mountForm(PENDING);
    await wrapper.find('input#publikasi-item-pageCount').setValue(' 12 ');
    await wrapper.find('input#publikasi-item-publishedAt').setValue('2026-03-15');
    await submit(wrapper);
    expect(payloadOf(wrapper)).toMatchObject({ pageCount: 12, publishedAt: '2026-03-15' });
  });

  it('accepts a month-only publication date and keeps a stored page count', async () => {
    const wrapper = mountForm({ ...PENDING, pageCount: 40, publishedAt: '2026-11' });
    expect((wrapper.find('input#publikasi-item-pageCount').element as HTMLInputElement).value).toBe(
      '40',
    );
    await submit(wrapper);
    expect(payloadOf(wrapper)).toMatchObject({ pageCount: 40, publishedAt: '2026-11' });
  });

  it('rejects a page count that is not a whole number from 1 to 100000', async () => {
    const wrapper = mountForm(PENDING);
    for (const bad of ['0', '1.5', '100001', 'abc', '-2']) {
      await wrapper.find('input#publikasi-item-pageCount').setValue(bad);
      await submit(wrapper);
      expect(wrapper.emitted('submit')).toBeFalsy();
      expect(wrapper.find('#publikasi-item-pageCount-error').text()).toContain('1 dan 100000');
    }
    await wrapper.find('input#publikasi-item-pageCount').setValue('100000');
    await submit(wrapper);
    expect(payloadOf(wrapper).pageCount).toBe(100000);
  });

  it('rejects a publication date that is not YYYY-MM or YYYY-MM-DD', async () => {
    const wrapper = mountForm(PENDING);
    for (const bad of ['2026', '2026-13', '03-2026', '2026-03-32', 'Maret 2026']) {
      await wrapper.find('input#publikasi-item-publishedAt').setValue(bad);
      await submit(wrapper);
      expect(wrapper.emitted('submit')).toBeFalsy();
      expect(wrapper.find('#publikasi-item-publishedAt-error').text()).toContain('YYYY-MM');
    }
  });

  it('does not submit while the parent reports a save in flight', async () => {
    const wrapper = mountForm(PENDING);
    await wrapper.setProps({ busy: true });
    await submit(wrapper);
    expect(wrapper.emitted('submit')).toBeFalsy();
    expect(wrapper.find('[data-test="item-save"]').text()).toContain('Menyimpan');
  });

  it('emits cancel from the Batal button without saving', async () => {
    const wrapper = mountForm(PENDING);
    await wrapper.find('[data-test="item-cancel"]').trigger('click');
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(wrapper.emitted('submit')).toBeFalsy();
  });
});
