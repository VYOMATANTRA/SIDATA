import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import CeritaParagraphForm from '../components/admin/cerita/CeritaParagraphForm.vue';

function mountForm(initial = { title: 'Pembuka', body: 'Isi paragraf.' }) {
  return mount(CeritaParagraphForm, {
    props: { idPrefix: 'p', initial },
    attachTo: document.body,
  });
}

function lastDirty(wrapper: ReturnType<typeof mountForm>): unknown[] | undefined {
  const events = wrapper.emitted('dirty-change') ?? [];
  return events[events.length - 1];
}

describe('CeritaParagraphForm dirty state', () => {
  it('is clean until something is really changed', async () => {
    const wrapper = mountForm();
    expect(lastDirty(wrapper)).toEqual([false]);

    await wrapper.find('[data-test="paragraph-body"]').setValue('Isi lain.');
    expect(lastDirty(wrapper)).toEqual([true]);

    await wrapper.find('[data-test="paragraph-body"]').setValue('Isi paragraf.');
    expect(lastDirty(wrapper)).toEqual([false]);
    wrapper.unmount();
  });

  it('ignores spaces and line breaks around the text, the way saving does', async () => {
    const wrapper = mountForm();

    await wrapper.find('[data-test="paragraph-body"]').setValue('  Isi paragraf.\n\n ');
    await wrapper.find('[data-test="paragraph-title"]').setValue(' Pembuka  ');

    expect(lastDirty(wrapper)).toEqual([false]);
    wrapper.unmount();
  });

  it('is clean after a save whose trimmed text now equals what is stored', async () => {
    const wrapper = mountForm();
    await wrapper.find('[data-test="paragraph-body"]').setValue('Isi baru.  \n');
    expect(lastDirty(wrapper)).toEqual([true]);

    // The list stores the trimmed text and passes it back as the new baseline.
    await wrapper.setProps({ initial: { title: 'Pembuka', body: 'Isi baru.' } });

    expect(lastDirty(wrapper)).toEqual([false]);
    wrapper.unmount();
  });
});

describe('CeritaParagraphForm format toolbar', () => {
  function bodyEl(wrapper: ReturnType<typeof mountForm>): HTMLTextAreaElement {
    return wrapper.find('[data-test="paragraph-body"]').element as HTMLTextAreaElement;
  }

  async function select(wrapper: ReturnType<typeof mountForm>, text: string, start: number, end: number) {
    await wrapper.find('[data-test="paragraph-body"]').setValue(text);
    bodyEl(wrapper).setSelectionRange(start, end);
  }

  it('renders a labelled toolbar with four real buttons', () => {
    const wrapper = mountForm();
    const toolbar = wrapper.find('[role="toolbar"]');
    expect(toolbar.attributes('aria-label')).toBe('Format teks');
    const buttons = toolbar.findAll('button');
    expect(buttons.map((b) => b.text())).toEqual(['Tebal', 'Miring', 'Tautan', 'Daftar']);
    for (const button of buttons) expect(button.attributes('type')).toBe('button');
    wrapper.unmount();
  });

  it('describes the syntax in a hint linked to the textarea', () => {
    const wrapper = mountForm();
    const textarea = wrapper.find('[data-test="paragraph-body"]');
    const hintId = textarea.attributes('aria-describedby')!.split(' ')[0]!;
    expect(wrapper.find(`#${hintId}`).text()).toBe(
      'Gunakan tombol di atas atau ketik **tebal**, *miring*, [teks](alamat), dan baris yang diawali - untuk daftar.',
    );
    wrapper.unmount();
  });

  it('wraps the selection in bold markers and keeps the text selected', async () => {
    const wrapper = mountForm();
    await select(wrapper, 'ada teks', 4, 8);
    await wrapper.find('[data-test="format-bold"]').trigger('click');
    expect(bodyEl(wrapper).value).toBe('ada **teks**');
    expect([bodyEl(wrapper).selectionStart, bodyEl(wrapper).selectionEnd]).toEqual([6, 10]);
    wrapper.unmount();
  });

  it('removes the markers when the selection is already wrapped', async () => {
    const wrapper = mountForm();
    await select(wrapper, 'ada *teks*', 5, 9);
    await wrapper.find('[data-test="format-italic"]').trigger('click');
    expect(bodyEl(wrapper).value).toBe('ada teks');
    wrapper.unmount();
  });

  it('inserts a marker pair with the caret between when nothing is selected', async () => {
    const wrapper = mountForm();
    await select(wrapper, 'ab', 1, 1);
    await wrapper.find('[data-test="format-italic"]').trigger('click');
    expect(bodyEl(wrapper).value).toBe('a**b');
    expect(bodyEl(wrapper).selectionStart).toBe(2);
    wrapper.unmount();
  });

  it('prefixes the selected lines with a list marker', async () => {
    const wrapper = mountForm();
    await select(wrapper, 'satu\ndua', 0, 8);
    await wrapper.find('[data-test="format-list"]').trigger('click');
    expect(bodyEl(wrapper).value).toBe('- satu\n- dua');
    wrapper.unmount();
  });

  it('opens an inline address field, refuses a bad address and applies a good one', async () => {
    const wrapper = mountForm();
    await select(wrapper, 'lihat sini', 6, 10);
    await wrapper.find('[data-test="format-link"]').trigger('click');

    const input = wrapper.find('[data-test="link-input"]');
    expect(input.exists()).toBe(true);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);

    await input.setValue('javascript:alert(1)');
    await wrapper.find('[data-test="link-apply"]').trigger('click');
    expect(wrapper.find('[data-test="link-error"]').text()).toContain('http://, https:// atau mailto:');
    expect(bodyEl(wrapper).value).toBe('lihat sini');

    await input.setValue('https://example.go.id');
    await wrapper.find('[data-test="link-apply"]').trigger('click');
    expect(bodyEl(wrapper).value).toBe('lihat [sini](https://example.go.id)');
    expect(wrapper.find('[data-test="link-input"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('does not submit the paragraph when Enter is pressed in the address field', async () => {
    const wrapper = mountForm();
    await wrapper.find('[data-test="format-link"]').trigger('click');
    await wrapper.find('[data-test="link-input"]').setValue('https://example.go.id');
    await wrapper.find('[data-test="link-input"]').trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(bodyEl(wrapper).value).toContain('[teks](https://example.go.id)');
    wrapper.unmount();
  });

  it('closes the address field on Escape and keeps the text', async () => {
    const wrapper = mountForm();
    await wrapper.find('[data-test="format-link"]').trigger('click');
    await wrapper.find('[data-test="link-input"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-test="link-input"]').exists()).toBe(false);
    expect(bodyEl(wrapper).value).toBe('Isi paragraf.');
    wrapper.unmount();
  });

  it('refuses an HTML tag in the body before saving, with the backend sentence', async () => {
    const wrapper = mountForm();
    await wrapper.find('[data-test="paragraph-body"]').setValue('Halo <b>dunia</b>');
    await wrapper.find('[data-test="paragraph-save"]').trigger('click');
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.text()).toContain(
      'Isi konten tidak boleh mengandung tag HTML. Gunakan tombol format untuk huruf tebal, miring, tautan atau daftar',
    );
    wrapper.unmount();
  });

  it('allows a less-than sign that is not a tag', async () => {
    const wrapper = mountForm();
    await wrapper.find('[data-test="paragraph-body"]').setValue('Nilai < 5 dan > 3');
    await wrapper.find('[data-test="paragraph-save"]').trigger('click');
    expect(wrapper.emitted('submit')).toHaveLength(1);
    wrapper.unmount();
  });
});
