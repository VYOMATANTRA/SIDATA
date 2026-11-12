import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GEOLOCATION_MAX_AGE_MS,
  GEOLOCATION_TIMEOUT_MS,
  resetGeolocationSession,
  useGeolocation,
} from '../composables/useGeolocation';

type SuccessCb = (position: GeolocationPosition) => void;
type ErrorCb = (error: GeolocationPositionError) => void;

const FIX = {
  coords: { latitude: -1.2, longitude: 116.9, accuracy: 12 },
  timestamp: 1,
} as GeolocationPosition;

function geoError(code: 1 | 2 | 3) {
  return {
    code,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
    message: '',
  } as GeolocationPositionError;
}

const overrides: string[] = [];
function setNavigator(key: string, value: unknown) {
  Object.defineProperty(navigator, key, { value, configurable: true });
  overrides.push(key);
}

function permission(state: PermissionState) {
  const listeners: Array<() => void> = [];
  const status = {
    state,
    addEventListener: vi.fn<(type: string, fn: () => void) => void>((_t, fn) => listeners.push(fn)),
    removeEventListener: vi.fn<(type: string, fn: () => void) => void>(),
  };
  setNavigator('permissions', { query: vi.fn<() => Promise<unknown>>().mockResolvedValue(status) });
  return {
    status,
    change(next: PermissionState) {
      status.state = next;
      listeners.forEach((fn) => fn());
    },
  };
}

beforeEach(() => {
  resetGeolocationSession();
});

afterEach(() => {
  for (const key of overrides.splice(0)) {
    delete (navigator as unknown as Record<string, unknown>)[key];
  }
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  resetGeolocationSession();
});

describe('useGeolocation', () => {
  it('reports unsupported when the browser has no geolocation', async () => {
    const geo = useGeolocation();
    await geo.init();
    expect(geo.status.value).toBe('unsupported');
  });

  it('reports insecure on a page that is not a secure context', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    setNavigator('geolocation', { getCurrentPosition: vi.fn<() => void>() });
    const geo = useGeolocation();
    await geo.init();
    expect(geo.status.value).toBe('insecure');
  });

  it('requests once with a bounded timeout and age when permission is granted', async () => {
    permission('granted');
    const getCurrentPosition = vi.fn<
      (ok: SuccessCb, fail?: ErrorCb, options?: PositionOptions) => void
    >((ok) => ok(FIX));
    setNavigator('geolocation', { getCurrentPosition });
    const geo = useGeolocation();

    await geo.init();

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition.mock.calls[0]).toBeDefined();
    expect(getCurrentPosition.mock.calls[0]?.[2]).toEqual({
      enableHighAccuracy: false,
      timeout: GEOLOCATION_TIMEOUT_MS,
      maximumAge: GEOLOCATION_MAX_AGE_MS,
    });
    expect(geo.status.value).toBe('located');
    expect(geo.position.value).toEqual({ latitude: -1.2, longitude: 116.9, accuracy: 12 });
  });

  it('waits for a button press when undecided and never asks by itself', async () => {
    permission('prompt');
    const getCurrentPosition = vi.fn<(ok: SuccessCb) => void>((ok) => ok(FIX));
    setNavigator('geolocation', { getCurrentPosition });
    const geo = useGeolocation();

    await geo.init();
    expect(geo.status.value).toBe('prompt');
    expect(getCurrentPosition).not.toHaveBeenCalled();

    await geo.request();
    expect(geo.status.value).toBe('located');
  });

  it('does not request when denied, and recovers when the browser setting changes', async () => {
    const perm = permission('denied');
    const getCurrentPosition = vi.fn<(ok: SuccessCb) => void>((ok) => ok(FIX));
    setNavigator('geolocation', { getCurrentPosition });
    const geo = useGeolocation();

    await geo.init();
    expect(geo.status.value).toBe('denied');
    expect(getCurrentPosition).not.toHaveBeenCalled();

    perm.change('granted');
    await Promise.resolve();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(geo.status.value).toBe('located');
  });

  it('drops the fix when permission is revoked', async () => {
    const perm = permission('granted');
    setNavigator('geolocation', {
      getCurrentPosition: vi.fn<(ok: SuccessCb) => void>((ok) => ok(FIX)),
    });
    const geo = useGeolocation();
    await geo.init();
    expect(geo.position.value).not.toBeNull();

    perm.change('denied');
    expect(geo.status.value).toBe('denied');
    expect(geo.position.value).toBeNull();
  });

  it.each([
    [1, 'denied'],
    [2, 'unavailable'],
    [3, 'timeout'],
  ] as const)('maps error code %i to %s', async (code, expected) => {
    setNavigator('geolocation', {
      getCurrentPosition: vi.fn<(ok: SuccessCb, fail: ErrorCb) => void>((_ok, fail) =>
        fail(geoError(code)),
      ),
    });
    const geo = useGeolocation();
    await geo.request();
    expect(geo.status.value).toBe(expected);
    expect(geo.position.value).toBeNull();
  });

  it('survives a browser that throws synchronously', async () => {
    setNavigator('geolocation', {
      getCurrentPosition: vi.fn<() => void>(() => {
        throw new Error('boom');
      }),
    });
    const geo = useGeolocation();
    await geo.request();
    expect(geo.status.value).toBe('unavailable');
  });

  it('shares one in-flight request between callers', async () => {
    setNavigator('geolocation', { getCurrentPosition: vi.fn<(ok: SuccessCb) => void>() });
    const spy = (
      navigator.geolocation as unknown as { getCurrentPosition: ReturnType<typeof vi.fn> }
    ).getCurrentPosition;
    let deliver: SuccessCb = () => {};
    spy.mockImplementation((ok: SuccessCb) => {
      deliver = ok;
    });
    const a = useGeolocation();
    const b = useGeolocation();

    const first = a.request();
    const second = b.request();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(a.status.value).toBe('granted-locating');

    deliver(FIX);
    await expect(first).resolves.toEqual(expect.objectContaining({ latitude: -1.2 }));
    await expect(second).resolves.toEqual(expect.objectContaining({ latitude: -1.2 }));
  });

  it('ignores a late answer after reset', async () => {
    let deliver: SuccessCb = () => {};
    setNavigator('geolocation', {
      getCurrentPosition: vi.fn<(ok: SuccessCb) => void>((ok) => {
        deliver = ok;
      }),
    });
    const geo = useGeolocation();
    const pending = geo.request();

    geo.reset();
    deliver(FIX);

    await expect(pending).resolves.toBeNull();
    expect(geo.position.value).toBeNull();
    expect(geo.status.value).toBe('idle');
  });

  it('ignores a late answer once the last consumer has gone, but keeps a held fix', async () => {
    let deliver: SuccessCb = () => {};
    setNavigator('geolocation', {
      getCurrentPosition: vi.fn<(ok: SuccessCb) => void>((ok) => {
        deliver = ok;
      }),
    });
    const { effectScope } = await import('vue');
    const scope = effectScope();
    const geo = scope.run(() => useGeolocation())!;
    const pending = geo.request();

    scope.stop();
    deliver(FIX);

    await expect(pending).resolves.toBeNull();
    expect(geo.position.value).toBeNull();
    expect(geo.status.value).toBe('idle');
  });

  it('reuses a held fix on the next entry without a new request', async () => {
    permission('granted');
    const getCurrentPosition = vi.fn<(ok: SuccessCb) => void>((ok) => ok(FIX));
    setNavigator('geolocation', { getCurrentPosition });

    await useGeolocation().init();
    const again = useGeolocation();
    await again.init();

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(again.status.value).toBe('located');
  });

  it('keeps the visitor chosen centre when the permission event says granted', async () => {
    const perm = permission('granted');
    const getCurrentPosition = vi.fn<(ok: SuccessCb) => void>((ok) => ok(FIX));
    setNavigator('geolocation', { getCurrentPosition });
    const geo = useGeolocation();
    await geo.init();

    geo.reset();
    perm.change('granted');

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(geo.status.value).toBe('idle');
  });
});
