import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import router from '../router/index';
import { ADMIN_NAV, isAdminNavGroup } from '../config/adminNav';
import { DEFAULT_PUBLIC_SETTINGS } from '../stores/settings.store';
import { useAuthStore } from '../stores/auth';
import { useWeatherStore } from '../stores/weather.store';
import { leafletState, resetLeafletMock } from './leafletMock';

vi.mock('leaflet', async () => (await import('./leafletMock')).createLeafletMock());

const PATH = '/admin/sistem/konfigurasi';

const STORED_SETTINGS = {
  ...DEFAULT_PUBLIC_SETTINGS,
  defaultCoordinates: { lat: -1.3, lon: 117.0, zoom: 15 },
};

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

interface Backend {
  weatherConfig: Record<string, unknown>;
  retention: { info: number; warning: number; critical: number };
  weatherStale: boolean;
  weatherFails: boolean;
  weatherConfigGetStatus: number;
  patchPublic: () => Response;
  patchWeather: () => Response;
  patchRetention: () => Response;
}

let backend: Backend;
let calls: Array<{ method: string; url: string; body: Record<string, unknown> | null }>;

function installFetch(): void {
  calls = [];
  globalThis.fetch = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url === '/api/auth/csrf-token') return json({ csrfToken: 'csrf-1' });
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ method, url, body });
    if (url === '/api/settings/public') {
      return method === 'PATCH' ? backend.patchPublic() : json({ settings: STORED_SETTINGS });
    }
    if (url === '/api/settings/weather-config') {
      if (method === 'PATCH') return backend.patchWeather();
      return backend.weatherConfigGetStatus === 200
        ? json({ settings: backend.weatherConfig })
        : json({ error: 'x' }, backend.weatherConfigGetStatus);
    }
    if (url === '/api/settings/audit-retention') {
      return method === 'PATCH' ? backend.patchRetention() : json({ retention: backend.retention });
    }
    if (url === '/api/weather') {
      if (backend.weatherFails) return json({ error: 'x' }, 502);
      return json({
        location: { desa: 'Manggar', lat: -1.2, lon: 116.9 },
        forecast: [],
        fetchedAt: '2026-11-12T06:05:00.000Z',
        stale: backend.weatherStale,
      });
    }
    // Any other screen the shell navigates to (dashboard, lists) is not under test here.
    return json({});
  }) as typeof fetch;
}

const STORED_WEATHER = {
  bmkgBaseUrl: 'https://api.bmkg.go.id/publik/prakiraan-cuaca',
  cacheTtlMs: 3_600_000,
  staleRetryMs: 420_000,
  fetchTimeoutMs: 12_000,
};

function resetBackend(): void {
  backend = {
    weatherConfig: { ...STORED_WEATHER },
    retention: { info: 0, warning: 0, critical: 0 },
    weatherStale: false,
    weatherFails: false,
    weatherConfigGetStatus: 200,
    patchPublic: () => json({ message: 'ok', settings: STORED_SETTINGS }),
    patchWeather: () =>
      json({ message: 'ok', settings: { ...STORED_WEATHER, cacheTtlMs: 1_800_000 } }),
    patchRetention: () =>
      json({ message: 'ok', retention: { info: 30, warning: 60, critical: 0 } }),
  };
}

let pinia: ReturnType<typeof createPinia>;

function signIn(role: 'admin' | 'editor'): void {
  pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore(pinia).setAuth({ id: 'u-1', email: `${role}@manggar.go.id`, role }, 'token');
}

async function mountPage(): Promise<VueWrapper> {
  await router.push(PATH);
  await router.isReady();
  const wrapper = mount(
    { template: '<router-view />' },
    { global: { plugins: [pinia, router] }, attachTo: document.body },
  );
  await flushPromises();
  return wrapper;
}

const q = <T extends Element = HTMLElement>(selector: string): T | null =>
  document.body.querySelector<T>(selector);

async function type(selector: string, value: string): Promise<void> {
  const el = q<HTMLInputElement>(selector)!;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await flushPromises();
}

async function click(selector: string): Promise<void> {
  q<HTMLElement>(selector)!.click();
  await flushPromises();
}

function patches(url: string): Array<Record<string, unknown> | null> {
  return calls.filter((c) => c.method === 'PATCH' && c.url === url).map((c) => c.body);
}

describe('AdminKonfigurasiSistemView', () => {
  beforeEach(() => {
    resetLeafletMock();
    resetBackend();
    document.body.innerHTML = '';
    signIn('admin');
    useWeatherStore().resetState();
    installFetch();
    window.HTMLElement.prototype.scrollIntoView = vi.fn<() => void>();
  });

  it("shows the four sections in order under h2 headings, under the shell's single h1", async () => {
    const wrapper = await mountPage();

    const headings = [...document.body.querySelectorAll('section > div > h2')].map((h) =>
      h.textContent?.trim(),
    );
    expect(headings).toEqual([
      'Identitas dan kontak portal',
      'Tampilan awal peta',
      'Cuaca',
      'Retensi log',
    ]);
    // The page title is the shell's single <h1>; this view adds none.
    expect(document.body.querySelectorAll('h1')).toHaveLength(1);
    expect(document.body.querySelector('h1')?.textContent).toContain('Konfigurasi sistem');
    wrapper.unmount();
  });

  it('shows no raw technical fields: no milliseconds, URLs, codes, JSON or coordinates', async () => {
    const wrapper = await mountPage();
    const text = document.body.textContent ?? '';

    expect(text).not.toMatch(/\bms\b|milidetik|TTL|https?:\/\/|api\.bmkg|adm4|json|\bkey\b/i);
    expect(text).not.toMatch(/latitude|longitude|lintang|bujur|\bzoom\b/i);
    expect(text).not.toMatch(/critical|warning|severity|Keep Forever|SPEC/);
    expect(document.body.querySelector('textarea[name*="json" i]')).toBeNull();
    // Only the contact address is a textarea; no number input carries milliseconds or a zoom level.
    for (const input of document.body.querySelectorAll<HTMLInputElement>('input[type="number"]')) {
      expect(input.id).toMatch(/^retensi-(info|warning|critical)-hari$/);
    }
    wrapper.unmount();
  });

  describe('portal identity and contact', () => {
    it('saves only the identity and contact fields, then confirms in words', async () => {
      const wrapper = await mountPage();

      await type('#identitas-tagline', 'Tagline baru');
      const form = q<HTMLFormElement>('#identitas-tagline')!.closest('form')!;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await flushPromises();

      const sent = patches('/api/settings/public');
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ tagline: 'Tagline baru' });
      expect(sent[0]).not.toHaveProperty('defaultCoordinates');
      expect(q('[data-test="portal-saved"]')?.textContent).toContain(
        'Identitas dan kontak portal berhasil disimpan.',
      );
      wrapper.unmount();
    });

    it('keeps the draft and says so in plain words when the save fails, and the map part is untouched', async () => {
      backend.patchPublic = () => json({ error: 'ER_LOCK_DEADLOCK db.query' }, 500);
      const wrapper = await mountPage();

      await type('#identitas-tagline', 'Tagline gagal');
      q<HTMLFormElement>('#identitas-tagline')!
        .closest('form')!
        .dispatchEvent(new Event('submit', { cancelable: true }));
      await flushPromises();

      const text = q('#identitas')!.textContent ?? '';
      expect(text).toContain('Gagal menyimpan pengaturan portal.');
      expect(text).not.toMatch(/ER_LOCK|500|db\.query/);
      expect(q<HTMLInputElement>('#identitas-tagline')!.value).toBe('Tagline gagal');
      expect(q('[data-test="portal-saved"]')).toBeNull();
      wrapper.unmount();
    });
  });

  describe('starting map view', () => {
    it('opens on the stored view and saves only the new view', async () => {
      const wrapper = await mountPage();
      expect(leafletState.center).toEqual({ lat: -1.3, lng: 117.0 });
      expect(leafletState.zoom).toBe(15);

      leafletState.center = { lat: -1.2411, lng: 116.9702 };
      leafletState.zoom = 16;
      leafletState.handlers.moveend?.();
      await flushPromises();

      q<HTMLFormElement>('#peta')!
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { cancelable: true }));
      await flushPromises();

      const sent = patches('/api/settings/public');
      expect(sent).toEqual([{ defaultCoordinates: { lat: -1.2411, lon: 116.9702, zoom: 16 } }]);
      wrapper.unmount();
    });

    it('never shows the form built on defaults when the stored settings could not load', async () => {
      const original = globalThis.fetch;
      globalThis.fetch = vi.fn<typeof fetch>(async (input, init) => {
        if (String(input) === '/api/settings/public' && (init?.method ?? 'GET') === 'GET') {
          return json({ error: 'x' }, 500);
        }
        return original(input, init);
      }) as typeof fetch;
      const wrapper = await mountPage();

      expect(q('#identitas [data-test="portal-load-error"]')).not.toBeNull();
      expect(q('#peta [data-test="portal-load-error"]')).not.toBeNull();
      expect(q('#identitas-appName')).toBeNull();
      wrapper.unmount();
    });
  });

  describe('weather', () => {
    it('shows the fixed area read-only and the three named refresh choices with the stored one selected', async () => {
      const wrapper = await mountPage();

      expect(q('[data-test="weather-area"]')?.textContent?.trim()).toBe('Manggar');
      const radios = [
        ...document.body.querySelectorAll<HTMLInputElement>('input[name="cuaca-penyegaran"]'),
      ];
      expect(
        radios.map((r) => document.querySelector(`label[for="${r.id}"]`)?.textContent?.trim()),
      ).toEqual(['Setiap 30 menit', 'Setiap 1 jam (standar)', 'Setiap 2 jam']);
      expect(radios.map((r) => r.checked)).toEqual([false, true, false]);
      expect(q('#cuaca select, #cuaca input[type="text"]')).toBeNull();
      expect(q('#cuaca')!.textContent).toContain('bukan seberapa sering BMKG menerbitkan');
      wrapper.unmount();
    });

    it('shows last successful update in WITA and a plain service status', async () => {
      const wrapper = await mountPage();

      expect(q('[data-test="weather-status"]')?.textContent).toContain(
        'Layanan cuaca berjalan normal.',
      );
      expect(q('[data-test="weather-last"]')?.textContent).toContain('12 November 2026');
      expect(q('[data-test="weather-last"]')?.textContent).toContain('WITA');
      wrapper.unmount();
    });

    it('explains an unreachable BMKG service in words when the shown data is stale', async () => {
      backend.weatherStale = true;
      const wrapper = await mountPage();

      const status = q('[data-test="weather-status"]')!.textContent!;
      expect(status).toContain('sedang tidak dapat dihubungi');
      expect(status).not.toMatch(/stale|502|HTTP/i);
      wrapper.unmount();
    });

    it('says plainly that the status could not be checked and offers another try', async () => {
      backend.weatherFails = true;
      const wrapper = await mountPage();

      expect(q('[data-test="weather-status"]')?.textContent).toContain('Gagal memuat data cuaca');
      expect(q('[data-test="weather-status-retry"]')).not.toBeNull();
      wrapper.unmount();
    });

    it('saves a chosen preset by sending only the refresh interval', async () => {
      const wrapper = await mountPage();
      expect(q<HTMLButtonElement>('[data-test="weather-save"]')!.disabled).toBe(true);

      await click('#cuaca-30m');
      expect(q<HTMLButtonElement>('[data-test="weather-save"]')!.disabled).toBe(false);
      await click('[data-test="weather-save"]');

      expect(patches('/api/settings/weather-config')).toEqual([{ cacheTtlMs: 1_800_000 }]);
      expect(q('[data-test="weather-saved"]')?.textContent).toContain('Setiap 30 menit');
      expect(q<HTMLInputElement>('#cuaca-30m')!.checked).toBe(true);
      wrapper.unmount();
    });

    it('shows a stored non-preset value as "Pengaturan khusus" and does not overwrite it on load', async () => {
      backend.weatherConfig = { ...STORED_WEATHER, cacheTtlMs: 2_700_000 };
      const wrapper = await mountPage();

      expect(q('[data-test="weather-custom-label"]')?.textContent?.trim()).toBe(
        'Pengaturan khusus (45 menit)',
      );
      expect(q<HTMLInputElement>('#cuaca-khusus')!.checked).toBe(true);
      expect(document.body.querySelectorAll<HTMLInputElement>('#cuaca input:checked')).toHaveLength(
        1,
      );
      expect(q<HTMLButtonElement>('[data-test="weather-save"]')!.disabled).toBe(true);
      expect(patches('/api/settings/weather-config')).toHaveLength(0);

      // Picking a named choice replaces it; picking the custom one again is no change.
      await click('#cuaca-2h');
      expect(q<HTMLButtonElement>('[data-test="weather-save"]')!.disabled).toBe(false);
      await click('#cuaca-khusus');
      expect(q<HTMLButtonElement>('[data-test="weather-save"]')!.disabled).toBe(true);
      wrapper.unmount();
    });

    it('keeps the choice and shows plain wording when the save fails', async () => {
      backend.patchWeather = () => json({ error: 'Cache TTL minimal 1 menit (60000 ms)' }, 400);
      const wrapper = await mountPage();

      await click('#cuaca-2h');
      await click('[data-test="weather-save"]');

      const message = q('[data-test="weather-save-error"]')!.textContent!;
      expect(message).toContain('Gagal menyimpan pengaturan cuaca.');
      expect(message).not.toMatch(/TTL|ms\b|60000/);
      expect(q<HTMLInputElement>('#cuaca-2h')!.checked).toBe(true);
      wrapper.unmount();
    });

    it('offers a retry when the stored weather settings cannot be loaded', async () => {
      backend.weatherConfigGetStatus = 500;
      const wrapper = await mountPage();

      expect(q('[data-test="weather-config-error"]')?.textContent).toContain('Terjadi kendala');
      expect(q('input[name="cuaca-penyegaran"]')).toBeNull();
      wrapper.unmount();
    });
  });

  describe('log retention', () => {
    it('loads keep-forever as a ticked box with no number, and a limit as days', async () => {
      backend.retention = { info: 30, warning: 365, critical: 0 };
      const wrapper = await mountPage();

      expect(q<HTMLInputElement>('#retensi-critical-selamanya')!.checked).toBe(true);
      expect(q<HTMLInputElement>('#retensi-critical-hari')!.disabled).toBe(true);
      expect(q<HTMLInputElement>('#retensi-info-selamanya')!.checked).toBe(false);
      expect(q<HTMLInputElement>('#retensi-info-hari')!.value).toBe('30');
      expect(q('[data-test="retention-summary-info"]')?.textContent?.trim()).toBe(
        '1 Bulan (30 hari)',
      );
      expect(q('[data-test="retention-summary-critical"]')?.textContent?.trim()).toBe('Selamanya');
      wrapper.unmount();
    });

    it('explains the unacknowledged-critical protection and the ordering rule', async () => {
      const wrapper = await mountPage();
      const text = q('#retensi-log')!.textContent!;

      expect(text).toContain('tidak pernah dihapus');
      expect(text).toContain('Kritis paling sedikit selama Peringatan');
      wrapper.unmount();
    });

    it('blocks saving while the order rule is broken and says why in words', async () => {
      backend.retention = { info: 30, warning: 60, critical: 90 };
      const wrapper = await mountPage();

      await type('#retensi-info-hari', '120');

      expect(q('[data-test="retention-validation"]')?.textContent).toContain(
        'Log Kritis harus disimpan paling sedikit selama log Peringatan',
      );
      expect(q<HTMLButtonElement>('[data-test="retention-save"]')!.disabled).toBe(true);
      wrapper.unmount();
    });

    it('treats an empty or zero-day limit as invalid instead of silently meaning forever', async () => {
      backend.retention = { info: 30, warning: 60, critical: 90 };
      const wrapper = await mountPage();

      await type('#retensi-info-hari', '0');
      expect(q('[data-test="retention-validation"]')).not.toBeNull();
      expect(q<HTMLButtonElement>('[data-test="retention-save"]')!.disabled).toBe(true);

      await type('#retensi-info-hari', '');
      expect(q('[data-test="retention-validation"]')).not.toBeNull();
      wrapper.unmount();
    });

    it('saves days and keep-forever as the stored numbers and confirms', async () => {
      backend.retention = { info: 0, warning: 0, critical: 0 };
      const wrapper = await mountPage();

      // Order rule with forever: info and warning must be limited before critical stays forever.
      await click('#retensi-info-selamanya');
      await type('#retensi-info-hari', '30');
      await click('#retensi-warning-selamanya');
      await type('#retensi-warning-hari', '60');
      expect(q<HTMLButtonElement>('[data-test="retention-save"]')!.disabled).toBe(false);
      await click('[data-test="retention-save"]');

      expect(patches('/api/settings/audit-retention')).toEqual([
        { info: 30, warning: 60, critical: 0 },
      ]);
      expect(q('[data-test="retention-saved"]')?.textContent).toContain('berhasil disimpan');
      wrapper.unmount();
    });

    it('keeps the entries and shows approved wording when the server refuses the save', async () => {
      backend.retention = { info: 0, warning: 0, critical: 0 };
      backend.patchRetention = () =>
        json({ error: 'Retensi critical harus >= warning >= info.' }, 400);
      const wrapper = await mountPage();

      await click('#retensi-info-selamanya');
      await type('#retensi-info-hari', '30');
      await click('[data-test="retention-save"]');

      const message = q('[data-test="retention-save-error"]')!.textContent!;
      expect(message).toContain('Gagal menyimpan masa simpan log.');
      expect(message).not.toMatch(/critical|warning|>=/);
      expect(q<HTMLInputElement>('#retensi-info-hari')!.value).toBe('30');
      wrapper.unmount();
    });

    it('offers a retry when the stored retention cannot be loaded', async () => {
      const original = globalThis.fetch;
      globalThis.fetch = vi.fn<typeof fetch>(async (input, init) => {
        if (String(input) === '/api/settings/audit-retention') return json({ error: 'x' }, 500);
        return original(input, init);
      }) as typeof fetch;
      const wrapper = await mountPage();

      expect(q('[data-test="retention-load-error"]')?.textContent).toContain(
        'Gagal memuat masa simpan log',
      );
      expect(q('[data-test="retention-retry"]')).not.toBeNull();
      expect(q('#retensi-info-hari')).toBeNull();
      wrapper.unmount();
    });
  });

  describe('section links and old bookmarks', () => {
    it('jumps to a section and moves focus to its heading', async () => {
      const wrapper = await mountPage();

      await click('[data-test="jump-cuaca"]');

      expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
      expect(document.activeElement?.id).toBe('cuaca-judul');
      wrapper.unmount();
    });

    it('scrolls to the retention section when opened through the old retention URL', async () => {
      await router.push('/admin');
      await router.push('/settings/audit-retention');
      await router.isReady();
      const wrapper = mount(
        { template: '<router-view />' },
        { global: { plugins: [pinia, router] }, attachTo: document.body },
      );
      await flushPromises();

      expect(router.currentRoute.value.path).toBe(PATH);
      expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
      expect(document.activeElement?.id).toBe('retensi-log-judul');
      wrapper.unmount();
    });
  });

  describe('unsaved changes', () => {
    it('asks before leaving with an unsaved edit, and "Tetap di sini" keeps the draft', async () => {
      const wrapper = await mountPage();
      await type('#identitas-tagline', 'Belum disimpan');

      const nav = router.push('/admin');
      await flushPromises();
      expect(q('[data-test="leave-prompt"]')).not.toBeNull();
      expect(router.currentRoute.value.path).toBe(PATH);

      await click('[data-test="leave-stay"]');
      await nav;
      expect(router.currentRoute.value.path).toBe(PATH);
      expect(q<HTMLInputElement>('#identitas-tagline')!.value).toBe('Belum disimpan');

      const nav2 = router.push('/admin');
      await flushPromises();
      await click('[data-test="leave-confirm"]');
      await nav2;
      expect(router.currentRoute.value.path).toBe('/admin');
      wrapper.unmount();
    });

    it('does not ask when nothing changed, and an edit in any section counts', async () => {
      let wrapper = await mountPage();
      await router.push('/admin');
      expect(router.currentRoute.value.path).toBe('/admin');
      wrapper.unmount();

      wrapper = await mountPage();
      await click('#cuaca-2h');
      const nav = router.push('/admin');
      await flushPromises();
      expect(q('[data-test="leave-prompt"]')).not.toBeNull();
      await click('[data-test="leave-confirm"]');
      await nav;
      wrapper.unmount();
    });

    it('warns the browser about closing the tab only while something is unsaved', async () => {
      const wrapper = await mountPage();

      const clean = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(clean);
      expect(clean.defaultPrevented).toBe(false);

      await type('#identitas-tagline', 'Belum disimpan');
      const dirty = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(dirty);
      expect(dirty.defaultPrevented).toBe(true);
      wrapper.unmount();
    });

    it('"Batalkan perubahan" restores the stored values and clears the unsaved state', async () => {
      const wrapper = await mountPage();
      await type('#identitas-tagline', 'Belum disimpan');

      const discard = [
        ...document.body.querySelectorAll<HTMLButtonElement>('#identitas button'),
      ].find((b) => b.textContent?.trim() === 'Batalkan perubahan')!;
      discard.click();
      await flushPromises();

      expect(q<HTMLInputElement>('#identitas-tagline')!.value).toBe(STORED_SETTINGS.tagline);
      const clean = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(clean);
      expect(clean.defaultPrevented).toBe(false);
      wrapper.unmount();
    });
  });

  describe('access', () => {
    it('is Admin-only: an Editor is sent home and none of the settings calls are made', async () => {
      signIn('editor');
      installFetch();
      await router.push('/admin');
      await router.push(PATH);

      expect(router.currentRoute.value.name).toBe('home');
      const settingsCalls = calls.filter(
        (c) => c.url.startsWith('/api/settings/') && c.url !== '/api/settings/public',
      );
      expect(settingsCalls).toHaveLength(0);
      expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
    });

    it('lists the page in the Sistem group for Admin only, without a "Segera hadir" badge', () => {
      const link = ADMIN_NAV.filter(isAdminNavGroup)
        .flatMap((group) => group.items)
        .find((item) => item.to === PATH)!;

      expect(link.roles).toEqual(['admin']);
      expect(link.badge).toBeUndefined();
    });
  });
});
