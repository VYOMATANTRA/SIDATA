import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import RtCoveragePicker from '../components/admin/maps/RtCoveragePicker.vue';

function mountPicker(props: Record<string, unknown> = {}) {
  return mount(RtCoveragePicker, { props: { modelValue: [], mode: 'multiple', ...props } });
}

describe('RtCoveragePicker', () => {
  it('offers every RT from 1 to 100 as a labelled native control, with no text field', () => {
    const wrapper = mountPicker();
    const inputs = wrapper.findAll('input');
    expect(inputs).toHaveLength(100);
    expect(inputs.every((input) => input.attributes('type') === 'checkbox')).toBe(true);
    expect(wrapper.find('input[type="text"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="rt-tile-1"]').text()).toContain('RT 1');
    expect(wrapper.find('[data-test="rt-tile-100"]').text()).toContain('RT 100');
    expect(wrapper.find('legend').text()).toBe('RT yang dicakup');
  });

  it('lets a multi-RT point collect several RTs in ascending order and drop one', async () => {
    const wrapper = mountPicker({ modelValue: [72] });
    await wrapper.find('[data-test="rt-tile-30"] input').setValue(true);
    expect(wrapper.emitted('update:modelValue')?.slice(-1)[0]).toEqual([[30, 72]]);

    await wrapper.setProps({ modelValue: [30, 72] });
    await wrapper.find('[data-test="rt-tile-72"] input').setValue(false);
    expect(wrapper.emitted('update:modelValue')?.slice(-1)[0]).toEqual([[30]]);
  });

  it('announces the selection in words and can clear it', async () => {
    const wrapper = mountPicker({ modelValue: [] });
    expect(wrapper.find('[data-test="rt-coverage-status"]').text()).toBe('Belum ada RT dipilih.');
    await wrapper.setProps({ modelValue: [60, 5] });
    expect(wrapper.find('[data-test="rt-coverage-status"]').text()).toBe('Dipilih: RT 5, 60.');
    await wrapper.find('[data-test="rt-coverage-clear"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.slice(-1)[0]).toEqual([[]]);
  });

  it('uses a radio group in single mode and replaces the choice', async () => {
    const wrapper = mountPicker({ mode: 'single', modelValue: [4] });
    const inputs = wrapper.findAll('input');
    expect(inputs.every((input) => input.attributes('type') === 'radio')).toBe(true);
    expect(new Set(inputs.map((input) => input.attributes('name'))).size).toBe(1);
    await wrapper.find('[data-test="rt-tile-9"] input').setValue(true);
    expect(wrapper.emitted('update:modelValue')?.slice(-1)[0]).toEqual([[9]]);
    expect(wrapper.find('[data-test="rt-coverage-clear"]').exists()).toBe(false);
  });

  it('marks an RT that already has a Ketua RT point, in words as well as with a dot', () => {
    const wrapper = mountPicker({
      mode: 'single',
      takenBy: new Map([[7, 'Pos RT 07']]),
    });
    const tile = wrapper.find('[data-test="rt-tile-7"]');
    expect(tile.text()).toContain('sudah dipakai titik Ketua RT lain');
    expect(tile.text()).toContain('•');
    expect(wrapper.find('[data-test="rt-tile-8"]').text()).not.toContain('•');
    expect(wrapper.find('[data-test="rt-coverage-legend"]').exists()).toBe(true);
    // Marked, not disabled: the form explains the conflict beside the field.
    expect(tile.find('input').attributes('disabled')).toBeUndefined();
  });

  it('shows no taken marks in multiple mode', () => {
    const wrapper = mountPicker({ takenBy: new Map([[7, 'Pos RT 07']]) });
    expect(wrapper.find('[data-test="rt-tile-7"]').text()).not.toContain('•');
    expect(wrapper.find('[data-test="rt-coverage-legend"]').exists()).toBe(false);
  });

  it('ties an error message to the group and disables every tile while busy', async () => {
    const wrapper = mountPicker({ error: 'Pilih satu RT.', disabled: true });
    expect(wrapper.text()).toContain('Pilih satu RT.');
    expect(wrapper.find('fieldset').attributes('aria-describedby')).toContain('-error');
    expect(wrapper.findAll('input').every((input) => input.attributes('disabled') !== undefined)).toBe(
      true,
    );
    await wrapper.find('[data-test="rt-tile-3"] input').trigger('change');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});
