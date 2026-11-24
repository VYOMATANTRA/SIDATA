import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import CeritaSectionText from '../components/admin/cerita/CeritaSectionText.vue';

function mountText(props: Record<string, unknown> = {}) {
  return mount(CeritaSectionText, {
    props: { title: 'Ringkasan', body: 'Isi bagian.', ...props },
    attachTo: document.body,
  });
}

type Wrapper = ReturnType<typeof mountText>;

function bodyEl(wrapper: Wrapper): HTMLTextAreaElement {
  return wrapper.find('[data-test="section-body"]').element as HTMLTextAreaElement;
}

async function setBody(wrapper: Wrapper, text: string, start?: number, end?: number) {
  await wrapper.find('[data-test="section-body"]').setValue(text);
  if (start !== undefined && end !== undefined) bodyEl(wrapper).setSelectionRange(start, end);
}

describe('CeritaSectionText fields', () => {
  it('labels the title and the body and shows the stored values', () => {
    const wrapper = mountText();
    const title = wrapper.find('[data-test="section-title"]');
    expect(title.attributes('id')).toBeTruthy();
    expect(wrapper.find(`label[for="${title.attributes('id')}"]`).text()).toBe('Judul bagian');
    expect((title.element as HTMLInputElement).value).toBe('Ringkasan');
    expect(wrapper.find('label[for="' + bodyEl(wrapper).id + '"]').text()).toBe('Isi');
    expect(bodyEl(wrapper).value).toBe('Isi bagian.');
    wrapper.unmount();
  });

  it('explains paragraphs with a hint linked to the body', () => {
    const wrapper = mountText();
    const ids = bodyEl(wrapper).getAttribute('aria-describedby')!.split(' ');
    expect(wrapper.find(`#${ids[0]}`).text()).toBe(
      'Satu atau beberapa paragraf. Tekan Enter dua kali untuk paragraf baru.',
    );
    wrapper.unmount();
  });

  it('writes edits back through the models', async () => {
    const wrapper = mountText();
    await wrapper.find('[data-test="section-title"]').setValue('Judul baru');
    await setBody(wrapper, 'Isi baru.');
    expect(wrapper.emitted('update:title')?.[0]).toEqual(['Judul baru']);
    expect(wrapper.emitted('update:body')?.[0]).toEqual(['Isi baru.']);
    wrapper.unmount();
  });

  it('shows the merge note only when the section holds more than one paragraph', () => {
    const one = mountText({ paragraphCount: 1 });
    expect(one.find('[data-test="section-legacy-note"]').exists()).toBe(false);
    one.unmount();

    const many = mountText({ paragraphCount: 3 });
    expect(many.find('[data-test="section-legacy-note"]').text()).toBe(
      'Bagian ini punya beberapa paragraf lama; menyimpan akan menggabungkannya menjadi satu isi.',
    );
    many.unmount();
  });

  it('shows the problems it is given, linked to their field', () => {
    const wrapper = mountText({
      titleError: 'Judul bagian wajib diisi.',
      bodyError: 'Isi bagian maksimal 50.000 karakter.',
    });
    expect(wrapper.find('[data-test="section-title"]').attributes('aria-invalid')).toBe('true');
    expect(wrapper.find('[data-test="section-title-error"]').text()).toBe('Judul bagian wajib diisi.');
    expect(bodyEl(wrapper).getAttribute('aria-invalid')).toBe('true');
    expect(wrapper.find('[data-test="section-body-error"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('disables both fields while disabled', () => {
    const wrapper = mountText({ disabled: true });
    expect((wrapper.find('[data-test="section-title"]').element as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(bodyEl(wrapper).disabled).toBe(true);
    wrapper.unmount();
  });
});

describe('CeritaSectionText format toolbar', () => {
  it('renders a labelled toolbar with four real buttons', () => {
    const wrapper = mountText();
    const toolbar = wrapper.find('[role="toolbar"]');
    expect(toolbar.attributes('aria-label')).toBe('Format teks');
    const buttons = toolbar.findAll('button');
    expect(buttons.map((b) => b.text())).toEqual(['Tebal', 'Miring', 'Tautan', 'Daftar']);
    for (const button of buttons) expect(button.attributes('type')).toBe('button');
    wrapper.unmount();
  });

  it('wraps the selection in bold markers and keeps the text selected', async () => {
    const wrapper = mountText();
    await setBody(wrapper, 'ada teks', 4, 8);
    await wrapper.find('[data-test="format-bold"]').trigger('click');
    expect(bodyEl(wrapper).value).toBe('ada **teks**');
    expect([bodyEl(wrapper).selectionStart, bodyEl(wrapper).selectionEnd]).toEqual([6, 10]);
    wrapper.unmount();
  });

  it('removes the markers when the selection is already wrapped', async () => {
    const wrapper = mountText();
    await setBody(wrapper, 'ada *teks*', 5, 9);
    await wrapper.find('[data-test="format-italic"]').trigger('click');
    expect(bodyEl(wrapper).value).toBe('ada teks');
    wrapper.unmount();
  });

  it('prefixes the selected lines with a list marker', async () => {
    const wrapper = mountText();
    await setBody(wrapper, 'satu\ndua', 0, 8);
    await wrapper.find('[data-test="format-list"]').trigger('click');
    expect(bodyEl(wrapper).value).toBe('- satu\n- dua');
    wrapper.unmount();
  });

  it('opens an inline address field, refuses a bad address and applies a good one', async () => {
    const wrapper = mountText();
    await setBody(wrapper, 'lihat sini', 6, 10);
    await wrapper.find('[data-test="format-link"]').trigger('click');

    const input = wrapper.find('[data-test="link-input"]');
    expect(input.exists()).toBe(true);

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

  it('closes the address field on Escape and keeps the text', async () => {
    const wrapper = mountText();
    await wrapper.find('[data-test="format-link"]').trigger('click');
    await wrapper.find('[data-test="link-input"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-test="link-input"]').exists()).toBe(false);
    expect(bodyEl(wrapper).value).toBe('Isi bagian.');
    wrapper.unmount();
  });
});
