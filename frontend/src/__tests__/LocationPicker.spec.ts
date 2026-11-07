import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import LocationPicker, {
  type LocationPickerProps,
  type PickerLocation,
} from '../components/maps/LocationPicker.vue';
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
      expect(wrapper.get('[data-test="location-picker-status"]').text()).toContain(
        'Pin digeser ke barat',
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
      expect(region.attributes('tabindex')).toBeUndefined();
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

    it('does not echo programmatic view changes back as edits', async () => {
      const wrapper = await mountPicker({ modelValue: VIEW, includeZoom: true });
      await wrapper.setProps({ modelValue: { latitude: -1.3, longitude: 117, zoom: 12 } });
      expect(leafletMap.setView).toHaveBeenLastCalledWith([-1.3, 117], 12, { animate: false });
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();
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

    it('turns a detected position into a draft only, and shows the accuracy', async () => {
      const wrapper = await mountPicker({ detectable: true });
      await click(wrapper, 'location-picker-detect');
      success({ coords: { latitude: -1.25, longitude: 116.95, accuracy: 12.4 } });
      await flushPromises();
      expect(lastEmitted(wrapper)).toEqual({ latitude: -1.25, longitude: 116.95 });
      expect(leafletState.zoom).toBe(17);
      expect(wrapper.text()).toContain('±12 m');
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

    it('disposes the map on unmount', async () => {
      const wrapper = await mountPicker();
      wrapper.unmount();
      mounted.pop();
      expect(leafletMap.remove).toHaveBeenCalledTimes(1);
    });
  });
});
