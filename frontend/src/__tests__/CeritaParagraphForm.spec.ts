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
