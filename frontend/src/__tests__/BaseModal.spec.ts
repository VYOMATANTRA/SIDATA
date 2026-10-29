import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import BaseModal from '../components/common/BaseModal.vue';

const mountOptions = {
  global: {
    stubs: { teleport: true },
  },
};

function mountOpen(
  props: Record<string, unknown> = {},
  slot = '<button type="button">Aksi</button>',
) {
  return mount(BaseModal, {
    props: { open: true, title: 'Edit Angka Indikator Skalar', ...props },
    slots: { default: slot },
    global: mountOptions.global,
    attachTo: document.body,
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('BaseModal.vue', () => {
  it('exposes dialog semantics tied to its own heading', () => {
    const wrapper = mountOpen({ description: 'Kependudukan › Jumlah Penduduk' });
    const dialog = wrapper.find('[role="dialog"]');

    expect(dialog.exists()).toBe(true);
    expect(dialog.attributes('aria-modal')).toBe('true');

    const labelledBy = dialog.attributes('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(wrapper.find(`#${labelledBy}`).text()).toBe('Edit Angka Indikator Skalar');

    const describedBy = dialog.attributes('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(wrapper.find(`#${describedBy}`).text()).toBe('Kependudukan › Jumlah Penduduk');

    wrapper.unmount();
  });

  it('closes on Escape and on an overlay click, but not on a click inside the dialog', async () => {
    const wrapper = mountOpen();

    await wrapper.find('[role="dialog"]').trigger('click');
    expect(wrapper.emitted('close')).toBeUndefined();

    await wrapper.find('[role="presentation"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(wrapper.emitted('close')).toHaveLength(2);

    wrapper.unmount();
  });

  it('refuses to close while busy', async () => {
    const wrapper = mountOpen({ busy: true });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wrapper.find('[role="presentation"]').trigger('click');

    expect(wrapper.emitted('close')).toBeUndefined();
    expect(wrapper.find('button[aria-label="Tutup dialog"]').attributes('disabled')).toBeDefined();

    wrapper.unmount();
  });

  it('wraps focus from the last control back to the first on Tab', async () => {
    const wrapper = mountOpen(
      {},
      `
        <button type="button" id="first">Satu</button>
        <button type="button" id="second">Dua</button>
        <button type="button" id="third">Tiga</button>
      `,
    );
    await nextTick();
    await nextTick();

    const third = wrapper.find('#third').element as HTMLButtonElement;
    third.focus();
    expect(document.activeElement).toBe(third);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));

    const closeButton = wrapper.find('button[aria-label="Tutup dialog"]')
      .element as HTMLButtonElement;
    expect(document.activeElement).toBe(closeButton);

    wrapper.unmount();
  });

  it('returns focus to the element that opened it', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Edit';
    document.body.appendChild(trigger);
    trigger.focus();

    const wrapper = mount(BaseModal, {
      props: { open: false, title: 'Uji' },
      slots: { default: '<input id="field" />' },
      global: mountOptions.global,
      attachTo: document.body,
    });

    await wrapper.setProps({ open: true });
    await nextTick();
    await nextTick();

    await wrapper.setProps({ open: false });
    await nextTick();

    expect(document.activeElement).toBe(trigger);

    wrapper.unmount();
  });

  it('locks and restores body scroll while open', async () => {
    const wrapper = mount(BaseModal, {
      props: { open: false, title: 'Uji' },
      slots: { default: '<input id="field" />' },
      global: mountOptions.global,
      attachTo: document.body,
    });

    await wrapper.setProps({ open: true });
    expect(document.body.style.overflow).toBe('hidden');

    await wrapper.setProps({ open: false });
    expect(document.body.style.overflow).toBe('');

    wrapper.unmount();
  });
});
