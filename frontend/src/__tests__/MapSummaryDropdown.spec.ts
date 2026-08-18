import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MapSummaryDropdown from '../components/maps/MapSummaryDropdown.vue';
import type { MapSummaryDTO } from '../types/maps';

describe('MapSummaryDropdown.vue', () => {
  const sampleSummary: MapSummaryDTO = {
    totalPoints: 5,
    pointsByType: {
      ketua_rt: 2,
      bank_sampah: 2,
      fasilitas_umum: 1,
    },
    totalRtLeaders: 100,
    rtLeadersWithCoordinates: 2,
    rtLeadersWithoutCoordinates: 98,
  };

  it('renders trigger button with title', () => {
    const wrapper = mount(MapSummaryDropdown, {
      props: {
        summary: sampleSummary,
      },
    });

    expect(wrapper.text()).toContain('Ringkasan Data');
  });

  it('toggles list-style summary menu on click', async () => {
    const wrapper = mount(MapSummaryDropdown, {
      props: {
        summary: sampleSummary,
      },
    });

    expect(wrapper.find('ul').exists()).toBe(false);

    await wrapper.find('button').trigger('click');
    expect(wrapper.find('ul').exists()).toBe(true);
    expect(wrapper.text()).toContain('Pos / Ketua RT');
    expect(wrapper.text()).toContain('Bank Sampah Unit');
    expect(wrapper.text()).toContain('Fasilitas Umum');
  });
});
