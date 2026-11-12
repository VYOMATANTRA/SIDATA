import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import MapSummaryDropdown from '../components/maps/MapSummaryDropdown.vue';
import type { MapSummaryDTO } from '../types/maps';

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

/** `matches: true` means the `md` desktop query matches (overlay mode). */
function stubViewport(isDesktop: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn<(query: string) => unknown>().mockReturnValue({
      matches: isDesktop,
      addEventListener: vi.fn<() => void>(),
      removeEventListener: vi.fn<() => void>(),
    }),
  );
}

function mountSummary(summary: MapSummaryDTO | null = sampleSummary) {
  return mount(MapSummaryDropdown, { props: { summary }, attachTo: document.body });
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('MapSummaryDropdown.vue (shared behaviour)', () => {
  it('renders the trigger with a plain Indonesian label and nothing without a summary', () => {
    stubViewport(true);
    const wrapper = mountSummary();
    expect(wrapper.find('button').text()).toBe('Rincian data');
    wrapper.unmount();

    const empty = mountSummary(null);
    expect(empty.find('button').exists()).toBe(false);
    empty.unmount();
  });

  it('keeps every summary row in both layouts', async () => {
    for (const isDesktop of [true, false]) {
      stubViewport(isDesktop);
      const wrapper = mountSummary();
      await wrapper.find('button').trigger('click');
      const text = wrapper.text();
      for (const label of [
        'Statistik Wilayah',
        'Kelurahan Manggar',
        'Total Titik Spasial',
        'Pos / Ketua RT',
        'Bank Sampah Unit',
        'Fasilitas Umum',
        'RT Berkoordinat:',
        '2 / 100 RT',
      ]) {
        expect(text).toContain(label);
      }
      wrapper.unmount();
    }
  });

  it('shows the integrity conflict row only when there are conflicts', async () => {
    stubViewport(false);
    const wrapper = mountSummary({ ...sampleSummary, rtLeadersWithIntegrityConflicts: 3 });
    await wrapper.find('button').trigger('click');
    expect(wrapper.text()).toContain('Konflik Integritas:');
    expect(wrapper.text()).toContain('3 RT');
    wrapper.unmount();
  });

  it('toggles aria-expanded and keeps aria-controls pointing at the panel while closed', async () => {
    stubViewport(false);
    const wrapper = mountSummary();
    const button = wrapper.find('button');
    const panel = wrapper.find(`#${button.attributes('aria-controls')}`);
    expect(panel.exists()).toBe(true);
    expect(panel.isVisible()).toBe(false);
    expect(button.attributes('aria-expanded')).toBe('false');

    await button.trigger('click');
    expect(button.attributes('aria-expanded')).toBe('true');
    expect(panel.isVisible()).toBe(true);

    await button.trigger('click');
    expect(button.attributes('aria-expanded')).toBe('false');
    expect(panel.isVisible()).toBe(false);
    wrapper.unmount();
  });

  it('does not steal focus when Escape is pressed outside the summary', async () => {
    stubViewport(true);
    const wrapper = mountSummary();
    await wrapper.find('button').trigger('click');
    const search = document.createElement('input');
    document.body.appendChild(search);
    search.focus();
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(search);
    expect(wrapper.find('button').attributes('aria-expanded')).toBe('true');
    wrapper.unmount();
  });
});

describe('MapSummaryDropdown.vue (mobile, in-flow disclosure)', () => {
  it('emits layout-change after opening and closing settle, since it pushes the map', async () => {
    stubViewport(false);
    const wrapper = mountSummary();
    expect(wrapper.emitted('layout-change')).toBeUndefined();
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('layout-change')).toHaveLength(1);
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('layout-change')).toHaveLength(2);
    wrapper.unmount();
  });

  it('is a full-width in-flow block, not an absolutely positioned card', async () => {
    stubViewport(false);
    const wrapper = mountSummary();
    expect(wrapper.attributes('data-layout')).toBe('inline');
    expect(wrapper.classes()).toContain('w-full');
    await wrapper.find('button').trigger('click');
    const panel = wrapper.find(`#${wrapper.find('button').attributes('aria-controls')}`);
    expect(panel.classes()).not.toContain('absolute');
    expect(panel.classes()).not.toContain('z-50');
    expect(panel.classes()).toContain('w-full');
    wrapper.unmount();
  });

  it('does not close on an outside click, because it is page content', async () => {
    stubViewport(false);
    const wrapper = mountSummary();
    const button = wrapper.find('button');
    await button.trigger('click');
    document.body.click();
    await wrapper.vm.$nextTick();
    expect(button.attributes('aria-expanded')).toBe('true');
    wrapper.unmount();
  });

  it('closes on Escape from inside the disclosure and returns focus to the trigger', async () => {
    stubViewport(false);
    const wrapper = mountSummary();
    const button = wrapper.find('button');
    await button.trigger('click');
    button.element.focus();
    await button.trigger('keydown', { key: 'Escape' });
    expect(button.attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button.element);
    wrapper.unmount();
  });
});

describe('MapSummaryDropdown.vue (desktop, overlay)', () => {
  it('does not emit layout-change when opening or closing, since the map does not move', async () => {
    stubViewport(true);
    const wrapper = mountSummary();
    await wrapper.find('button').trigger('click');
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('layout-change')).toBeUndefined();
    wrapper.unmount();
  });

  it('floats the panel above the map with its own stacking, bounded to the viewport', async () => {
    stubViewport(true);
    const wrapper = mountSummary();
    expect(wrapper.attributes('data-layout')).toBe('overlay');
    await wrapper.find('button').trigger('click');
    const panel = wrapper.find(`#${wrapper.find('button').attributes('aria-controls')}`);
    expect(panel.classes()).toEqual(
      expect.arrayContaining(['absolute', 'z-50', 'overflow-y-auto']),
    );
    expect(panel.classes().some((name) => name.startsWith('max-h-'))).toBe(true);
    wrapper.unmount();
  });

  it('keeps open when the panel itself is clicked and closes on an outside click', async () => {
    stubViewport(true);
    const wrapper = mountSummary();
    const button = wrapper.find('button');
    const panel = wrapper.find(`#${button.attributes('aria-controls')}`);
    await button.trigger('click');
    await panel.trigger('click');
    expect(button.attributes('aria-expanded')).toBe('true');
    document.body.click();
    await wrapper.vm.$nextTick();
    expect(button.attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('closes on Escape inside the overlay and restores trigger focus', async () => {
    stubViewport(true);
    const wrapper = mountSummary();
    const button = wrapper.find('button');
    await button.trigger('click');
    button.element.focus();
    await button.trigger('keydown', { key: 'Escape' });
    expect(button.attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button.element);
    wrapper.unmount();
  });
});

describe('MapSummaryDropdown.vue (breakpoint change)', () => {
  it('closes an open panel and notifies the parent when the viewport crosses the breakpoint', async () => {
    let onChange: ((event: { matches: boolean }) => void) | undefined;
    vi.stubGlobal(
      'matchMedia',
      vi.fn<(query: string) => unknown>().mockReturnValue({
        matches: true,
        addEventListener: (_type: string, cb: (event: { matches: boolean }) => void) => {
          onChange = cb;
        },
        removeEventListener: vi.fn<() => void>(),
      }),
    );
    const wrapper = mountSummary();
    const button = wrapper.find('button');
    await button.trigger('click');
    expect(button.attributes('aria-expanded')).toBe('true');

    onChange?.({ matches: false });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(wrapper.attributes('data-layout')).toBe('inline');
    expect(button.attributes('aria-expanded')).toBe('false');
    expect(wrapper.emitted('layout-change')).toBeDefined();
    wrapper.unmount();
  });
});
