import { getCurrentScope, onScopeDispose, readonly, ref } from 'vue';

/**
 * Where the visitor's location stands (SPEC §8, "Lokasi pengunjung").
 *
 * - `idle`: nothing asked yet, or the visitor chose the kelurahan centre again
 * - `checking`: reading the browser's saved permission
 * - `prompt`: permission not decided; waiting for the visitor to press the button
 * - `granted-locating`: one bounded position request is running
 * - `located`: a position is held in memory
 * - `denied` / `unsupported` / `insecure`: no position, and no new request will be made
 * - `timeout` / `unavailable`: the request failed; the visitor may try once more
 */
export type GeolocationStatus =
  | 'idle'
  | 'checking'
  | 'prompt'
  | 'granted-locating'
  | 'located'
  | 'denied'
  | 'unsupported'
  | 'timeout'
  | 'unavailable'
  | 'insecure';

export interface UserPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

/** One position request is given this long once permission is settled. */
export const GEOLOCATION_TIMEOUT_MS = 10_000;
/** A cached fix this young is good enough for "nearest point" distances. */
export const GEOLOCATION_MAX_AGE_MS = 60_000;

// One shared state for the whole session: every consumer sees the same request, the same result and
// the same answer, and a revisit reuses the fix instead of asking the browser again. The position
// lives in memory only; it is never written to storage, sent to the server or reported anywhere.
const status = ref<GeolocationStatus>('idle');
const position = ref<UserPosition | null>(null);

// Bumped whenever pending work must be ignored (reset, permission revoked, last consumer gone).
let generation = 0;
let inflight: Promise<UserPosition | null> | null = null;
let checking: Promise<void> | null = null;
let consumers = 0;
let permissionStatus: PermissionStatus | null = null;

function blockedReason(): 'insecure' | 'unsupported' | null {
  // Browsers expose geolocation on insecure pages but always refuse it; say why instead.
  if (typeof window !== 'undefined' && window.isSecureContext === false) return 'insecure';
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported';
  return null;
}

function failureStatus(error: GeolocationPositionError): GeolocationStatus {
  if (error.code === error.PERMISSION_DENIED) return 'denied';
  if (error.code === error.TIMEOUT) return 'timeout';
  return 'unavailable';
}

/** The single, deduplicated position request. Resolves `null` when it fails or is superseded. */
function locate(): Promise<UserPosition | null> {
  const blocked = blockedReason();
  if (blocked) {
    status.value = blocked;
    return Promise.resolve(null);
  }
  if (inflight) return inflight;

  const requestGeneration = generation;
  status.value = 'granted-locating';

  const promise: Promise<UserPosition | null> = new Promise<UserPosition | null>((resolve) => {
    try {
      navigator.geolocation.getCurrentPosition(
        (result) => {
          if (requestGeneration !== generation) return resolve(null);
          position.value = {
            latitude: result.coords.latitude,
            longitude: result.coords.longitude,
            accuracy: result.coords.accuracy,
          };
          status.value = 'located';
          resolve(position.value);
        },
        (error) => {
          if (requestGeneration !== generation) return resolve(null);
          status.value = failureStatus(error);
          resolve(null);
        },
        {
          enableHighAccuracy: false,
          timeout: GEOLOCATION_TIMEOUT_MS,
          maximumAge: GEOLOCATION_MAX_AGE_MS,
        },
      );
    } catch {
      if (requestGeneration === generation) status.value = 'unavailable';
      resolve(null);
    }
  }).finally(() => {
    if (inflight === promise) inflight = null;
  });

  inflight = promise;
  return promise;
}

function applyPermissionState(state: PermissionState) {
  if (state === 'granted') {
    // Only act when the visitor was waiting on the browser setting: never undo a deliberate
    // "use the kelurahan centre" choice, and never start a second request.
    if (!position.value && !inflight && (status.value === 'prompt' || status.value === 'denied')) {
      void locate();
    }
  } else if (state === 'denied') {
    generation += 1;
    inflight = null;
    position.value = null;
    status.value = 'denied';
  } else if (status.value === 'denied') {
    status.value = 'prompt';
  }
}

function onPermissionChange() {
  if (permissionStatus) applyPermissionState(permissionStatus.state);
}

function stopWatchingPermission() {
  permissionStatus?.removeEventListener?.('change', onPermissionChange);
  permissionStatus = null;
}

async function readPermission(): Promise<PermissionState | null> {
  try {
    const permissions = typeof navigator === 'undefined' ? undefined : navigator.permissions;
    if (!permissions || typeof permissions.query !== 'function') return null;
    const result = await permissions.query({ name: 'geolocation' });
    stopWatchingPermission();
    permissionStatus = result;
    result.addEventListener?.('change', onPermissionChange);
    return result.state;
  } catch {
    // Some browsers reject the query for geolocation: treat the state as unknown.
    return null;
  }
}

/**
 * Called when the map is entered. Reuses a held position; otherwise reads the saved permission and
 * either starts one bounded request (already granted), asks the visitor to opt in (undecided or
 * unknown) or explains the browser setting (denied). It never triggers the browser's own prompt.
 */
async function init(): Promise<void> {
  if (position.value) {
    status.value = 'located';
    return;
  }
  if (inflight) return;
  if (checking) return checking;

  const blocked = blockedReason();
  if (blocked) {
    status.value = blocked;
    return;
  }

  const initGeneration = generation;
  status.value = 'checking';
  const run: Promise<void> = (async () => {
    const state = await readPermission();
    if (initGeneration !== generation) return;
    if (state === 'granted') await locate();
    else if (state === 'denied') status.value = 'denied';
    else status.value = 'prompt';
  })().finally(() => {
    if (checking === run) checking = null;
  });
  checking = run;
  return run;
}

/** The visitor asked for their location (a button press): one shared request. */
function request(): Promise<UserPosition | null> {
  if (position.value) {
    status.value = 'located';
    return Promise.resolve(position.value);
  }
  return locate();
}

/** Back to the kelurahan centre: drops the fix and ignores anything still pending. */
function reset() {
  generation += 1;
  inflight = null;
  checking = null;
  position.value = null;
  status.value = blockedReason() ?? 'idle';
}

function release() {
  consumers = Math.max(0, consumers - 1);
  if (consumers > 0) return;
  stopWatchingPermission();
  if (status.value === 'granted-locating' || status.value === 'checking') {
    // Leaving the page mid-request: ignore the late answer. A fix already held is kept for revisits.
    generation += 1;
    inflight = null;
    checking = null;
    status.value = position.value ? 'located' : 'idle';
  }
}

/** Test helper: forget everything held by the session. */
export function resetGeolocationSession() {
  stopWatchingPermission();
  generation += 1;
  inflight = null;
  checking = null;
  consumers = 0;
  position.value = null;
  status.value = 'idle';
}

export function useGeolocation() {
  consumers += 1;
  if (getCurrentScope()) onScopeDispose(release);

  return {
    status: readonly(status),
    position: readonly(position),
    init,
    request,
    reset,
  };
}
