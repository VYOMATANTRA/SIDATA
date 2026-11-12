import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import LocationPicker, {
  type LocationPickerProps,
  type PickerLocation,
} from '../components/maps/LocationPicker.vue';
import BaseModal from '../components/common/BaseModal.vue';
import { leafletMap, leafletMarker, leafletState, resetLeafletMock } from './leafletMock';

vi.mock('leaflet', async () => (await import('./leafletMock')).createLeafletMock());

const PIN: PickerLocation = { latitude: -1.2251, longitude: 116.9438 };

const mounted: VueWrapper[] = [];

async function mountPicker(props: Partial<LocationPickerProps> = {}) {
  const wrapper = mount(LocationPicker, {
    props: { modelValue: null, label: 'Lokasi uji', ...props },
    attachTo: document.body,
  });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

function lastEmitted(wrapper: VueWrapper): PickerLocation | null {
  const events = wrapper.emitted('update:modelValue') ?? [];
  return (events[events.length - 1]?.[0] as PickerLocation | null | undefined) ?? null;
}

function click(wrapper: VueWrapper, testId: string) {
  return wrapper.get(`[data-test="${testId}"]`).trigger('click');
}

function clickMap(latitude: number, longitude: number) {
  leafletState.handlers.click?.({ latlng: { lat: latitude, lng: longitude } });
}

describe('LocationPicker', () => {
  beforeEach(() => {
    resetLeafletMock();
  });

  afterEach(() => {
    while (mounted.length) mounted.pop()?.unmount();
    document.body.innerHTML = '';
  });

  describe('pin mode', () => {
    it('places the pin where the map is clicked and reports a normalised draft', async () => {
      const wrapper = await mountPicker();
      expect(wrapper.get('[data-test="location-picker-status"]').text()).toBe('Belum ada pin.');
      clickMap(-1.2301234567, 116.9501234567);
      expect(lastEmitted(wrapper)).toEqual({ latitude: -1.230123, longitude: 116.950123 });
    });

    it('wraps a longitude dragged past the date line into the valid range', async () => {
      const wrapper = await mountPicker();
      clickMap(10, 190);
      expect(lastEmitted(wrapper)).toEqual({ latitude: 10, longitude: -170 });
    });

    it('creates the map and the marker once, then moves the marker on value changes', async () => {
      const wrapper = await mountPicker({ modelValue: PIN });
      expect(leafletState.markerCreated).toBe(1);
      expect(leafletState.zoom).toBe(17);
      await wrapper.setProps({ modelValue: { latitude: -1.23, longitude: 116.95 } });
      await wrapper.setProps({ modelValue: { latitude: -1.24, longitude: 116.96 } });
      expect(leafletState.markerCreated).toBe(1);
      expect(leafletMarker.setLatLng).toHaveBeenLastCalledWith([-1.24, 116.96]);
      expect(wrapper.get('[data-test="location-picker-status"]').text()).toContain(
        'Posisi pin sudah diatur',
      );
    });

    it('refines the pin by dragging it', async () => {
      const wrapper = await mountPicker({ modelValue: PIN });
      leafletState.markerLatLng = { lat: -1.2262, lng: 116.9449 };
      leafletState.markerHandlers.dragend?.();
      expect(lastEmitted(wrapper)).toEqual({ latitude: -1.2262, longitude: 116.9449 });
      expect(leafletState.markerOptions).toMatchObject({ draggable: true, keyboard: false });
    });

    it('moves the pin with the direction buttons', async () => {
      const wrapper = await mountPicker({ modelValue: PIN });
      await click(wrapper, 'location-picker-north');
      const north = lastEmitted(wrapper)!;
      expect(north.latitude).toBeGreaterThan(PIN.latitude);
      expect(north.longitude).toBe(PIN.longitude);
      await click(wrapper, 'location-picker-south');
      await click(wrapper, 'location-picker-south');
      expect(lastEmitted(wrapper)!.latitude).toBeLessThan(PIN.latitude);
      await click(wrapper, 'location-picker-east');
      expect(lastEmitted(wrapper)!.longitude).toBeGreaterThan(PIN.longitude);
      await click(wrapper, 'location-picker-west');
      await click(wrapper, 'location-picker-west');
      expect(lastEmitted(wrapper)!.longitude).toBeLessThan(PIN.longitude);
      // The second identical announcement re-fills the live region after a short gap.
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(wrapper.get('[data-test="location-picker-announcement"]').text()).toBe(
        'Pin digeser ke barat.',
      );
    });

    it('labels the direction buttons in plain Indonesian', async () => {
      const wrapper = await mountPicker({ modelValue: PIN });
      const text = wrapper.text();
      for (const label of [
        'Geser ke utara',
        'Geser ke selatan',
        'Geser ke timur',
        'Geser ke barat',
        'Perbesar',
        'Perkecil',
      ]) {
        expect(text).toContain(label);
      }
    });

    it('disables direction buttons until there is a pin, and drops one at the centre', async () => {
      const wrapper = await mountPicker();
      expect(
        wrapper.get('[data-test="location-picker-north"]').attributes('disabled'),
      ).toBeDefined();
      leafletState.center = { lat: -1.2, lng: 116.9 };
      await click(wrapper, 'location-picker-center');
      expect(lastEmitted(wrapper)).toEqual({ latitude: -1.2, longitude: 116.9 });
    });

    it('moves the pin with arrow keys only in keyboard mode, with a larger step for Shift', async () => {
      const wrapper = await mountPicker({ modelValue: PIN });
      const region = wrapper.get('[data-test="location-picker-region"]');
      expect(region.attributes('tabindex')).toBe('-1');
      await region.trigger('keydown', { key: 'ArrowUp' });
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();

      await click(wrapper, 'location-picker-keyboard');
      expect(wrapper.get('[data-test="location-picker-keyboard"]').attributes('aria-pressed')).toBe(
        'true',
      );
      expect(region.attributes('tabindex')).toBe('0');
      expect(region.attributes('aria-label')).toContain('mode keyboard aktif');

      await region.trigger('keydown', { key: 'ArrowUp' });
      const step = lastEmitted(wrapper)!.latitude - PIN.latitude;
      expect(step).toBeGreaterThan(0);
      await region.trigger('keydown', { key: 'ArrowRight', shiftKey: true });
      const bigStep = lastEmitted(wrapper)!.longitude - PIN.longitude;
      await region.trigger('keydown', { key: 'ArrowRight' });
      const eastOnce = lastEmitted(wrapper)!.longitude - PIN.longitude - bigStep;
      expect(bigStep / eastOnce).toBeCloseTo(5, 1);
      await region.trigger('keydown', { key: 'ArrowLeft' });
      await region.trigger('keydown', { key: 'ArrowDown' });
      expect(lastEmitted(wrapper)!.latitude).toBeCloseTo(PIN.latitude, 5);
    });

    describe('keyboard mode focus', () => {
      it('moves focus to the region (not the attribution link) after a click, without scrolling', async () => {
        const wrapper = await mountPicker({ modelValue: PIN });
        const region = wrapper.get('[data-test="location-picker-region"]').element as HTMLElement;
        const attribution = document.createElement('a');
        attribution.href = 'https://www.openstreetmap.org/copyright';
        region.appendChild(attribution);
        const focusSpy = vi.spyOn(region, 'focus');
        await click(wrapper, 'location-picker-keyboard');
        await flushPromises();
        expect(document.activeElement).toBe(region);
        expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
      });

      it('does the same when the toggle is activated with Enter', async () => {
        const wrapper = await mountPicker({ modelValue: PIN });
        const region = wrapper.get('[data-test="location-picker-region"]').element as HTMLElement;
        const focusSpy = vi.spyOn(region, 'focus');
        const toggle = wrapper.get('[data-test="location-picker-keyboard"]');
        (toggle.element as HTMLElement).focus();
        await toggle.trigger('keydown', { key: 'Enter' });
        await toggle.trigger('click');
        await flushPromises();
        expect(document.activeElement).toBe(region);
        expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
      });

      it('does the same when the toggle is activated with Space', async () => {
        const wrapper = await mountPicker({ modelValue: PIN });
        const region = wrapper.get('[data-test="location-picker-region"]').element as HTMLElement;
        const toggle = wrapper.get('[data-test="location-picker-keyboard"]');
        (toggle.element as HTMLElement).focus();
        await toggle.trigger('keydown', { key: ' ' });
        await toggle.trigger('keyup', { key: ' ' });
        await toggle.trigger('click');
        await flushPromises();
        expect(document.activeElement).toBe(region);
        expect(toggle.attributes('aria-pressed')).toBe('true');
      });
    });

    it('moves the viewport by exactly whole pixels per arrow press, six presses covering 96px', async () => {
      const wrapper = await mountPicker({
        modelValue: { latitude: -1.2251, longitude: 116.9438, zoom: 13 },
        includeZoom: true,
      });
      await click(wrapper, 'location-picker-keyboard');
      const region = wrapper.get('[data-test="location-picker-region"]');
      for (let i = 0; i < 6; i += 1) await region.trigger('keydown', { key: 'ArrowRight' });
      expect(leafletMap.panBy).toHaveBeenCalledTimes(6);
      for (const call of leafletMap.panBy.mock.calls) {
        expect(call).toEqual([[16, 0], { animate: false }]);
      }
      await region.trigger('keydown', { key: 'ArrowUp', shiftKey: true });
      expect(leafletMap.panBy).toHaveBeenLastCalledWith([0, -80], { animate: false });
    });

    const PAN_EXPECTED: Array<[string, string, [number, number]]> = [
      ['north', 'ArrowUp', [0, -16]],
      ['south', 'ArrowDown', [0, 16]],
      ['east', 'ArrowRight', [16, 0]],
      ['west', 'ArrowLeft', [-16, 0]],
    ];

    it.each(PAN_EXPECTED)(
      'pans %s for the %s key, and %s with Shift by 80px',
      async (direction, key, offset) => {
        const wrapper = await mountPicker({
          modelValue: { latitude: -1.2251, longitude: 116.9438, zoom: 13 },
          includeZoom: true,
        });
        await click(wrapper, 'location-picker-keyboard');
        const region = wrapper.get('[data-test="location-picker-region"]');
        leafletMap.panBy.mockClear();
        await region.trigger('keydown', { key });
        expect(leafletMap.panBy).toHaveBeenLastCalledWith(offset, { animate: false });
        await region.trigger('keydown', { key, shiftKey: true });
        expect(leafletMap.panBy).toHaveBeenLastCalledWith(
          offset.map((n) => n * 5),
          {
            animate: false,
          },
        );
        expect(direction).toBeTruthy();
      },
    );

    it.each(PAN_EXPECTED)(
      'pans %s with the "Geser" button (%s)',
      async (direction, _key, offset) => {
        const wrapper = await mountPicker({
          modelValue: { latitude: -1.2251, longitude: 116.9438, zoom: 13 },
          includeZoom: true,
        });
        leafletMap.panBy.mockClear();
        await click(wrapper, `location-picker-${direction}`);
        expect(leafletMap.panBy).toHaveBeenCalledTimes(1);
        expect(leafletMap.panBy).toHaveBeenLastCalledWith(offset, { animate: false });
      },
    );

    it('shows the keyboard-mode state visibly: filled style and a check mark only when on', async () => {
      const wrapper = await mountPicker({ modelValue: PIN });
      const toggle = wrapper.get('[data-test="location-picker-keyboard"]');
      const check = '[data-test="location-picker-keyboard-check"]';
      expect(toggle.classes()).toEqual(expect.arrayContaining(['bg-surface', 'text-brand-navy']));
      expect(toggle.classes()).not.toContain('bg-brand-navy');
      expect(wrapper.find(check).exists()).toBe(false);
      await toggle.trigger('click');
      expect(toggle.classes()).toEqual(
        expect.arrayContaining(['bg-brand-navy', 'text-text-inverse', 'min-h-11']),
      );
      expect(toggle.classes()).not.toContain('bg-surface');
      expect(toggle.classes()).not.toContain('text-brand-navy');
      expect(wrapper.find(check).attributes('aria-hidden')).toBe('true');
      expect(toggle.text()).toBe('Mode keyboard');
      await toggle.trigger('click');
      expect(wrapper.find(check).exists()).toBe(false);
      expect(toggle.classes()).toContain('bg-surface');
    });

    it('hovers the OFF toggle to a light tint, never to the ON fill, and leaves other buttons alone', async () => {
      const wrapper = await mountPicker({ modelValue: PIN });
      const toggle = wrapper.get('[data-test="location-picker-keyboard"]');
      expect(toggle.classes()).toContain('hover:bg-surface-hover');
      expect(toggle.classes()).not.toContain('hover:bg-brand-navy');
      expect(toggle.classes()).not.toContain('hover:text-text-inverse');
      await toggle.trigger('click');
      expect(toggle.classes()).toContain('bg-brand-navy');
      expect(toggle.classes()).not.toContain('hover:bg-surface-hover');
      expect(toggle.classes()).not.toContain('hover:bg-brand-navy');
      const other = wrapper.get('[data-test="location-picker-zoom-in"]');
      expect(other.classes()).toEqual(
        expect.arrayContaining(['hover:bg-brand-navy', 'hover:text-text-inverse']),
      );
    });

    it('draws the same navy focus ring on the toggle in both states, never an inverse one', async () => {
      const wrapper = await mountPicker({ modelValue: PIN });
      const toggle = wrapper.get('[data-test="location-picker-keyboard"]');
      const ring = [
        'focus-visible:outline-2',
        'focus-visible:outline-offset-2',
        'focus-visible:outline-focus-ring',
      ];
      for (const on of [false, true]) {
        if (on) await toggle.trigger('click');
        expect(toggle.classes()).toEqual(expect.arrayContaining(ring));
        expect(toggle.classes().filter((name) => /outline.*(inverse|white)/.test(name))).toEqual(
          [],
        );
        // `transition-colors` also animates outline-color, which starts from currentColor: the
        // white text of the ON state flashes a white ring while the outline fades in.
        expect(toggle.classes()).not.toContain('transition-colors');
        expect(toggle.classes().join(' ')).toContain(
          'transition-[color,background-color,border-color]',
        );
      }
    });

    it('lets a pointer click on the toggle turn keyboard mode off and back on', async () => {
      const wrapper = await mountPicker({ modelValue: PIN });
      const toggle = wrapper.get('[data-test="location-picker-keyboard"]');
      const region = wrapper.get('[data-test="location-picker-region"]');
      expect(toggle.text()).toBe('Mode keyboard');
      await toggle.trigger('click');
      expect(toggle.attributes('aria-pressed')).toBe('true');
      // A real click: focus leaves the region towards the toggle, then the click fires.
      region.element.dispatchEvent(
        new FocusEvent('focusout', { bubbles: true, relatedTarget: toggle.element }),
      );
      await toggle.trigger('click');
      expect(toggle.attributes('aria-pressed')).toBe('false');
      expect(toggle.text()).toBe('Mode keyboard');
      await toggle.trigger('click');
      expect(toggle.attributes('aria-pressed')).toBe('true');
    });

    it('does not double-flip when the browser blurs the region without focusing the toggle', async () => {
      const wrapper = await mountPicker({ modelValue: PIN });
      const toggle = wrapper.get('[data-test="location-picker-keyboard"]');
      const region = wrapper.get('[data-test="location-picker-region"]');
      const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
      try {
        await toggle.trigger('click');
        expect(toggle.attributes('aria-pressed')).toBe('true');
        // Safari/Firefox on macOS: pointerdown, then a blur with no related target, then click.
        await toggle.trigger('pointerdown');
        region.element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        await toggle.trigger('click');
        expect(toggle.attributes('aria-pressed')).toBe('false');
        // A normal click while OFF turns it ON.
        await toggle.trigger('pointerdown');
        await toggle.trigger('click');
        expect(toggle.attributes('aria-pressed')).toBe('true');
      } finally {
        hasFocus.mockRestore();
      }
    });

    it('still ends keyboard mode on a click-away without a toggle press in progress', async () => {
      const wrapper = await mountPicker({ modelValue: PIN });
      const toggle = wrapper.get('[data-test="location-picker-keyboard"]');
      const region = wrapper.get('[data-test="location-picker-region"]');
      const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
      try {
        await toggle.trigger('click');
        region.element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        await nextTick();
        expect(toggle.attributes('aria-pressed')).toBe('false');
      } finally {
        hasFocus.mockRestore();
      }
    });

    it('forgets a toggle press that never produced a click', async () => {
      vi.useFakeTimers();
      const wrapper = await mountPicker({ modelValue: PIN });
      const toggle = wrapper.get('[data-test="location-picker-keyboard"]');
      const region = wrapper.get('[data-test="location-picker-region"]');
      const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
      try {
        await toggle.trigger('click');
        await toggle.trigger('pointerdown');
        vi.advanceTimersByTime(400);
        region.element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        await nextTick();
        expect(toggle.attributes('aria-pressed')).toBe('false');
      } finally {
        hasFocus.mockRestore();
        vi.useRealTimers();
      }
    });

    it('leaves keyboard mode when focus moves to another control', async () => {
      const wrapper = await mountPicker({ modelValue: PIN });
      const toggle = wrapper.get('[data-test="location-picker-keyboard"]');
      const region = wrapper.get('[data-test="location-picker-region"]');
      await toggle.trigger('click');
      const elsewhere = document.createElement('button');
      document.body.append(elsewhere);
      region.element.dispatchEvent(
        new FocusEvent('focusout', { bubbles: true, relatedTarget: elsewhere }),
      );
      await nextTick();
      expect(toggle.attributes('aria-pressed')).toBe('false');
      elsewhere.remove();
    });

    it('keeps keyboard mode on when clicking zoom or direction buttons, and arrow keys still work', async () => {
      const wrapper = await mountPicker({ modelValue: PIN });
      const toggle = wrapper.get('[data-test="location-picker-keyboard"]');
      const zoomIn = wrapper.get('[data-test="location-picker-zoom-in"]');
      const region = wrapper.get('[data-test="location-picker-region"]');
      await toggle.trigger('click');
      expect(toggle.attributes('aria-pressed')).toBe('true');

      region.element.dispatchEvent(
        new FocusEvent('focusout', { bubbles: true, relatedTarget: zoomIn.element }),
      );
      await nextTick();
      expect(toggle.attributes('aria-pressed')).toBe('true');

      await zoomIn.trigger('keydown', { key: 'ArrowUp' });
      expect(wrapper.emitted('update:modelValue')).toBeDefined();
    });

    it('announces when keyboard mode ends because focus left the picker', async () => {
      const wrapper = await mountPicker({ modelValue: PIN });
      const toggle = wrapper.get('[data-test="location-picker-keyboard"]');
      const region = wrapper.get('[data-test="location-picker-region"]');
      await toggle.trigger('click');
      expect(toggle.attributes('aria-pressed')).toBe('true');

      const elsewhere = document.createElement('button');
      document.body.append(elsewhere);
      region.element.dispatchEvent(
        new FocusEvent('focusout', { bubbles: true, relatedTarget: elsewhere }),
      );
      await nextTick();
      expect(toggle.attributes('aria-pressed')).toBe('false');
      const live = wrapper.get('[data-test="location-picker-announcement"]');
      expect(live.text()).toContain('Mode keyboard nonaktif.');
      elsewhere.remove();
    });

    it('leaves keyboard mode when a click lands on non-focusable content', async () => {
      const wrapper = await mountPicker({ modelValue: PIN });
      const toggle = wrapper.get('[data-test="location-picker-keyboard"]');
      const region = wrapper.get('[data-test="location-picker-region"]');
      await toggle.trigger('click');
      // No related target, but the document keeps focus: the user clicked elsewhere in the page.
      const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
      try {
        region.element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        await nextTick();
        expect(toggle.attributes('aria-pressed')).toBe('false');
        expect(region.attributes('tabindex')).toBe('-1');
      } finally {
        hasFocus.mockRestore();
      }
    });

    it('keeps keyboard mode when the whole window loses focus', async () => {
      const wrapper = await mountPicker({ modelValue: PIN });
      const toggle = wrapper.get('[data-test="location-picker-keyboard"]');
      const region = wrapper.get('[data-test="location-picker-region"]');
      await toggle.trigger('click');
      const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
      try {
        region.element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        await nextTick();
        expect(toggle.attributes('aria-pressed')).toBe('true');
        expect(region.attributes('tabindex')).toBe('0');
      } finally {
        hasFocus.mockRestore();
      }
    });

    it('lets Escape leave keyboard mode without bubbling to a surrounding dialog', async () => {
      const wrapper = await mountPicker({ modelValue: PIN });
      const outer = vi.fn<() => void>();
      document.addEventListener('keydown', outer, true);
      await click(wrapper, 'location-picker-keyboard');
      await wrapper
        .get('[data-test="location-picker-region"]')
        .trigger('keydown', { key: 'Escape' });
      document.removeEventListener('keydown', outer, true);
      expect(outer).not.toHaveBeenCalled();
      expect(wrapper.get('[data-test="location-picker-keyboard"]').attributes('aria-pressed')).toBe(
        'false',
      );
    });

    it('leaves Escape alone outside keyboard mode so a surrounding dialog can still close', async () => {
      const wrapper = await mountPicker({ modelValue: PIN });
      const outer = vi.fn<() => void>();
      document.addEventListener('keydown', outer, true);
      await wrapper
        .get('[data-test="location-picker-region"]')
        .trigger('keydown', { key: 'Escape' });
      document.removeEventListener('keydown', outer, true);
      expect(outer).toHaveBeenCalledTimes(1);
    });

    it('zooms the view with the buttons and with + and - in keyboard mode, without emitting', async () => {
      const wrapper = await mountPicker({ modelValue: PIN });
      await click(wrapper, 'location-picker-zoom-in');
      expect(leafletMap.setZoom).toHaveBeenLastCalledWith(18, { animate: false });
      await click(wrapper, 'location-picker-zoom-out');
      await click(wrapper, 'location-picker-zoom-out');
      expect(leafletMap.setZoom).toHaveBeenLastCalledWith(16, { animate: false });
      await click(wrapper, 'location-picker-keyboard');
      await wrapper.get('[data-test="location-picker-region"]').trigger('keydown', { key: '+' });
      expect(leafletMap.setZoom).toHaveBeenLastCalledWith(17, { animate: false });
      await wrapper.get('[data-test="location-picker-region"]').trigger('keydown', { key: '-' });
      expect(leafletMap.setZoom).toHaveBeenLastCalledWith(16, { animate: false });
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    });

    it('stops at the zoom bounds and keeps focus on the other zoom button', async () => {
      const wrapper = await mountPicker({ modelValue: PIN, focusZoom: 19, maxZoom: 20 });
      const zoomIn = wrapper.get('[data-test="location-picker-zoom-in"]');
      (zoomIn.element as HTMLElement).focus();
      await zoomIn.trigger('click');
      await flushPromises();
      expect(zoomIn.attributes('disabled')).toBeDefined();
      expect(document.activeElement).toBe(
        wrapper.get('[data-test="location-picker-zoom-out"]').element,
      );
    });

    it('announces the limit, not a zoom, when + or - is pressed at a zoom bound', async () => {
      vi.useFakeTimers();
      const wrapper = await mountPicker({ modelValue: PIN, minZoom: 17, maxZoom: 18 });
      const live = wrapper.get('[data-test="location-picker-announcement"]');
      const region = wrapper.get('[data-test="location-picker-region"]');
      await wrapper.get('[data-test="location-picker-keyboard"]').trigger('click');
      await region.trigger('keydown', { key: '+' });
      vi.advanceTimersByTime(1000);
      await nextTick();
      expect(live.text()).toBe('Peta diperbesar.');
      leafletMap.setZoom.mockClear();
      await region.trigger('keydown', { key: '+' });
      await region.trigger('keydown', { key: '+' });
      vi.advanceTimersByTime(1000);
      await nextTick();
      expect(live.text()).toBe('Pembesaran peta sudah maksimum.');
      expect(leafletMap.setZoom).not.toHaveBeenCalled();
      await region.trigger('keydown', { key: '-' });
      vi.advanceTimersByTime(1000);
      await nextTick();
      expect(live.text()).toBe('Peta diperkecil.');
      await region.trigger('keydown', { key: '-' });
      vi.advanceTimersByTime(1000);
      await nextTick();
      expect(live.text()).toBe('Pembesaran peta sudah minimum.');
      expect(leafletMap.setZoom).toHaveBeenCalledTimes(1);
    });

    describe('zoom limit announcements', () => {
      async function atMax() {
        vi.useFakeTimers();
        const wrapper = await mountPicker({ modelValue: PIN, minZoom: 17, maxZoom: 18 });
        const live = wrapper.get('[data-test="location-picker-announcement"]');
        const region = wrapper.get('[data-test="location-picker-region"]');
        await wrapper.get('[data-test="location-picker-keyboard"]').trigger('click');
        await region.trigger('keydown', { key: '+' });
        vi.advanceTimersByTime(1000);
        await nextTick();
        expect(live.text()).toBe('Peta diperbesar.');
        const press = async (key: '+' | '-', count = 1, gap = 0) => {
          for (let i = 0; i < count; i += 1) {
            await region.trigger('keydown', { key });
            if (gap) vi.advanceTimersByTime(gap);
          }
        };
        const settle = async (ms: number) => {
          vi.advanceTimersByTime(ms);
          await nextTick();
        };
        return { wrapper, live, press, settle };
      }
      const MAX = 'Pembesaran peta sudah maksimum.';

      it('announces again for a later burst at the same limit, after the message cleared', async () => {
        const { live, press, settle } = await atMax();
        await press('+', 3);
        await settle(1000);
        expect(live.text()).toBe(MAX);
        await settle(5000);
        expect(live.text()).toBe('');
        await press('+');
        await settle(1000);
        expect(live.text()).toBe(MAX);
      });

      it('announces every separate burst once, then stays quiet until the next burst', async () => {
        const { live, press, settle } = await atMax();
        for (let burst = 0; burst < 3; burst += 1) {
          await press('+', 4);
          await settle(1000);
          expect(live.text()).toBe(MAX);
          await settle(5000);
          expect(live.text()).toBe('');
        }
      });

      it('announces 600 ms after the last press of the burst, not after the first', async () => {
        const { live, press, settle } = await atMax();
        await settle(5000);
        await press('+', 4, 400);
        // 1600 ms since the first press, 400 since the last: still waiting.
        expect(live.text()).toBe('');
        await settle(199);
        expect(live.text()).toBe('');
        await settle(1);
        expect(live.text()).toBe(MAX);
      });

      it('announces the limit again after a real zoom out and back in to it', async () => {
        const { live, press, settle } = await atMax();
        await press('+');
        await settle(1000);
        expect(live.text()).toBe(MAX);
        await press('-');
        await settle(1000);
        expect(live.text()).toBe('Peta diperkecil.');
        await press('+');
        await settle(1000);
        expect(live.text()).toBe('Peta diperbesar.');
        await press('+', 2);
        await settle(1000);
        expect(live.text()).toBe(MAX);
      });

      it('is not lost when another announcement replaces the pending one', async () => {
        const { live, press, settle } = await atMax();
        await press('+');
        clickMap(-1.2251, 116.9438);
        await settle(1000);
        expect(live.text()).toBe('Pin diletakkan.');
        await settle(5000);
        await press('+');
        await settle(1000);
        expect(live.text()).toBe(MAX);
      });

      it('is not lost when an outside value change wipes the pending announcement', async () => {
        const { wrapper, live, press, settle } = await atMax();
        await press('+');
        await wrapper.setProps({ modelValue: { latitude: -1.3, longitude: 116.9 } });
        await settle(1000);
        expect(live.text()).toBe('');
        await press('+');
        await settle(1000);
        expect(live.text()).toBe(MAX);
      });

      it('says the minimum was reached for every burst too', async () => {
        const { live, press, settle } = await atMax();
        await press('-');
        await settle(1000);
        for (let burst = 0; burst < 2; burst += 1) {
          await press('-', 3);
          await settle(1000);
          expect(live.text()).toBe('Pembesaran peta sudah minimum.');
          await settle(5000);
        }
      });
    });

    it('keeps focus in the region when + or - keys reach the zoom limits in keyboard mode', async () => {
      const wrapper = await mountPicker({ modelValue: PIN, minZoom: 15, maxZoom: 19 });
      const toggle = wrapper.get('[data-test="location-picker-keyboard"]');
      const region = wrapper.get('[data-test="location-picker-region"]');
      await toggle.trigger('click');
      await flushPromises();
      (region.element as HTMLElement).focus();
      expect(document.activeElement).toBe(region.element);
      for (let i = 0; i < 4; i += 1) await region.trigger('keydown', { key: '+' });
      await flushPromises();
      expect(
        wrapper.get('[data-test="location-picker-zoom-in"]').attributes('disabled'),
      ).toBeDefined();
      expect(document.activeElement).toBe(region.element);
      expect(toggle.attributes('aria-pressed')).toBe('true');
      for (let i = 0; i < 6; i += 1) await region.trigger('keydown', { key: '-' });
      await flushPromises();
      expect(
        wrapper.get('[data-test="location-picker-zoom-out"]').attributes('disabled'),
      ).toBeDefined();
      expect(document.activeElement).toBe(region.element);
      expect(toggle.attributes('aria-pressed')).toBe('true');
    });

    it('hands focus to the zoom-in button after the zoom-out button disables itself', async () => {
      const wrapper = await mountPicker({ modelValue: PIN, minZoom: 16 });
      const zoomOut = wrapper.get('[data-test="location-picker-zoom-out"]');
      (zoomOut.element as HTMLElement).focus();
      await zoomOut.trigger('click');
      await flushPromises();
      expect(zoomOut.attributes('disabled')).toBeDefined();
      expect(document.activeElement).toBe(
        wrapper.get('[data-test="location-picker-zoom-in"]').element,
      );
    });

    it('clears the pin only when clearable', async () => {
      const plain = await mountPicker({ modelValue: PIN });
      expect(plain.find('[data-test="location-picker-clear"]').exists()).toBe(false);
      const wrapper = await mountPicker({ modelValue: PIN, clearable: true, testId: 'clearable' });
      await click(wrapper, 'clearable-clear');
      expect(wrapper.emitted('update:modelValue')?.slice(-1)[0]).toEqual([null]);
      await wrapper.setProps({ modelValue: null });
      expect(wrapper.get('[data-test="clearable-clear"]').attributes('disabled')).toBeDefined();
      expect(leafletMarker.remove).toHaveBeenCalled();
    });
  });

  describe('status and announcements', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('derives the persistent state line from the value, outside the live region', async () => {
      const wrapper = await mountPicker();
      const status = wrapper.get('[data-test="location-picker-status"]');
      expect(status.text()).toBe('Belum ada pin.');
      expect(status.attributes('aria-live')).toBeUndefined();
      clickMap(-1.2, 116.9);
      await wrapper.setProps({ modelValue: lastEmitted(wrapper) });
      expect(status.text()).toBe('Posisi pin sudah diatur.');
      await wrapper.setProps({ modelValue: null });
      expect(status.text()).toBe('Belum ada pin.');
    });

    it('announces transient messages politely, clears them after a while and on outside changes', async () => {
      vi.useFakeTimers();
      const wrapper = await mountPicker();
      const live = wrapper.get('[data-test="location-picker-announcement"]');
      expect(live.attributes('aria-live')).toBe('polite');
      expect(live.classes()).toContain('sr-only');
      clickMap(-1.2, 116.9);
      await nextTick();
      expect(live.text()).toBe('Pin diletakkan.');
      vi.advanceTimersByTime(4100);
      await nextTick();
      expect(live.text()).toBe('');

      clickMap(-1.21, 116.91);
      await wrapper.setProps({ modelValue: lastEmitted(wrapper) });
      expect(live.text()).toBe('Pin diletakkan.');
      await wrapper.setProps({ modelValue: null });
      expect(live.text()).toBe('');
    });

    it('coalesces held arrow keys into one announcement after the last nudge', async () => {
      vi.useFakeTimers();
      const wrapper = await mountPicker({ modelValue: PIN });
      await click(wrapper, 'location-picker-keyboard');
      const live = wrapper.get('[data-test="location-picker-announcement"]');
      const region = wrapper.get('[data-test="location-picker-region"]');
      const texts: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        await region.trigger('keydown', { key: 'ArrowUp' });
        vi.advanceTimersByTime(100);
        await nextTick();
        texts.push(live.text());
      }
      expect(texts.every((text) => !text.includes('Pin digeser'))).toBe(true);
      await region.trigger('keydown', { key: 'ArrowLeft' });
      vi.advanceTimersByTime(600);
      await nextTick();
      expect(live.text()).toBe('Pin digeser ke barat.');
      expect(live.text()).not.toContain('\u200b');
    });

    it('coalesces rapid zoom steps into one announcement of the final direction', async () => {
      vi.useFakeTimers();
      const wrapper = await mountPicker({ modelValue: PIN });
      const live = wrapper.get('[data-test="location-picker-announcement"]');
      for (let i = 0; i < 5; i += 1) {
        await click(wrapper, 'location-picker-zoom-in');
        vi.advanceTimersByTime(100);
        await nextTick();
        expect(live.text()).toBe('');
      }
      await click(wrapper, 'location-picker-zoom-out');
      vi.advanceTimersByTime(600);
      await nextTick();
      expect(live.text()).toBe('Peta diperkecil.');
    });

    it('re-announces an identical message by clearing the live region first', async () => {
      vi.useFakeTimers();
      const wrapper = await mountPicker();
      const live = wrapper.get('[data-test="location-picker-announcement"]');
      const seen: string[] = [];
      const observer = new MutationObserver(() =>
        seen.push(live.element.textContent?.trim() ?? ''),
      );
      observer.observe(live.element, { childList: true, characterData: true, subtree: true });
      try {
        clickMap(-1.2, 116.9);
        await nextTick();
        expect(live.text()).toBe('Pin diletakkan.');
        seen.length = 0;
        clickMap(-1.21, 116.91);
        await nextTick();
        // Emptied first, and still empty until the gap has passed.
        expect(live.text()).toBe('');
        vi.advanceTimersByTime(100);
        await nextTick();
        expect(live.text()).toBe('Pin diletakkan.');
        // Observed DOM mutations: emptied, then the same text again.
        await Promise.resolve();
        expect(seen).toEqual(['', 'Pin diletakkan.']);
      } finally {
        observer.disconnect();
      }
    });

    describe('same-tick races', () => {
      it('shows the newest message when another announcement follows a pending re-announce', async () => {
        vi.useFakeTimers();
        const wrapper = await mountPicker({ modelValue: PIN });
        const live = wrapper.get('[data-test="location-picker-announcement"]');
        void click(wrapper, 'location-picker-north');
        void click(wrapper, 'location-picker-north');
        void click(wrapper, 'location-picker-zoom-in');
        vi.advanceTimersByTime(200);
        await nextTick();
        expect(live.text()).toBe('Pin digeser ke utara.');
        // The zoom announcement is coalesced and arrives after the quiet period.
        vi.advanceTimersByTime(600);
        await nextTick();
        expect(live.text()).toBe('Peta diperbesar.');
      });

      it('shows the newest message in the opposite order too', async () => {
        vi.useFakeTimers();
        const wrapper = await mountPicker({ modelValue: PIN });
        const live = wrapper.get('[data-test="location-picker-announcement"]');
        void click(wrapper, 'location-picker-zoom-out');
        void click(wrapper, 'location-picker-zoom-out');
        void click(wrapper, 'location-picker-north');
        vi.advanceTimersByTime(200);
        await nextTick();
        expect(live.text()).toBe('Pin digeser ke utara.');
      });

      it('does not resurrect a message after a same-tick clear', async () => {
        vi.useFakeTimers();
        const wrapper = await mountPicker({ modelValue: PIN });
        const live = wrapper.get('[data-test="location-picker-announcement"]');
        void click(wrapper, 'location-picker-north');
        void click(wrapper, 'location-picker-north');
        // An outside change clears the live region.
        await wrapper.setProps({ modelValue: null });
        vi.advanceTimersByTime(200);
        await nextTick();
        expect(live.text()).toBe('');
      });
    });

    it('derives every data-test hook from the testId prop', async () => {
      const wrapper = await mountPicker({
        modelValue: PIN,
        testId: 'custom',
        includeZoom: true,
      });
      for (const suffix of ['status', 'announcement', 'crosshair', 'region', 'keyboard']) {
        expect(wrapper.find(`[data-test="custom-${suffix}"]`).exists()).toBe(true);
        expect(wrapper.find(`[data-test="location-picker-${suffix}"]`).exists()).toBe(false);
      }
    });
  });

  describe('disabled and read-only', () => {
    it('ignores clicks, drags and keys and disables every control when disabled', async () => {
      const wrapper = await mountPicker({
        modelValue: PIN,
        disabled: true,
        clearable: true,
        detectable: true,
      });
      clickMap(-1.3, 116.9);
      leafletState.markerHandlers.dragend?.();
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();
      expect(leafletState.markerOptions).toMatchObject({ draggable: false });
      for (const button of wrapper.findAll('button')) {
        expect(button.attributes('disabled')).toBeDefined();
      }
      expect(leafletMap.dragging.disable).toHaveBeenCalled();
    });

    it('keeps the value but blocks edits when read-only, while zoom still works in pin mode', async () => {
      const wrapper = await mountPicker({ modelValue: PIN, readonly: true, clearable: true });
      clickMap(-1.3, 116.9);
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();
      expect(
        wrapper.get('[data-test="location-picker-north"]').attributes('disabled'),
      ).toBeDefined();
      expect(
        wrapper.get('[data-test="location-picker-clear"]').attributes('disabled'),
      ).toBeDefined();
      expect(
        wrapper.get('[data-test="location-picker-keyboard"]').attributes('disabled'),
      ).toBeDefined();
      expect(
        wrapper.get('[data-test="location-picker-zoom-in"]').attributes('disabled'),
      ).toBeUndefined();
      expect(wrapper.get('[data-test="location-picker-status"]').text()).toContain(
        'hanya dapat dilihat',
      );
    });

    it('locks the whole view when a read-only picker edits the viewport', async () => {
      const wrapper = await mountPicker({
        modelValue: { latitude: -1.2, longitude: 116.9, zoom: 13 },
        includeZoom: true,
        readonly: true,
      });
      expect(
        wrapper.get('[data-test="location-picker-zoom-in"]').attributes('disabled'),
      ).toBeDefined();
      expect(leafletMap.dragging.disable).toHaveBeenCalled();
      leafletState.handlers.moveend?.();
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    });
  });

  describe('viewport mode', () => {
    const VIEW: PickerLocation = { latitude: -1.2251, longitude: 116.9438, zoom: 13 };

    it('opens on the value, draws a fixed crosshair and has no marker', async () => {
      const wrapper = await mountPicker({ modelValue: VIEW, includeZoom: true });
      expect(leafletState.center).toEqual({ lat: -1.2251, lng: 116.9438 });
      expect(leafletState.zoom).toBe(13);
      expect(leafletState.markerCreated).toBe(0);
      expect(wrapper.find('[data-test="location-picker-crosshair"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="location-picker-center"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="location-picker-clear"]').exists()).toBe(false);
    });

    it('turns panning and zooming into a centre-and-zoom draft', async () => {
      const wrapper = await mountPicker({ modelValue: VIEW, includeZoom: true });
      leafletState.center = { lat: -1.3, lng: 117.01 };
      leafletState.zoom = 15;
      leafletState.handlers.moveend?.();
      expect(lastEmitted(wrapper)).toEqual({ latitude: -1.3, longitude: 117.01, zoom: 15 });
    });

    // Leaflet may end a programmatic move away from the requested view (clamping, max-bounds),
    // so the `moveend` it fires carries a centre that is not near `modelValue`. Only the
    // `syncing` guard can keep that from being echoed back as an edit.
    it('does not echo programmatic view changes back as edits', async () => {
      const wrapper = await mountPicker({ modelValue: VIEW, includeZoom: true });
      await wrapper.setProps({ modelValue: { latitude: -1.3, longitude: 117, zoom: 25 } });
      expect(leafletMap.setView).toHaveBeenLastCalledWith([-1.3, 117], 20, { animate: false });
      expect(leafletState.zoom).toBe(20);
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    });

    it('does not echo a drifted programmatic move or resize refresh (syncing guard)', async () => {
      let notify: () => void = () => undefined;
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(callback: () => void) {
            notify = callback;
          }
          observe() {}
          disconnect() {}
        },
      );
      try {
        const wrapper = await mountPicker({ modelValue: VIEW, includeZoom: true });
        leafletState.centerDrift = { lat: 0.01, lng: 0.01 };
        await wrapper.setProps({ modelValue: { latitude: -1.3, longitude: 117, zoom: 14 } });
        expect(leafletState.center.lat).toBeCloseTo(-1.29, 5);
        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
        const container = wrapper.get('[data-test="location-picker-map"]').element;
        Object.defineProperty(container, 'clientWidth', { configurable: true, value: 320 });
        Object.defineProperty(container, 'clientHeight', { configurable: true, value: 288 });
        notify();
        expect(leafletMap.invalidateSize).toHaveBeenCalled();
        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('starts from the stored view and does not echo a resize refresh', async () => {
      let notify: () => void = () => undefined;
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(callback: () => void) {
            notify = callback;
          }
          observe() {}
          disconnect() {}
        },
      );
      try {
        const wrapper = await mountPicker({
          modelValue: { latitude: -1.2251, longitude: 116.9438, zoom: 25 },
          includeZoom: true,
        });
        expect(leafletState.center).toEqual({ lat: -1.2251, lng: 116.9438 });
        expect(leafletState.zoom).toBe(20);
        const container = wrapper.get('[data-test="location-picker-map"]').element;
        Object.defineProperty(container, 'clientWidth', { configurable: true, value: 320 });
        Object.defineProperty(container, 'clientHeight', { configurable: true, value: 288 });
        notify();
        expect(leafletMap.invalidateSize).toHaveBeenCalled();
        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('ignores moveend caused by resize when there is no saved value and no user interaction', async () => {
      const wrapper = await mountPicker({ modelValue: null, includeZoom: true });
      leafletState.handlers.moveend?.();
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();

      leafletState.handlers.dragstart?.();
      leafletState.center = { lat: -1.3, lng: 117.0 };
      leafletState.handlers.moveend?.();
      expect(wrapper.emitted('update:modelValue')).toBeDefined();
    });

    it('moves the view with the direction buttons and zoom buttons', async () => {
      const wrapper = await mountPicker({ modelValue: VIEW, includeZoom: true });
      await click(wrapper, 'location-picker-north');
      expect(lastEmitted(wrapper)!.latitude).toBeGreaterThan(VIEW.latitude);
      expect(lastEmitted(wrapper)!.zoom).toBe(13);
      await click(wrapper, 'location-picker-zoom-in');
      expect(lastEmitted(wrapper)!.zoom).toBe(14);
      await click(wrapper, 'location-picker-zoom-out');
      await click(wrapper, 'location-picker-zoom-out');
      expect(lastEmitted(wrapper)!.zoom).toBe(12);
    });

    it('recentres on a clicked point and keeps the zoom within bounds', async () => {
      const wrapper = await mountPicker({
        modelValue: { latitude: 0, longitude: 0, zoom: 2 },
        includeZoom: true,
        minZoom: 2,
      });
      clickMap(5, 6);
      expect(lastEmitted(wrapper)).toEqual({ latitude: 5, longitude: 6, zoom: 2 });
      expect(
        wrapper.get('[data-test="location-picker-zoom-out"]').attributes('disabled'),
      ).toBeDefined();
    });
  });

  describe('viewport mode details', () => {
    const VIEW: PickerLocation = { latitude: -1.2251, longitude: 116.9438, zoom: 13 };

    it('turns double-click zoom off so a double-click cannot re-centre twice and zoom', async () => {
      await mountPicker({ modelValue: VIEW, includeZoom: true });
      expect(leafletState.mapOptions).toMatchObject({ doubleClickZoom: false });
      await mountPicker({ modelValue: PIN, testId: 'pin' });
      expect(leafletState.mapOptions).toMatchObject({ doubleClickZoom: true });
    });

    it('never re-enables double-click zoom in viewport mode when editing is unlocked again', async () => {
      const wrapper = await mountPicker({ modelValue: VIEW, includeZoom: true, readonly: true });
      leafletMap.doubleClickZoom.enable.mockClear();
      await wrapper.setProps({ readonly: false });
      expect(leafletMap.dragging.enable).toHaveBeenCalled();
      expect(leafletMap.doubleClickZoom.enable).not.toHaveBeenCalled();
    });

    it('ignores a moveend outside a programmatic move that is still the stored view', async () => {
      const wrapper = await mountPicker({ modelValue: VIEW, includeZoom: true });
      // e.g. Leaflet's own debounced window-resize handler re-reporting the same view
      leafletState.handlers.moveend?.();
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();
      leafletState.center = { lat: -1.2251004, lng: 116.9438004 };
      leafletState.handlers.moveend?.();
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    });

    // `emitValue` de-duplicates equal drafts, so a stored zoom the map had to clamp (25 -> 20) is
    // what shows the stored-view guard working: without it, the clamped zoom would be emitted.
    it('treats a clamped stored zoom as the stored view when a stray moveend arrives', async () => {
      const wrapper = await mountPicker({
        modelValue: { latitude: -1.2251, longitude: 116.9438, zoom: 25 },
        includeZoom: true,
      });
      expect(leafletState.zoom).toBe(20);
      leafletState.center = { lat: -1.2251004, lng: 116.9438004 };
      leafletState.handlers.moveend?.();
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    });

    it('never swallows a genuine pan or zoom away from the stored view', async () => {
      const wrapper = await mountPicker({ modelValue: VIEW, includeZoom: true });
      leafletState.center = { lat: -1.2251 + 0.0001, lng: 116.9438 };
      leafletState.handlers.moveend?.();
      expect(lastEmitted(wrapper)).toEqual({ latitude: -1.225, longitude: 116.9438, zoom: 13 });
      const count = wrapper.emitted('update:modelValue')?.length ?? 0;
      leafletState.center = { lat: -1.2251, lng: 116.9438 };
      leafletState.zoom = 14;
      leafletState.handlers.moveend?.();
      expect(wrapper.emitted('update:modelValue')?.length).toBe(count + 1);
      expect(lastEmitted(wrapper)).toMatchObject({ zoom: 14 });
    });

    it('ignores a stray moveend drifting within tolerance but emits once the drift passes it', async () => {
      const wrapper = await mountPicker({ modelValue: VIEW, includeZoom: true });
      // Inside the guard tolerance (COORDINATE_EPSILON = 1e-6).
      leafletState.center = { lat: -1.2251 + 0.4e-6, lng: 116.9438 };
      leafletState.handlers.moveend?.();
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();
      leafletState.center = { lat: -1.2251 + 3e-6, lng: 116.9438 };
      leafletState.handlers.moveend?.();
      expect(wrapper.emitted('update:modelValue')?.length).toBe(1);
    });
  });

  describe('motion and animation', () => {
    it('turns off inertia and animated pans', async () => {
      leafletState.inBounds = false;
      const wrapper = await mountPicker({ modelValue: PIN });
      expect(leafletState.mapOptions).toMatchObject({ inertia: false });
      expect(leafletState.mapOptions).not.toHaveProperty('zoomAnimation');
      expect(leafletState.mapOptions).not.toHaveProperty('fadeAnimation');
      await wrapper.setProps({ modelValue: { latitude: -1.5, longitude: 117 } });
      expect(leafletMap.panTo).toHaveBeenLastCalledWith([-1.5, 117], { animate: false });
    });

    it('never lets a drag coast: inertia is off', async () => {
      await mountPicker({ modelValue: PIN });
      expect(leafletState.mapOptions).toMatchObject({ inertia: false });
    });
  });

  describe('device location', () => {
    type Success = (position: {
      coords: { latitude: number; longitude: number; accuracy: number };
    }) => void;
    type Failure = (error: { code: number; PERMISSION_DENIED: number }) => void;
    let success: Success;
    let failure: Failure;

    beforeEach(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: vi.fn<(ok: Success, fail: Failure) => void>((ok, fail) => {
            success = ok;
            failure = fail;
          }),
        },
      });
    });

    afterEach(() => {
      Reflect.deleteProperty(navigator, 'geolocation');
    });

    it('is hidden unless requested', async () => {
      const wrapper = await mountPicker();
      expect(wrapper.find('[data-test="location-picker-detect"]').exists()).toBe(false);
    });

    it('turns a detected position into a draft only, and describes the accuracy in words', async () => {
      const wrapper = await mountPicker({ detectable: true });
      await click(wrapper, 'location-picker-detect');
      success({ coords: { latitude: -1.25, longitude: 116.95, accuracy: 12.4 } });
      await flushPromises();
      expect(lastEmitted(wrapper)).toEqual({ latitude: -1.25, longitude: 116.95 });
      expect(leafletState.zoom).toBe(17);
      expect(wrapper.get('[data-test="location-picker-accuracy"]').text()).toContain('cukup dekat');
      expect(wrapper.text()).not.toMatch(/±|\d+ m\b/);
    });

    it('honours a custom testId for the accuracy hook', async () => {
      const wrapper = await mountPicker({ detectable: true, testId: 'custom' });
      await click(wrapper, 'custom-detect');
      success({ coords: { latitude: -1.25, longitude: 116.95, accuracy: 12.4 } });
      await flushPromises();
      expect(wrapper.get('[data-test="custom-accuracy"]').text()).toContain('cukup dekat');
      expect(wrapper.find('[data-test="location-picker-accuracy"]').exists()).toBe(false);
    });

    it('calls a coarse fix less precise, and forgets it when the parent changes the value', async () => {
      const wrapper = await mountPicker({ detectable: true });
      await click(wrapper, 'location-picker-detect');
      success({ coords: { latitude: -1.25, longitude: 116.95, accuracy: 900 } });
      await flushPromises();
      await wrapper.setProps({ modelValue: lastEmitted(wrapper) });
      expect(wrapper.get('[data-test="location-picker-accuracy"]').text()).toContain(
        'kurang tepat',
      );
      await wrapper.setProps({ modelValue: { latitude: -1.3, longitude: 116.9 } });
      expect(wrapper.find('[data-test="location-picker-accuracy"]').exists()).toBe(false);
    });

    it('keeps the detect button enabled and focused while searching', async () => {
      const wrapper = await mountPicker({ detectable: true });
      const detect = wrapper.get('[data-test="location-picker-detect"]');
      (detect.element as HTMLElement).focus();
      await detect.trigger('click');
      expect(detect.attributes('disabled')).toBeUndefined();
      expect(detect.attributes('aria-disabled')).toBe('true');
      expect(document.activeElement).toBe(detect.element);
      expect(detect.text()).toContain('Mencari lokasi');
      await detect.trigger('click');
      expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
      success({ coords: { latitude: -1.25, longitude: 116.95, accuracy: 5 } });
      await flushPromises();
      expect(detect.attributes('aria-disabled')).toBeUndefined();
      expect(document.activeElement).toBe(detect.element);
    });

    it('shows a friendly, associated message when permission is denied', async () => {
      const wrapper = await mountPicker({ detectable: true });
      await click(wrapper, 'location-picker-detect');
      failure({ code: 1, PERMISSION_DENIED: 1 });
      await flushPromises();
      const alert = wrapper.get('[role="alert"]');
      expect(alert.text()).toContain('Izin lokasi tidak diberikan');
      expect(
        wrapper.get('[data-test="location-picker-detect"]').attributes('aria-describedby'),
      ).toBe(alert.attributes('id'));
    });

    it('ignores a late result after unmount', async () => {
      const wrapper = await mountPicker({ detectable: true });
      await click(wrapper, 'location-picker-detect');
      wrapper.unmount();
      mounted.pop();
      expect(() =>
        success({ coords: { latitude: -1.25, longitude: 116.95, accuracy: 5 } }),
      ).not.toThrow();
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    });

    it('ignores a late result once the user has placed the pin manually', async () => {
      const wrapper = await mountPicker({ detectable: true });
      await click(wrapper, 'location-picker-detect');
      clickMap(-1.3, 116.9);
      success({ coords: { latitude: -1.25, longitude: 116.95, accuracy: 5 } });
      await flushPromises();
      expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
      expect(lastEmitted(wrapper)).toEqual({ latitude: -1.3, longitude: 116.9 });
    });

    it('cancels in-flight geolocation and ignores late result when parent replaces modelValue', async () => {
      const wrapper = await mountPicker({ detectable: true });
      await click(wrapper, 'location-picker-detect');
      expect(wrapper.get('[data-test="location-picker-detect"]').text()).toContain('Mencari lokasi');
      await wrapper.setProps({ modelValue: { latitude: -1.3, longitude: 116.9 } });
      await flushPromises();
      expect(wrapper.find('[data-test="location-picker-accuracy"]').exists()).toBe(false);
      success({ coords: { latitude: -1.25, longitude: 116.95, accuracy: 5 } });
      await flushPromises();
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();
      expect(wrapper.find('[data-test="location-picker-accuracy"]').exists()).toBe(false);
      expect(wrapper.get('[data-test="location-picker-status"]').text()).toContain(
        'Posisi pin sudah diatur',
      );
    });

    it('clears accuracy text after a manual map click', async () => {
      const wrapper = await mountPicker({ detectable: true });
      await click(wrapper, 'location-picker-detect');
      success({ coords: { latitude: -1.25, longitude: 116.95, accuracy: 12.4 } });
      await flushPromises();
      await wrapper.setProps({ modelValue: lastEmitted(wrapper) });
      expect(wrapper.find('[data-test="location-picker-accuracy"]').exists()).toBe(true);
      clickMap(-1.26, 116.96);
      await flushPromises();
      expect(wrapper.find('[data-test="location-picker-accuracy"]').exists()).toBe(false);
    });

    it('clears accuracy text after dragging the marker', async () => {
      const wrapper = await mountPicker({ detectable: true });
      await click(wrapper, 'location-picker-detect');
      success({ coords: { latitude: -1.25, longitude: 116.95, accuracy: 12.4 } });
      await flushPromises();
      await wrapper.setProps({ modelValue: lastEmitted(wrapper) });
      expect(wrapper.find('[data-test="location-picker-accuracy"]').exists()).toBe(true);
      leafletState.markerLatLng = { lat: -1.26, lng: 116.96 };
      leafletState.markerHandlers.dragend?.();
      await flushPromises();
      expect(wrapper.find('[data-test="location-picker-accuracy"]').exists()).toBe(false);
    });

    it('clears accuracy text after a nudge', async () => {
      const wrapper = await mountPicker({ detectable: true });
      await click(wrapper, 'location-picker-detect');
      success({ coords: { latitude: -1.25, longitude: 116.95, accuracy: 12.4 } });
      await flushPromises();
      await wrapper.setProps({ modelValue: lastEmitted(wrapper) });
      expect(wrapper.find('[data-test="location-picker-accuracy"]').exists()).toBe(true);
      await click(wrapper, 'location-picker-north');
      expect(wrapper.find('[data-test="location-picker-accuracy"]').exists()).toBe(false);
    });

    it('clears accuracy text when clicking center pin, even at the same coordinates', async () => {
      const wrapper = await mountPicker({ detectable: true });
      await click(wrapper, 'location-picker-detect');
      success({
        coords: {
          latitude: leafletState.center.lat,
          longitude: leafletState.center.lng,
          accuracy: 12.4,
        },
      });
      await flushPromises();
      await wrapper.setProps({ modelValue: lastEmitted(wrapper) });
      expect(wrapper.find('[data-test="location-picker-accuracy"]').exists()).toBe(true);
      await click(wrapper, 'location-picker-center');
      expect(wrapper.find('[data-test="location-picker-accuracy"]').exists()).toBe(false);
    });

    it('reports an unsupported device', async () => {
      Reflect.deleteProperty(navigator, 'geolocation');
      const wrapper = await mountPicker({ detectable: true });
      await click(wrapper, 'location-picker-detect');
      expect(wrapper.text()).toContain('Perangkat ini tidak mendukung deteksi lokasi');
    });
  });

  describe('markup and lifecycle', () => {
    it('has no coordinate or zoom entry controls at all', async () => {
      const wrapper = await mountPicker({
        modelValue: { latitude: -1.2, longitude: 116.9, zoom: 13 },
        includeZoom: true,
        detectable: true,
        clearable: true,
      });
      expect(wrapper.findAll('input, textarea, select')).toHaveLength(0);
      expect(wrapper.text()).not.toMatch(/lintang|bujur|latitude|longitude/i);
    });

    it('gives each picker unique, associated ids', async () => {
      const Pair = defineComponent({
        render: () => [
          h(LocationPicker, {
            modelValue: PIN,
            label: 'A',
            helpText: 'Bantuan A',
            error: 'Salah A',
          }),
          h(LocationPicker, {
            modelValue: PIN,
            label: 'B',
            helpText: 'Bantuan B',
            error: 'Salah B',
          }),
        ],
      });
      const pair = mount(Pair, { attachTo: document.body });
      mounted.push(pair);
      await flushPromises();
      const [first, second] = pair.findAllComponents(LocationPicker);
      const ids = Array.from(document.querySelectorAll('[id]')).map((element) => element.id);
      expect(new Set(ids).size).toBe(ids.length);
      const describedBy = first!.get('fieldset').attributes('aria-describedby')!.split(' ');
      expect(describedBy.length).toBe(3);
      for (const id of describedBy) {
        expect(first!.element.contains(document.getElementById(id))).toBe(true);
      }
      expect(second!.get('fieldset').attributes('aria-describedby')).not.toBe(
        first!.get('fieldset').attributes('aria-describedby'),
      );
    });

    it('honours an explicit id prefix', async () => {
      const wrapper = await mountPicker({ idPrefix: 'custom', error: 'Salah' });
      expect(wrapper.find('#custom-error').exists()).toBe(true);
      expect(wrapper.find('#custom-status').exists()).toBe(true);
    });

    it('announces status in a polite live region and uses real labels', async () => {
      const wrapper = await mountPicker({ label: 'Lokasi kantor' });
      const status = wrapper.get('[role="status"]');
      expect(status.attributes('aria-live')).toBe('polite');
      expect(wrapper.get('legend').text()).toBe('Lokasi kantor');
    });

    it('keeps the stacking boundary on the map container', async () => {
      const wrapper = await mountPicker();
      expect(wrapper.get('[data-test="location-picker-map"]').classes()).toEqual(
        expect.arrayContaining(['relative', 'isolate', 'z-0']),
      );
    });

    it('turns off scroll-wheel zoom and the built-in zoom control', async () => {
      await mountPicker();
      expect(leafletState.mapOptions).toMatchObject({
        scrollWheelZoom: false,
        zoomControl: false,
        keyboard: false,
      });
    });

    it('refreshes the map size when its container becomes visible, and ignores zero size', async () => {
      let notify: () => void = () => undefined;
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(callback: () => void) {
            notify = callback;
          }
          observe() {}
          disconnect() {}
        },
      );
      try {
        const wrapper = await mountPicker({ modelValue: PIN });
        const container = wrapper.get('[data-test="location-picker-map"]').element;
        leafletMap.invalidateSize.mockClear();
        notify();
        expect(leafletMap.invalidateSize).not.toHaveBeenCalled();
        Object.defineProperty(container, 'clientWidth', { configurable: true, value: 320 });
        Object.defineProperty(container, 'clientHeight', { configurable: true, value: 288 });
        notify();
        expect(leafletMap.invalidateSize).toHaveBeenCalledTimes(1);
        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('closes a surrounding BaseModal only on the second Escape in keyboard mode', async () => {
      const onClose = vi.fn<() => void>();
      const modal = mount(BaseModal, {
        props: { open: true, title: 'Dialog uji', onClose },
        slots: { default: () => h(LocationPicker, { modelValue: PIN, label: 'Lokasi uji' }) },
        attachTo: document.body,
      });
      mounted.push(modal);
      await flushPromises();
      const toggle = document.querySelector<HTMLButtonElement>(
        '[data-test="location-picker-keyboard"]',
      )!;
      toggle.click();
      await nextTick();
      expect(toggle.getAttribute('aria-pressed')).toBe('true');
      const region = document.querySelector<HTMLElement>('[data-test="location-picker-region"]')!;
      const pressEscape = () =>
        region.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        );
      pressEscape();
      await nextTick();
      expect(onClose).not.toHaveBeenCalled();
      expect(toggle.getAttribute('aria-pressed')).toBe('false');
      pressEscape();
      await nextTick();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('prevents Escape from closing a surrounding BaseModal when focus is on the toggle button', async () => {
      const onClose = vi.fn<() => void>();
      const modal = mount(BaseModal, {
        props: { open: true, title: 'Uji modal' },
        slots: {
          default: () => h(LocationPicker, { label: 'Uji lokasi', modelValue: PIN, clearable: true }),
        },
        attrs: { onClose },
        attachTo: document.body,
      });
      mounted.push(modal);
      await flushPromises();
      const toggle = document.querySelector<HTMLButtonElement>(
        '[data-test="location-picker-keyboard"]',
      )!;
      toggle.click();
      await nextTick();
      expect(toggle.getAttribute('aria-pressed')).toBe('true');

      toggle.focus();
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      toggle.dispatchEvent(event);
      await nextTick();

      expect(event.defaultPrevented).toBe(true);
      expect(onClose).not.toHaveBeenCalled();
      expect(toggle.getAttribute('aria-pressed')).toBe('false');
      expect(document.activeElement).toBe(toggle);
    });

    it('prevents Escape from closing a surrounding BaseModal when focus is on a zoom button', async () => {
      const onClose = vi.fn<() => void>();
      const modal = mount(BaseModal, {
        props: { open: true, title: 'Uji modal' },
        slots: {
          default: () => h(LocationPicker, { label: 'Uji lokasi', modelValue: PIN, clearable: true }),
        },
        attrs: { onClose },
        attachTo: document.body,
      });
      mounted.push(modal);
      await flushPromises();
      const toggle = document.querySelector<HTMLButtonElement>(
        '[data-test="location-picker-keyboard"]',
      )!;
      toggle.click();
      await nextTick();
      expect(toggle.getAttribute('aria-pressed')).toBe('true');

      const zoomIn = document.querySelector<HTMLButtonElement>(
        '[data-test="location-picker-zoom-in"]',
      )!;
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      zoomIn.dispatchEvent(event);
      await nextTick();

      expect(event.defaultPrevented).toBe(true);
      expect(onClose).not.toHaveBeenCalled();
      expect(toggle.getAttribute('aria-pressed')).toBe('false');
      expect(document.activeElement).toBe(toggle);
    });

    it('does not swallow Escape when focus is outside the picker', async () => {
      const onClose = vi.fn<() => void>();
      const modal = mount(BaseModal, {
        props: { open: true, title: 'Uji modal' },
        slots: {
          default: () => [
            h('button', { id: 'outside-btn' }, 'Outside'),
            h(LocationPicker, { label: 'Uji lokasi', modelValue: PIN, clearable: true }),
          ],
        },
        attrs: { onClose },
        attachTo: document.body,
      });
      mounted.push(modal);
      await flushPromises();
      const toggle = document.querySelector<HTMLButtonElement>(
        '[data-test="location-picker-keyboard"]',
      )!;
      toggle.click();
      await nextTick();
      expect(toggle.getAttribute('aria-pressed')).toBe('true');

      const outsideBtn = document.querySelector<HTMLButtonElement>('#outside-btn')!;
      outsideBtn.focus();
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      outsideBtn.dispatchEvent(event);
      await nextTick();

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('removes the window Escape listener on unmount', async () => {
      const add = vi.spyOn(window, 'addEventListener');
      const remove = vi.spyOn(window, 'removeEventListener');
      try {
        const wrapper = await mountPicker({ modelValue: PIN });
        await click(wrapper, 'location-picker-keyboard');
        const registered = add.mock.calls.find(
          ([type, , capture]) => type === 'keydown' && capture,
        );
        expect(registered).toBeDefined();
        wrapper.unmount();
        mounted.pop();
        expect(remove).toHaveBeenCalledWith('keydown', registered![1], true);
      } finally {
        add.mockRestore();
        remove.mockRestore();
      }
    });

    it('removes the window Escape listener when keyboard mode ends via focusout', async () => {
      const remove = vi.spyOn(window, 'removeEventListener');
      const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
      try {
        const wrapper = await mountPicker({ modelValue: PIN });
        const toggle = wrapper.get('[data-test="location-picker-keyboard"]');
        const region = wrapper.get('[data-test="location-picker-region"]');
        await toggle.trigger('click');
        region.element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        await nextTick();
        expect(toggle.attributes('aria-pressed')).toBe('false');
        expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function), true);
        const outer = vi.fn<() => void>();
        document.addEventListener('keydown', outer, true);
        await region.trigger('keydown', { key: 'Escape' });
        document.removeEventListener('keydown', outer, true);
        // The guard is gone, so Escape reaches a surrounding dialog's capture listener.
        expect(outer).toHaveBeenCalledTimes(1);
      } finally {
        remove.mockRestore();
        hasFocus.mockRestore();
      }
    });

    it('disposes the map on unmount', async () => {
      const wrapper = await mountPicker();
      wrapper.unmount();
      mounted.pop();
      expect(leafletMap.remove).toHaveBeenCalledTimes(1);
    });
  });
});
