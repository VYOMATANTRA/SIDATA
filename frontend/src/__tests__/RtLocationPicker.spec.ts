import { describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import RtLocationPicker from '../components/maps/RtLocationPicker.vue';

vi.mock('leaflet', () => {
  const map = {
    setView: vi.fn<() => unknown>(),
    on: vi.fn<() => unknown>(),
    remove: vi.fn<() => unknown>(),
    invalidateSize: vi.fn<() => unknown>(),
  };
  map.setView.mockReturnValue(map);
  const marker = {
    addTo: vi.fn<() => unknown>(),
    on: vi.fn<() => unknown>(),
    setLatLng: vi.fn<() => unknown>(),
    remove: vi.fn<() => unknown>(),
  };
  marker.addTo.mockReturnValue(marker);
  return {
    default: {
      map: () => map,
      marker: () => marker,
      tileLayer: () => ({ addTo: vi.fn<() => unknown>() }),
    },
  };
});

describe('RT location picker coordinates', () => {
  it('accepts keyboard coordinates, blocks incomplete or out-of-range values, and clears', async () => {
    const wrapper = mount(RtLocationPicker, { props: { modelValue: null } });
    await flushPromises();
    const [lat, lon] = wrapper.findAll('input');
    await lat!.setValue('-1.25');
    expect(wrapper.emitted('validity-change')?.slice(-1)[0]).toEqual([false]);
    expect(lat!.attributes('aria-invalid')).toBe('true');
    await lon!.setValue('116.95');
    expect(wrapper.emitted('update:modelValue')?.slice(-1)[0]).toEqual([
      { latitude: -1.25, longitude: 116.95 },
    ]);
    expect(wrapper.emitted('validity-change')?.slice(-1)[0]).toEqual([true]);
    await lon!.setValue('181');
    expect(wrapper.emitted('validity-change')?.slice(-1)[0]).toEqual([false]);
    await wrapper.find('[data-test="rt-location-clear"]').trigger('click');
    expect((lat!.element as HTMLInputElement).value).toBe('');
    expect((lon!.element as HTMLInputElement).value).toBe('');
    expect(wrapper.emitted('update:modelValue')?.slice(-1)[0]).toEqual([null]);
    wrapper.unmount();
  });
});
