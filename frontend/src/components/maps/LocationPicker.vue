<script setup lang="ts">
/**
 * Shared visual location picker. Staff place a point (or a whole map view) by looking at a map;
 * they never see or type latitude, longitude or a zoom number.
 *
 * Two behaviours, chosen by `includeZoom`:
 *
 * - **Pin mode** (`includeZoom` false, default): the value is one point. Click or tap the map to
 *   drop the pin, drag the pin to refine. Zoom only changes what the editor sees; it is not part
 *   of the value. Used for a Ketua RT home (`RtLocationPicker.vue`).
 * - **Viewport mode** (`includeZoom` true): the value is the map view itself. A fixed crosshair
 *   marks the centre; panning and zooming the map defines `{ latitude, longitude, zoom }`. Used
 *   for the default public map view in `PublicSettingsForm.vue`.
 *
 * Every action also has a non-pointer path: direction buttons, zoom buttons, a labelled keyboard
 * mode (arrow keys, Shift for a larger step, + and - to zoom, Esc to leave) and, for pin mode,
 * a button that drops the pin at the map centre.
 *
 * The picker only ever emits a draft through `update:modelValue`; saving is the parent form's
 * job. "Use my device location" is a draft change like any other, never an automatic save.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MANGGAR_MAP_CENTER, MANGGAR_MAP_DEFAULT_ZOOM } from '../../constants/mapOrigin';
import {
  COORDINATE_EPSILON,
  DIRECTION_LABELS,
  clampZoom,
  directionOffset,
  moveLocation,
  normalizeLocation,
  sameLocation,
  type GeoPoint,
  type PickerDirection,
} from '../../utils/geoPicker';

export interface PickerLocation {
  latitude: number;
  longitude: number;
  /** Present only when `includeZoom` is true. */
  zoom?: number;
}

export interface LocationPickerProps {
  modelValue: PickerLocation | null;
  /** Visible group label, e.g. "Lokasi rumah Ketua RT". */
  label: string;
  helpText?: string;
  /** Validation message owned by the parent form; announced and tied to the group. */
  error?: string;
  /** Prefix for every generated id. Defaults to a unique id, so several pickers can coexist. */
  idPrefix?: string;
  /** `[lat, lon]` the map opens on when there is no value. */
  initialCenter?: [number, number];
  initialZoom?: number;
  /** Zoom used when jumping to an existing pin or a detected device location (pin mode). */
  focusZoom?: number;
  minZoom?: number;
  maxZoom?: number;
  /** Form is busy: every control is disabled. */
  disabled?: boolean;
  /** Value is shown but cannot be changed. */
  readonly?: boolean;
  /** Pin mode only: show a "Hapus pin" action. */
  clearable?: boolean;
  /** Viewport mode: the zoom level is part of the edited value. */
  includeZoom?: boolean;
  /** Show the optional "Gunakan lokasi perangkat" action. */
  detectable?: boolean;
  /** `data-test` prefix for buttons (`-detect`, `-clear`, ...). */
  testId?: string;
  /** `data-test` of the map container. Defaults to `${testId}-map`. */
  mapTestId?: string;
}

const props = withDefaults(defineProps<LocationPickerProps>(), {
  helpText: undefined,
  error: undefined,
  idPrefix: undefined,
  initialCenter: () => [MANGGAR_MAP_CENTER[0], MANGGAR_MAP_CENTER[1]],
  initialZoom: MANGGAR_MAP_DEFAULT_ZOOM,
  focusZoom: 17,
  minZoom: 1,
  maxZoom: 20,
  disabled: false,
  readonly: false,
  clearable: false,
  includeZoom: false,
  detectable: false,
  testId: 'location-picker',
  mapTestId: undefined,
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: PickerLocation | null): void;
}>();

const generatedId = useId();
const baseId = computed(() => props.idPrefix ?? `location-picker-${generatedId}`);
const helpId = computed(() => `${baseId.value}-help`);
const errorId = computed(() => `${baseId.value}-error`);
const statusId = computed(() => `${baseId.value}-status`);
const keysId = computed(() => `${baseId.value}-keys`);
const detectErrorId = computed(() => `${baseId.value}-detect-error`);
const mapDataTest = computed(() => props.mapTestId ?? `${props.testId}-map`);

const root = ref<HTMLElement | null>(null);
const container = ref<HTMLElement | null>(null);
const region = ref<HTMLElement | null>(null);
const keyboardToggle = ref<HTMLButtonElement | null>(null);
const zoomInButton = ref<HTMLButtonElement | null>(null);
const zoomOutButton = ref<HTMLButtonElement | null>(null);
const centerPinButton = ref<HTMLButtonElement | null>(null);

const viewport = computed(() => props.includeZoom);
const editable = computed(() => !props.disabled && !props.readonly);
/** Pin mode lets a read-only viewer still look around; viewport mode's view *is* the value. */
const viewInteractive = computed(() => (viewport.value ? editable.value : !props.disabled));

const keyboardMode = ref(false);
const announcement = ref('');
const locationError = ref('');
const accuracy = ref<number | null>(null);
const detecting = ref(false);
const viewZoom = ref(props.initialZoom);

let map: L.Map | null = null;
let marker: L.Marker | null = null;
let isUnmounted = false;
let syncing = false;
let geoRequest = 0;
let announceTimer: number | undefined;
let reannounceTimer: number | undefined;
/** Bumped by every announce/clear/unmount so a deferred re-announce can tell it is stale. */
let announceSeq = 0;
let nudgeAnnounceTimer: number | undefined;
let resizeObserver: ResizeObserver | null = null;
let isResizing = false;
let resizeEndTimer: number | undefined;
let userInteracted = false;
/** Last value emitted but not yet echoed back by the parent; keeps rapid key presses accurate. */
let pending: { value: PickerLocation | null } | null = null;
let lastEmitted: PickerLocation | null = null;

const hasValue = computed(() => props.modelValue !== null);
const atMinZoom = computed(() => viewZoom.value <= props.minZoom);
const atMaxZoom = computed(() => viewZoom.value >= props.maxZoom);
const canZoom = computed(() => viewInteractive.value);

/** Persistent state line, always derived from `modelValue` so it can never go stale. */
const statusText = computed(() => {
  const base = viewport.value
    ? hasValue.value
      ? 'Tampilan peta sudah diatur.'
      : 'Tampilan peta belum diatur.'
    : hasValue.value
      ? 'Posisi pin sudah diatur.'
      : 'Belum ada pin.';
  if (props.readonly) return `${base} Peta hanya dapat dilihat.`;
  return base;
});

/** Device accuracy in plain words; no number is shown. */
const accuracyText = computed(() => {
  if (accuracy.value === null) return '';
  return accuracy.value <= 50
    ? 'Lokasi perangkat terdeteksi dan cukup dekat.'
    : 'Lokasi perangkat terdeteksi tetapi kurang tepat; geser peta atau pin bila perlu.';
});

const groupDescribedBy = computed(() => {
  const ids = [
    props.helpText ? helpId.value : null,
    props.error ? errorId.value : null,
    statusId.value,
  ];
  return ids.filter((id): id is string => Boolean(id)).join(' ');
});

const directions: ReadonlyArray<PickerDirection> = ['north', 'south', 'east', 'west'];

const ANNOUNCEMENT_TTL_MS = 4000;
const NUDGE_ANNOUNCE_DELAY_MS = 600;
/** Gap between emptying and refilling the live region so the change survives coalescing. */
const REANNOUNCE_GAP_MS = 60;

/** Transient message for the hidden live region; cleared after a few seconds. */
function announce(message: string): void {
  window.clearTimeout(nudgeAnnounceTimer);
  window.clearTimeout(announceTimer);
  const token = ++announceSeq;
  if (announcement.value === message) {
    // Identical text would not mutate the live region, so assistive tech would stay silent.
    // The gap is a real timeout (not a microtask) so the empty state is painted and noticed.
    announcement.value = '';
    reannounceTimer = window.setTimeout(() => {
      if (isUnmounted || token !== announceSeq) return;
      announcement.value = message;
    }, REANNOUNCE_GAP_MS);
  } else {
    announcement.value = message;
  }
  announceTimer = window.setTimeout(() => {
    announcement.value = '';
  }, ANNOUNCEMENT_TTL_MS);
}

/** Held arrow keys: announce once, shortly after the last nudge, not on every repeat. */
function announceNudge(message: string): void {
  window.clearTimeout(nudgeAnnounceTimer);
  nudgeAnnounceTimer = window.setTimeout(() => announce(message), NUDGE_ANNOUNCE_DELAY_MS);
}

function clearAnnouncement(): void {
  announceSeq += 1;
  window.clearTimeout(announceTimer);
  window.clearTimeout(nudgeAnnounceTimer);
  announcement.value = '';
}

function sameValue(a: PickerLocation | null, b: PickerLocation | null): boolean {
  return sameLocation(a, b) && (a?.zoom ?? null) === (b?.zoom ?? null);
}

function runSilently(action: () => void): void {
  const previous = syncing;
  syncing = true;
  try {
    action();
  } finally {
    syncing = previous;
  }
}

function latest(): PickerLocation | null {
  return pending ? pending.value : props.modelValue;
}

function viewCenter(): GeoPoint | null {
  if (!map) return null;
  const center = map.getCenter();
  return normalizeLocation({ latitude: center.lat, longitude: center.lng });
}

function cancelDetect(): void {
  geoRequest += 1;
  detecting.value = false;
}

/** Emits a draft value. Out-of-world values are normalised; duplicates are dropped. */
function emitValue(location: GeoPoint, zoom?: number, fromDetect = false): void {
  if (!editable.value) return;
  if (!fromDetect) {
    if (accuracy.value !== null) {
      clearAnnouncement();
    }
    accuracy.value = null;
  }
  const normalized = normalizeLocation(location);
  if (!normalized) return;
  const next: PickerLocation = viewport.value
    ? {
        ...normalized,
        zoom: clampZoom(zoom ?? viewZoom.value, props.minZoom, props.maxZoom),
      }
    : normalized;
  const current = latest();
  if (current && sameValue(current, next)) return;
  lastEmitted = next;
  const emitted = { value: next };
  pending = emitted;
  emit('update:modelValue', next);
  void nextTick(() => {
    if (pending === emitted) pending = null;
  });
}

function markerIcon(): L.DivIcon {
  return L.divIcon({
    className: 'location-picker-pin',
    // Leaflet takes this icon as an HTML string, outside Vue's template and Tailwind's class
    // scan, so the brand navy (--color-brand-navy) and white are written as hex here.
    html: '<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true" focusable="false"><circle cx="14" cy="14" r="11" fill="#0A2353" stroke="#FFFFFF" stroke-width="3"/><circle cx="14" cy="14" r="3.5" fill="#FFFFFF"/></svg>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function placeMarker(location: GeoPoint): void {
  if (!map) return;
  if (!marker) {
    marker = L.marker([location.latitude, location.longitude], {
      draggable: editable.value,
      keyboard: false,
      icon: markerIcon(),
    }).addTo(map);
    marker.on('dragstart', () => {
      userInteracted = true;
    });
    marker.on('dragend', () => {
      const next = marker?.getLatLng();
      if (!next) return;
      cancelDetect();
      emitValue({ latitude: next.lat, longitude: next.lng });
      announce('Pin dipindahkan.');
    });
  } else {
    marker.setLatLng([location.latitude, location.longitude]);
  }
}

function near(a: GeoPoint, b: GeoPoint): boolean {
  return (
    Math.abs(a.latitude - b.latitude) < COORDINATE_EPSILON &&
    Math.abs(a.longitude - b.longitude) < COORDINATE_EPSILON
  );
}

/** Brings the map and marker in line with `modelValue` without emitting anything. */
function syncFromValue(initial = false): void {
  if (!map) return;
  const value = props.modelValue;
  if (viewport.value) {
    const target: GeoPoint = value ?? {
      latitude: props.initialCenter[0],
      longitude: props.initialCenter[1],
    };
    const zoom = clampZoom(value?.zoom ?? props.initialZoom, props.minZoom, props.maxZoom);
    const center = viewCenter();
    if (!center || !near(center, target) || map.getZoom() !== zoom) {
      runSilently(() =>
        map?.setView([target.latitude, target.longitude], zoom, { animate: false }),
      );
    }
    viewZoom.value = zoom;
    return;
  }
  if (!value) {
    marker?.remove();
    marker = null;
    return;
  }
  placeMarker(value);
  if (initial) return;
  if (!map.getBounds().contains([value.latitude, value.longitude])) {
    runSilently(() => map?.panTo([value.latitude, value.longitude], { animate: false }));
  }
}

/** Viewport mode: move the map view and report it as the new draft. */
function applyView(location: GeoPoint, zoom: number, fromDetect = false): void {
  const normalized = normalizeLocation(location);
  if (!normalized || !map) return;
  const nextZoom = clampZoom(zoom, props.minZoom, props.maxZoom);
  viewZoom.value = nextZoom;
  runSilently(() =>
    map?.setView([normalized.latitude, normalized.longitude], nextZoom, { animate: false }),
  );
  emitValue(normalized, nextZoom, fromDetect);
}

function setInteractivity(): void {
  if (!map) return;
  const on = viewInteractive.value;
  const handlers = ['dragging', 'touchZoom', 'doubleClickZoom', 'boxZoom'] as const;
  const bag = map as unknown as Record<string, { enable(): void; disable(): void } | undefined>;
  for (const name of handlers) {
    const handler = bag[name];
    // Viewport mode re-centres on a click; a double-click would fire two re-centres plus a zoom.
    if (on && !(viewport.value && name === 'doubleClickZoom')) handler?.enable();
    else handler?.disable();
  }
  const dragging = marker?.dragging;
  if (editable.value) dragging?.enable();
  else dragging?.disable();
}

function handleMapClick(event: L.LeafletMouseEvent): void {
  if (!editable.value) return;
  userInteracted = true;
  cancelDetect();
  const location = { latitude: event.latlng.lat, longitude: event.latlng.lng };
  if (viewport.value) {
    applyView(location, viewZoom.value);
    announce('Tampilan peta dipusatkan pada titik yang dipilih.');
  } else {
    emitValue(location);
    announce('Pin diletakkan.');
  }
}

function handleMoveEnd(): void {
  if (syncing || isResizing || !viewport.value || !editable.value || !map) return;
  const stored = props.modelValue;
  if (!userInteracted && !stored) return;
  const center = viewCenter();
  if (!center) return;
  // Leaflet's own debounced window-resize handler fires `moveend` outside `runSilently`; a view
  // that is still the stored one (same centre within tolerance, same clamped zoom) is not an edit
  // and must not mark the form dirty. A genuine pan moves the centre past the tolerance.
  if (
    stored &&
    near(center, stored) &&
    map.getZoom() === clampZoom(stored.zoom ?? NaN, props.minZoom, props.maxZoom)
  ) {
    return;
  }
  cancelDetect();
  emitValue(center, map.getZoom());
}

function handleZoomEnd(): void {
  if (!map) return;
  viewZoom.value = clampZoom(map.getZoom(), props.minZoom, props.maxZoom);
}

function refreshSize(): void {
  if (!map || !container.value) return;
  // A hidden tab or closed dialog reports 0x0; resizing then would shift the centre.
  if (container.value.clientWidth === 0 || container.value.clientHeight === 0) return;
  isResizing = true;
  window.clearTimeout(resizeEndTimer);
  runSilently(() => map?.invalidateSize());
  syncFromValue(true);
  resizeEndTimer = window.setTimeout(() => {
    isResizing = false;
  }, 100);
}

onMounted(() => {
  isUnmounted = false;
  nextTick(() => {
    if (isUnmounted || !container.value) return;
    const value = props.modelValue;
    const start: GeoPoint = value ?? {
      latitude: props.initialCenter[0],
      longitude: props.initialCenter[1],
    };
    const startZoom = viewport.value
      ? clampZoom(value?.zoom ?? props.initialZoom, props.minZoom, props.maxZoom)
      : value
        ? props.focusZoom
        : props.initialZoom;
    viewZoom.value = startZoom;
    map = L.map(container.value, {
      doubleClickZoom: !viewport.value,
      // A position picker needs precision: a fast drag must not coast hundreds of pixels away.
      inertia: false,
      zoomControl: false,
      keyboard: false,
      scrollWheelZoom: false,
      minZoom: props.minZoom,
      maxZoom: props.maxZoom,
    }).setView([start.latitude, start.longitude], startZoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxNativeZoom: 19,
      maxZoom: props.maxZoom,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    map.on('click', handleMapClick);
    map.on('moveend', handleMoveEnd);
    map.on('zoomend', handleZoomEnd);
    map.on('dragstart', () => {
      userInteracted = true;
    });
    map.on('boxzoomend', () => {
      userInteracted = true;
    });
    map.on('resize', () => {
      isResizing = true;
      window.clearTimeout(resizeEndTimer);
      resizeEndTimer = window.setTimeout(() => {
        isResizing = false;
      }, 100);
    });
    if (!viewport.value && value) placeMarker(value);
    if (!viewInteractive.value || !editable.value) setInteractivity();

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => refreshSize());
      resizeObserver.observe(container.value);
    }
  });
});

onUnmounted(() => {
  isUnmounted = true;
  window.removeEventListener('keydown', escapeGuard, true);
  geoRequest += 1;
  clearTogglePress();
  window.clearTimeout(reannounceTimer);
  window.clearTimeout(resizeEndTimer);
  clearAnnouncement();
  resizeObserver?.disconnect();
  resizeObserver = null;
  map?.remove();
  map = null;
  marker = null;
});

watch(
  () => props.modelValue,
  () => {
    // A value that is not the one this picker just emitted came from the parent (reset, reload):
    // drop messages and the device accuracy that described the previous value.
    const isEcho =
      (pending !== null && sameValue(pending.value, props.modelValue)) ||
      (lastEmitted !== null && sameValue(lastEmitted, props.modelValue));
    if (!isEcho) {
      userInteracted = false;
      cancelDetect();
      clearAnnouncement();
      accuracy.value = null;
    }
    lastEmitted = null;
    pending = null;
    syncFromValue();
  },
  { deep: true },
);

watch([() => props.disabled, () => props.readonly], () => {
  if (!editable.value) {
    cancelDetect();
    keyboardMode.value = false;
  }
  setInteractivity();
});

function pinCenter(): GeoPoint | null {
  if (!marker) return null;
  const latlng = marker.getLatLng();
  return normalizeLocation({ latitude: latlng.lat, longitude: latlng.lng });
}

function nudge(direction: PickerDirection, large = false, viaKeyboard = false): void {
  if (!editable.value || !map) return;
  userInteracted = true;
  cancelDetect();
  const base = viewport.value ? viewCenter() : (pinCenter() ?? latest());
  if (!base) {
    // Pin mode without a pin: the first action drops one at the map centre.
    placePinAtCenter();
    return;
  }
  if (viewport.value) {
    // Pan by whole screen pixels: re-centring on a computed coordinate makes Leaflet truncate the
    // fractional pixel of every step (`_tryAnimatedPan`), so six presses covered 91px, not 96.
    const [dx, dy] = directionOffset(direction, large);
    runSilently(() => map?.panBy([dx, dy], { animate: false }));
    const center = viewCenter();
    if (center) emitValue(center, viewZoom.value);
    const message = `Peta digeser ke ${DIRECTION_LABELS[direction]}.`;
    if (viaKeyboard) announceNudge(message);
    else announce(message);
    return;
  }
  const moved = moveLocation(base, direction, viewZoom.value, large);
  placeMarker(moved);
  emitValue(moved);
  if (!map.getBounds().contains([moved.latitude, moved.longitude])) {
    runSilently(() => map?.panTo([moved.latitude, moved.longitude], { animate: false }));
  }
  const message = `Pin digeser ke ${DIRECTION_LABELS[direction]}.`;
  if (viaKeyboard) announceNudge(message);
  else announce(message);
}

function placePinAtCenter(): void {
  if (!editable.value || viewport.value) return;
  userInteracted = true;
  const center = viewCenter();
  if (!center) return;
  cancelDetect();
  placeMarker(center);
  emitValue(center);
  announce('Pin diletakkan di tengah peta.');
}

function zoomBy(delta: 1 | -1): void {
  if (!map || !canZoom.value) return;
  userInteracted = true;
  const next = clampZoom(viewZoom.value + delta, props.minZoom, props.maxZoom);
  if (next === viewZoom.value) {
    // At a limit nothing changes: say so instead of claiming a zoom happened. Every press
    // re-arms the trailing debounce, so a burst announces once, shortly after its last press. No
    // "already announced" flag: it outlived a message that a newer announcement, an outside value
    // change or the TTL had removed, which silenced every later burst at that limit.
    announceNudge(delta > 0 ? 'Pembesaran peta sudah maksimum.' : 'Pembesaran peta sudah minimum.');
    return;
  }
  // Only a button press leaves focus on a zoom button; a `+`/`-` key press keeps it in the region.
  const pressed = delta > 0 ? zoomInButton.value : zoomOutButton.value;
  const fromButton = pressed !== null && document.activeElement === pressed;
  viewZoom.value = next;
  if (viewport.value) {
    const center = viewCenter();
    if (center) applyView(center, next);
  } else {
    runSilently(() => map?.setZoom(next, { animate: false }));
  }
  // Rapid zoom steps are announced once, with the final direction, like held arrow keys.
  announceNudge(delta > 0 ? 'Peta diperbesar.' : 'Peta diperkecil.');
  // A button that just disabled itself must not drop focus on the page body (WCAG 2.4.3). When
  // the zoom came from a key, focus is in the region and must stay there.
  if (!fromButton) return;
  void nextTick(() => {
    if (delta > 0 && atMaxZoom.value) zoomOutButton.value?.focus();
    if (delta < 0 && atMinZoom.value) zoomInButton.value?.focus();
  });
}

function clearLocation(): void {
  if (!editable.value || viewport.value || !props.clearable) return;
  userInteracted = true;
  cancelDetect();
  accuracy.value = null;
  lastEmitted = null;
  const emitted = { value: null };
  pending = emitted;
  emit('update:modelValue', null);
  announce('Pin dihapus.');
  void nextTick(() => {
    if (pending === emitted) pending = null;
    centerPinButton.value?.focus();
  });
}

function detectLocation(): void {
  // The button stays enabled (aria-disabled) while searching so it never loses keyboard focus.
  if (!editable.value || detecting.value) return;
  userInteracted = true;
  locationError.value = '';
  accuracy.value = null;
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    locationError.value = 'Perangkat ini tidak mendukung deteksi lokasi.';
    return;
  }
  const request = ++geoRequest;
  detecting.value = true;
  announce('Mencari lokasi perangkat…');
  navigator.geolocation.getCurrentPosition(
    (position) => {
      // Ignore late results: after unmount, after a manual change, or once editing is locked.
      if (isUnmounted || request !== geoRequest || !editable.value) return;
      detecting.value = false;
      const location = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      accuracy.value = position.coords.accuracy;
      if (viewport.value) {
        applyView(location, props.focusZoom, true);
      } else {
        emitValue(location, undefined, true);
        viewZoom.value = props.focusZoom;
        runSilently(() =>
          map?.setView([location.latitude, location.longitude], props.focusZoom, {
            animate: false,
          }),
        );
      }
      announce('Lokasi perangkat dipakai sebagai usulan. Periksa lalu sesuaikan jika perlu.');
    },
    (error) => {
      if (isUnmounted || request !== geoRequest) return;
      detecting.value = false;
      locationError.value =
        error.code === error.PERMISSION_DENIED
          ? 'Izin lokasi tidak diberikan; atur peta secara manual.'
          : 'Lokasi tidak dapat ditentukan; atur peta secara manual.';
      announce('Lokasi perangkat tidak tersedia.');
    },
    { timeout: 10000 },
  );
}

/**
 * Set while a pointer press on the keyboard toggle is in flight. Browsers that do not focus a
 * button on click (Safari, Firefox on macOS, iOS Safari) blur the region with no related target
 * before the click fires; without this flag that would read as a click-away and end the mode,
 * and the click would then switch it straight back on.
 */
let togglePressing = false;
let togglePressTimer: number | undefined;
const TOGGLE_PRESS_TIMEOUT_MS = 300;

function clearTogglePress(): void {
  togglePressing = false;
  window.clearTimeout(togglePressTimer);
}

function markTogglePress(): void {
  togglePressing = true;
  window.clearTimeout(togglePressTimer);
  // A press dragged off the button never produces a click; do not leave the flag stuck.
  togglePressTimer = window.setTimeout(clearTogglePress, TOGGLE_PRESS_TIMEOUT_MS);
}

function toggleKeyboardMode(): void {
  clearTogglePress();
  if (!editable.value) return;
  keyboardMode.value = !keyboardMode.value;
  announce(
    keyboardMode.value
      ? 'Mode keyboard aktif. Gunakan tombol panah untuk menggeser.'
      : 'Mode keyboard nonaktif.',
  );
  if (keyboardMode.value) void focusRegionWhenReady();
}

/**
 * `preventScroll` is the load-bearing part: without it, focusing the region scrolls the
 * surrounding dialog, which shifted the controls under the pointer. Making the region focusable
 * first and focusing after `nextTick` (when the template's `tabindex="0"` has rendered) is
 * defensive ordering, harmless but not required.
 */
async function focusRegionWhenReady(): Promise<void> {
  const element = region.value;
  if (!element) return;
  element.tabIndex = 0;
  await nextTick();
  if (isUnmounted || !keyboardMode.value) return;
  region.value?.focus({ preventScroll: true });
}

function onKeydown(event: KeyboardEvent): void {
  if (!keyboardMode.value || !editable.value) return;
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  const arrows: Record<string, PickerDirection> = {
    ArrowUp: 'north',
    ArrowDown: 'south',
    ArrowRight: 'east',
    ArrowLeft: 'west',
  };
  const direction = arrows[event.key];
  if (direction) {
    event.preventDefault();
    nudge(direction, event.shiftKey, true);
    return;
  }
  if (event.key === '+' || event.key === '=') {
    event.preventDefault();
    zoomBy(1);
  } else if (event.key === '-' || event.key === '_') {
    event.preventDefault();
    zoomBy(-1);
  }
}

/**
 * Escape leaves keyboard mode. A surrounding `BaseModal` closes on Escape from a capture
 * listener on `document`, which runs before any handler on this component, so while keyboard
 * mode is on we intercept Escape one step earlier, on `window` in the capture phase, and keep
 * it from reaching the dialog. Outside keyboard mode Escape is left alone (it closes the dialog).
 */
function escapeGuard(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !keyboardMode.value) return;
  if (!(event.target instanceof Node) || !root.value?.contains(event.target)) return;
  event.preventDefault();
  event.stopPropagation();
  keyboardMode.value = false;
  announce('Mode keyboard nonaktif.');
  void nextTick(() => keyboardToggle.value?.focus());
}

watch(keyboardMode, (on) => {
  if (typeof window === 'undefined') return;
  if (on) window.addEventListener('keydown', escapeGuard, true);
  else window.removeEventListener('keydown', escapeGuard, true);
});

function onFocusOut(event: FocusEvent): void {
  if (!keyboardMode.value) return;
  const next = event.relatedTarget;
  if (!(next instanceof Node)) {
    // No related target: either the window lost focus (alt-tab; keep the mode for when it
    // returns) or a click landed on non-focusable page content (the document still has focus).
    if (togglePressing) return;
    if (typeof document !== 'undefined' && document.hasFocus()) {
      keyboardMode.value = false;
      announce('Mode keyboard nonaktif.');
    }
    return;
  }
  if (root.value?.contains(next)) return;
  keyboardMode.value = false;
  announce('Mode keyboard nonaktif.');
}

// Only colour, background and border transition: `transition-colors` also animates
// `outline-color`, which starts from currentColor, so a focus ring on the white-text ON toggle
// would fade in from white (invisible on the light panel) instead of showing navy at once.
const sharedButtonClasses =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-btn border-2 border-brand-navy px-3 py-2 text-sm font-medium transition-[color,background-color,border-color] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:border-border disabled:bg-surface disabled:text-text-muted disabled:hover:bg-surface disabled:hover:text-text-muted';
const buttonClasses = `${sharedButtonClasses} bg-surface text-brand-navy hover:bg-brand-navy hover:text-text-inverse`;

// The toggle's fill, text colour and hover come from its state, so they are not in the shared
// classes. The focus ring is the shared navy one in both states: it is drawn outside the button,
// so it must contrast with the surrounding surface, not with the button fill.
const toggleBaseClasses = sharedButtonClasses;
const toggleOnClasses = 'bg-brand-navy text-text-inverse';
// OFF hovers to a light tint (not the ON fill), so hover never looks like the ON state; ON keeps
// its fill on hover.
const toggleOffClasses = 'bg-surface text-brand-navy hover:bg-surface-hover';
</script>

<template>
  <fieldset
    ref="root"
    class="min-w-0 space-y-3 border-0 p-0"
    :aria-describedby="groupDescribedBy"
    :data-test="testId"
    @keydown="onKeydown"
    @focusout="onFocusOut"
  >
    <legend class="text-brand-navy text-sm font-medium">{{ label }}</legend>

    <p v-if="helpText" :id="helpId" class="text-text-muted text-sm leading-snug">{{ helpText }}</p>

    <slot />

    <div
      :id="`${baseId}-focus`"
      ref="region"
      :data-test="`${testId}-region`"
      class="rounded-card focus-visible:outline-focus-ring relative isolate z-0 focus-visible:outline-2 focus-visible:outline-offset-2"
      :role="keyboardMode ? 'group' : undefined"
      :tabindex="keyboardMode ? 0 : -1"
      :aria-label="keyboardMode ? `Peta ${label}, mode keyboard aktif` : undefined"
      :aria-describedby="keyboardMode ? keysId : undefined"
    >
      <div
        ref="container"
        class="rounded-card border-border-strong bg-surface-muted relative isolate z-0 h-72 w-full overflow-hidden border"
        :data-test="mapDataTest"
      />
      <svg
        v-if="viewport"
        class="pointer-events-none absolute top-1/2 left-1/2 z-10 h-9 w-9 -translate-x-1/2 -translate-y-1/2"
        viewBox="0 0 36 36"
        aria-hidden="true"
        focusable="false"
        :data-test="`${testId}-crosshair`"
      >
        <path d="M18 3v10M18 23v10M3 18h10M23 18h10" class="stroke-white" stroke-width="5" />
        <path d="M18 3v10M18 23v10M3 18h10M23 18h10" class="stroke-brand-navy" stroke-width="2" />
        <circle cx="18" cy="18" r="2.5" class="fill-brand-navy stroke-white" stroke-width="1.5" />
      </svg>
    </div>

    <p :id="statusId" class="text-brand-navy text-sm font-medium" :data-test="`${testId}-status`">
      {{ statusText }}
    </p>
    <p role="status" aria-live="polite" class="sr-only" :data-test="`${testId}-announcement`">
      {{ announcement }}
    </p>

    <p v-if="error" :id="errorId" class="text-status-error text-sm font-medium">{{ error }}</p>

    <div class="space-y-2">
      <div
        role="group"
        :aria-label="viewport ? 'Geser peta' : 'Geser pin'"
        class="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        <button
          v-for="direction in directions"
          :key="direction"
          type="button"
          :class="buttonClasses"
          :disabled="!editable || (!viewport && !hasValue)"
          :data-test="`${testId}-${direction}`"
          @click="nudge(direction)"
        >
          Geser ke {{ DIRECTION_LABELS[direction] }}
        </button>
      </div>

      <div role="group" aria-label="Perbesar atau perkecil peta" class="grid grid-cols-2 gap-2">
        <button
          ref="zoomInButton"
          type="button"
          :class="buttonClasses"
          :disabled="!canZoom || atMaxZoom"
          :data-test="`${testId}-zoom-in`"
          @click="zoomBy(1)"
        >
          Perbesar
        </button>
        <button
          ref="zoomOutButton"
          type="button"
          :class="buttonClasses"
          :disabled="!canZoom || atMinZoom"
          :data-test="`${testId}-zoom-out`"
          @click="zoomBy(-1)"
        >
          Perkecil
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          v-if="!viewport"
          ref="centerPinButton"
          type="button"
          :class="buttonClasses"
          :disabled="!editable"
          :data-test="`${testId}-center`"
          @click="placePinAtCenter"
        >
          Letakkan pin di tengah peta
        </button>
        <button
          v-if="detectable"
          type="button"
          :class="[buttonClasses, detecting ? 'cursor-wait opacity-70' : '']"
          :disabled="!editable"
          :aria-disabled="detecting ? 'true' : undefined"
          :aria-describedby="locationError ? detectErrorId : undefined"
          :data-test="`${testId}-detect`"
          @click="detectLocation"
        >
          {{ detecting ? 'Mencari lokasi…' : 'Gunakan lokasi perangkat' }}
        </button>
        <button
          v-if="clearable && !viewport"
          type="button"
          :class="buttonClasses"
          :disabled="!editable || !hasValue"
          :data-test="`${testId}-clear`"
          @click="clearLocation"
        >
          Hapus pin
        </button>
        <button
          ref="keyboardToggle"
          type="button"
          :class="[toggleBaseClasses, keyboardMode ? toggleOnClasses : toggleOffClasses, 'gap-2']"
          :disabled="!editable"
          :aria-pressed="keyboardMode"
          :aria-describedby="keysId"
          :data-test="`${testId}-keyboard`"
          @pointerdown="markTogglePress"
          @mousedown="markTogglePress"
          @touchstart.passive="markTogglePress"
          @click="toggleKeyboardMode"
        >
          <svg
            v-if="keyboardMode"
            class="size-4 shrink-0"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false"
            :data-test="`${testId}-keyboard-check`"
          >
            <path d="M3 8.5l3.5 3.5L13 4.5" />
          </svg>
          <span v-else class="size-4 shrink-0" aria-hidden="true"></span>
          Mode keyboard
        </button>
      </div>
    </div>

    <p :id="keysId" class="text-text-muted text-sm leading-snug">
      <strong class="text-brand-navy font-semibold">Mode keyboard:</strong>
      aktifkan, lalu tekan tombol panah untuk menggeser {{ viewport ? 'peta' : 'pin' }}. Tahan Shift
      untuk langkah lebih besar. Tekan + untuk memperbesar, − untuk memperkecil, dan Esc untuk
      keluar.
    </p>

    <p v-if="accuracyText" class="text-text-muted text-sm" :data-test="`${testId}-accuracy`">
      {{ accuracyText }}
    </p>
    <p
      v-if="locationError"
      :id="detectErrorId"
      role="alert"
      class="text-status-error text-sm font-medium"
    >
      {{ locationError }}
    </p>
  </fieldset>
</template>

<style>
.leaflet-container {
  font-family: inherit;
}

.location-picker-pin {
  background: transparent !important;
  border: none !important;
}
</style>
