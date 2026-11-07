import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import RtLocationPicker from '../components/maps/RtLocationPicker.vue';
import { leafletState, resetLeafletMock } from './leafletMock';

vi.mock('leaflet', async () => (await import('./leafletMock')).createLeafletMock());

describe('RT location picker', () => {
  beforeEach(() => {
    resetLeafletMock();
  });

  it('places and clears the pin through the shared picker, with no coordinate fields', async () => {
    const wrapper = mount(RtLocationPicker, { props: { modelValue: null } });
    await flushPromises();
    expect(wrapper.findAll('input')).toHaveLength(0);
    expect(wrapper.text()).toContain('Belum ada pin');

    leafletState.handlers.click?.({ latlng: { lat: -1.25, lng: 116.95 } });
    expect(wrapper.emitted('update:modelValue')?.slice(-1)[0]).toEqual([
      { latitude: -1.25, longitude: 116.95 },
    ]);
    expect(wrapper.emitted('validity-change')?.slice(-1)[0]).toEqual([true]);

    await wrapper.setProps({ modelValue: { latitude: -1.25, longitude: 116.95 } });
    await wrapper.find('[data-test="rt-location-clear"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.slice(-1)[0]).toEqual([null]);
    wrapper.unmount();
  });

  it('keeps the warning that device location may differ from the RT home, and detection optional', async () => {
    const wrapper = mount(RtLocationPicker, { props: { modelValue: null } });
    await flushPromises();
    expect(wrapper.text()).toContain(
      'Lokasi perangkat belum tentu sama dengan lokasi rumah Ketua RT',
    );
    expect(wrapper.find('[data-test="rt-location-detect"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('disables every control while the form is saving', async () => {
    const wrapper = mount(RtLocationPicker, {
      props: { modelValue: { latitude: -1.25, longitude: 116.95 }, disabled: true },
    });
    await flushPromises();
    for (const button of wrapper.findAll('button')) {
      expect(button.attributes('disabled')).toBeDefined();
    }
    leafletState.handlers.click?.({ latlng: { lat: -1.3, lng: 116.9 } });
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });

  it('gives the map its own stacking boundary so Leaflet panes cannot cover page UI', async () => {
    const wrapper = mount(RtLocationPicker, { props: { modelValue: null } });
    await flushPromises();
    const classes = wrapper.find('[data-test="rt-location-picker"]').classes();
    expect(classes).toEqual(expect.arrayContaining(['relative', 'isolate', 'z-0']));
    wrapper.unmount();
  });

  it('can be mounted twice without duplicate ids', async () => {
    const Pair = defineComponent({
      render: () => [
        h(RtLocationPicker, { modelValue: null }),
        h(RtLocationPicker, { modelValue: null }),
      ],
    });
    const wrapper = mount(Pair, { attachTo: document.body });
    await flushPromises();
    const ids = Array.from(document.querySelectorAll('[id]')).map((element) => element.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    wrapper.unmount();
  });
});
