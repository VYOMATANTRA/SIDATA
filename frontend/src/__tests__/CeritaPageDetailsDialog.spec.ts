import { describe, expect, it } from 'vitest';
import { DOMWrapper, mount } from '@vue/test-utils';
import CeritaPageDetailsDialog from '../components/admin/cerita/CeritaPageDetailsDialog.vue';

const body = (): DOMWrapper<HTMLElement> => new DOMWrapper(document.body);

function open(props: Record<string, unknown> = {}) {
  return mount(CeritaPageDetailsDialog, {
    props: { open: true, pageTitle: 'Kependudukan', ...props },
    attachTo: document.body,
  });
}

async function submit() {
  await body().find('[data-test="details-dialog"]').trigger('submit');
}

describe('CeritaPageDetailsDialog', () => {
  it('starts from the stored values and sends trimmed text, with blanks as null', async () => {
    const wrapper = open({
      headline: 'Judul Lama',
      bylineAuthor: 'Penulis',
      bylineAffiliation: null,
    });
    expect((body().find('[data-test="details-headline"]').element as HTMLInputElement).value).toBe(
      'Judul Lama',
    );
    await body().find('[data-test="details-headline"]').setValue('  Judul Baru  ');
    await body().find('[data-test="details-author"]').setValue('');
    await submit();
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      headline: 'Judul Baru',
      bylineAuthor: null,
      bylineAffiliation: null,
    });
    wrapper.unmount();
  });

  it('allows clearing everything', async () => {
    const wrapper = open({
      headline: 'Judul',
      bylineAuthor: 'Penulis',
      bylineAffiliation: 'Lembaga',
    });
    for (const field of ['headline', 'author', 'affiliation']) {
      await body().find(`[data-test="details-${field}"]`).setValue('');
    }
    await submit();
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      headline: null,
      bylineAuthor: null,
      bylineAffiliation: null,
    });
    wrapper.unmount();
  });

  it('refuses over-long text, HTML, hidden characters and an affiliation without an author', async () => {
    const wrapper = open();
    const attempts: Array<[string, string, string]> = [
      ['headline', 'x'.repeat(256), 'maksimal 255 karakter'],
      ['headline', '<b>tebal</b>', 'tag HTML'],
      ['author', 'a​b', 'karakter yang tidak diizinkan'],
      ['author', 'x'.repeat(121), 'maksimal 120 karakter'],
      ['affiliation', 'Lembaga', 'Isi nama penulis'],
    ];
    for (const [field, value, message] of attempts) {
      for (const f of ['headline', 'author', 'affiliation']) {
        await body().find(`[data-test="details-${f}"]`).setValue('');
      }
      await body().find(`[data-test="details-${field}"]`).setValue(value);
      await submit();
      expect(body().text()).toContain(message);
    }
    expect(wrapper.emitted('submit')).toBeUndefined();
    wrapper.unmount();
  });

  it('keeps the typed text and shows the reload button on a stale refusal', async () => {
    const wrapper = open({ error: 'Halaman baru saja diubah.', stale: true });
    await body().find('[data-test="details-headline"]').setValue('Draf saya');
    expect(body().find('[data-test="details-error"]').text()).toContain('baru saja diubah');
    await body().find('[data-test="details-reload"]').trigger('click');
    expect(wrapper.emitted('reload')).toHaveLength(1);
    expect((body().find('[data-test="details-headline"]').element as HTMLInputElement).value).toBe(
      'Draf saya',
    );
    wrapper.unmount();
  });

  it('does not submit while busy', async () => {
    const wrapper = open({ busy: true, headline: 'Judul' });
    await submit();
    expect(wrapper.emitted('submit')).toBeUndefined();
    wrapper.unmount();
  });
});
