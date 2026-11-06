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
    rtLeadersWithIntegrityConflicts: 0,
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

    expect(wrapper.find('ul').isVisible()).toBe(false);

    await wrapper.find('button').trigger('click');
    expect(wrapper.find('ul').exists()).toBe(true);
    expect(wrapper.text()).toContain('Pos / Ketua RT');
    expect(wrapper.text()).toContain('Bank Sampah Unit');
    expect(wrapper.text()).toContain('Fasilitas Umum');
  });

  it('keeps the disclosure panel referenced while closed and closes on an outside click', async () => {
    const wrapper = mount(MapSummaryDropdown, {
      props: { summary: sampleSummary },
      attachTo: document.body,
    });
    const button = wrapper.find('button');
    const panel = wrapper.find(`#${button.attributes('aria-controls')}`);
    expect(panel.exists()).toBe(true);
    expect(panel.isVisible()).toBe(false);
    await button.trigger('click');
    await panel.trigger('click');
    expect(button.attributes('aria-expanded')).toBe('true');
    document.body.click();
    await wrapper.vm.$nextTick();
    expect(button.attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('does not steal focus when Escape is pressed outside the disclosure', async () => {
    const wrapper = mount(MapSummaryDropdown, {
      props: { summary: sampleSummary },
      attachTo: document.body,
    });
    const button = wrapper.find('button');
    await button.trigger('click');
    const search = document.createElement('input');
    document.body.appendChild(search);
    search.focus();
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(search);
    wrapper.unmount();
    search.remove();
  });

  it('closes on Escape inside the disclosure and restores trigger focus', async () => {
    const wrapper = mount(MapSummaryDropdown, {
      props: { summary: sampleSummary },
      attachTo: document.body,
    });
    const button = wrapper.find('button');
    await button.trigger('click');
    button.element.focus();
    await button.trigger('keydown', { key: 'Escape' });
    expect(button.attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button.element);
    wrapper.unmount();
  });
});
