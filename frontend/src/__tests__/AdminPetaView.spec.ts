import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import AdminPetaView from '../views/AdminPetaView.vue';
import { ADMIN_NAV, isAdminNavGroup } from '../config/adminNav';
import { stubResizableViewport, stubViewport } from './helpers/viewport';
import type { SpatialPointDTO } from '../types/maps';

const mapMocks = vi.hoisted(() => ({
  revealPoint: vi.fn<(id: string) => void>(),
  invalidateSize: vi.fn<() => void>(),
}));

// Leaflet cannot run in jsdom; the stand-in keeps InteractiveMap's public contract.
vi.mock('../components/maps/InteractiveMap.vue', () => ({
  default: {
    name: 'InteractiveMap',
    props: ['points', 'framePoints', 'selectedPointId', 'defaultCenter', 'defaultZoom'],
    emits: ['select-point'],
    setup(_props: unknown, { expose }: { expose: (api: object) => void }) {
      expose({ revealPoint: mapMocks.revealPoint, invalidateSize: mapMocks.invalidateSize });
    },
    template: `
      <div data-test="interactive-map" :data-count="points.length" :data-selected="selectedPointId">
        <button v-for="p in points" :key="p.id" type="button" :data-test="'map-pin-' + p.id"
          @click="$emit('select-point', p)">{{ p.name }}</button>
      </div>`,
  },
}));

vi.mock('../components/maps/LocationPicker.vue', () => ({
  default: {
    name: 'LocationPicker',
    props: ['modelValue', 'label', 'error', 'disabled', 'idPrefix', 'initialCenter'],
    emits: ['update:modelValue'],
    template: `
      <fieldset data-test="picker">
        <button type="button" data-test="picker-set" :disabled="disabled"
          @click="$emit('update:modelValue', { latitude: -1.25, longitude: 116.95 })">Atur</button>
      </fieldset>`,
  },
}));

function point(overrides: Partial<SpatialPointDTO> & Pick<SpatialPointDTO, 'id'>): SpatialPointDTO {
  return {
    name: `Titik ${overrides.id}`,
    type: 'ketua_rt',
    latitude: -1.22,
    longitude: 116.94,
    metadata: null,
    rts: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const rt1 = point({ id: 'rt1', name: 'Pos RT 01', rts: [1] });
const rt2 = point({ id: 'rt2', name: 'Pos RT 02', rts: [2] });
const bsu = point({ id: 'bsu', name: 'Bank Sampah Mawar', type: 'bank_sampah', rts: [30, 72] });
const balai = point({ id: 'balai', name: 'Balai Warga', type: 'fasilitas_umum', rts: [] });

interface Request {
  url: string;
  method: string;
  body: Record<string, unknown> | undefined;
}

let serverPoints: SpatialPointDTO[];
let requests: Request[];
let respond: (request: Request) => Response | undefined;
let listFails: boolean;

function jsonResponse(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as Response;
}
function failure(status: number, body: Record<string, unknown> = {}): Response {
  return { ok: false, status, json: async () => body } as Response;
}

function installFetch() {
  requests = [];
  respond = () => undefined;
  listFails = false;
  globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes('/api/auth/csrf-token')) return jsonResponse({ csrfToken: 'csrf' });
    const request: Request = {
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
    };
    requests.push(request);
    const custom = respond(request);
    if (custom) return custom;
    if (request.method === 'GET') {
      if (url.startsWith('/api/maps/points')) {
        return listFails
          ? failure(500, { error: 'boom' })
          : jsonResponse({ points: serverPoints, total: serverPoints.length });
      }
      if (url.startsWith('/api/maps/summary')) {
        return jsonResponse({
          totalPoints: serverPoints.length,
          pointsByType: { ketua_rt: 0, bank_sampah: 0, fasilitas_umum: 0 },
          totalRtLeaders: 100,
          rtLeadersWithCoordinates: 0,
          rtLeadersWithoutCoordinates: 100,
          rtLeadersWithIntegrityConflicts: 0,
        });
      }
      if (url.startsWith('/api/maps/rt-leaders')) {
        return jsonResponse({ leaders: [], total: 0, isSampleRoster: false });
      }
      if (url.startsWith('/api/settings/public')) return jsonResponse({});
    }
    return jsonResponse({ point: serverPoints[0] });
  });
}

function calls(method: string, prefix: string): Request[] {
  return requests.filter((r) => r.method === method && r.url.startsWith(prefix));
}

let mounted: VueWrapper[] = [];

/**
 * The editor and delete dialogs are teleported to `document.body` (a stubbed Teleport would
 * remount the form whenever the modal re-renders, which the real one does not), so every query
 * goes through the body rather than the mounted wrapper.
 */
function page(): DOMWrapper<HTMLElement> {
  return new DOMWrapper(document.body);
}

async function mountLoaded(): Promise<{ page: () => DOMWrapper<HTMLElement> }> {
  const wrapper = mount(AdminPetaView, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    attachTo: document.body,
  });
  mounted.push(wrapper);
  await flushPromises();
  return { page };
}

describe('AdminPetaView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    serverPoints = [rt1, rt2, bsu, balai];
    installFetch();
    stubViewport(true);
    mapMocks.revealPoint.mockClear();
    mapMocks.invalidateSize.mockClear();
  });
  afterEach(() => {
    mounted.forEach((wrapper) => wrapper.unmount());
    mounted = [];
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('overview', () => {
    it('lists every point with its type and RT coverage, and counts them', async () => {
      const { page: wrapper } = await mountLoaded();
      expect(wrapper().findAll('[data-test^="point-row-"]')).toHaveLength(4);
      const bsuRow = wrapper().find('[data-test="point-row-bsu"]');
      expect(bsuRow.text()).toContain('Bank Sampah · RT 30, 72');
      expect(wrapper().find('[data-test="point-row-balai"]').text()).toContain(
        'Fasilitas Umum · Belum ada RT',
      );
      expect(wrapper().find('[data-test="peta-counts"]').text()).toContain(
        '4 titik: 2 Ketua RT, 1 Bank Sampah, 1 Fasilitas Umum. 2 dari 100 RT',
      );
      expect(wrapper().find('[data-test="peta-result-count"]').text()).toBe(
        'Menampilkan semua 4 titik.',
      );
      expect(wrapper().text()).not.toMatch(/latitude|longitude|slug|JSON/i);
    });

    it('links to the Rukun Tetangga screen and offers no contact or sample-roster control', async () => {
      const { page: wrapper } = await mountLoaded();
      expect(wrapper().find('[data-test="peta-rt-link-note"]').text()).toContain('Rukun Tetangga');
      expect(wrapper().find('input[type="tel"]').exists()).toBe(false);
      expect(wrapper().text()).not.toMatch(/Tandai sebagai data/);
      expect(calls('PATCH', '/api/maps/rt-leaders')).toHaveLength(0);
    });

    it('searches by name and by RT number, and filters by real point type', async () => {
      const { page: wrapper } = await mountLoaded();
      await wrapper().find('[data-test="peta-search"]').setValue('mawar');
      expect(wrapper().findAll('[data-test^="point-row-"]').map((r) => r.attributes('data-test'))).toEqual(
        ['point-row-bsu'],
      );
      expect(wrapper().find('[data-test="peta-result-count"]').text()).toBe(
        'Menampilkan 1 dari 4 titik.',
      );

      await wrapper().find('[data-test="peta-search"]').setValue('72');
      expect(wrapper().findAll('[data-test^="point-row-"]')).toHaveLength(1);

      await wrapper().find('[data-test="peta-search"]').setValue('');
      await wrapper().find('[data-test="peta-type-filter"]').setValue('ketua_rt');
      expect(wrapper().findAll('[data-test^="point-row-"]')).toHaveLength(2);
      const options = wrapper().findAll('[data-test="peta-type-filter"] option').map((o) => o.text());
      expect(options).toEqual(['Semua jenis', 'Ketua RT', 'Bank Sampah', 'Fasilitas Umum']);
    });

    it('says so when nothing matches, and the filters can be cleared', async () => {
      const { page: wrapper } = await mountLoaded();
      await wrapper().find('[data-test="peta-search"]').setValue('zzz');
      expect(wrapper().find('[data-test="peta-no-match"]').text()).toContain(
        'Tidak ada titik yang cocok.',
      );
      await wrapper().find('[data-test="peta-clear-filters"]').trigger('click');
      expect(wrapper().findAll('[data-test^="point-row-"]')).toHaveLength(4);
      expect(wrapper().find('[data-test="peta-clear-filters"]').exists()).toBe(false);
    });

    it('shows an intentional empty state when there are no points', async () => {
      serverPoints = [];
      const { page: wrapper } = await mountLoaded();
      expect(wrapper().find('[data-test="peta-empty"]').text()).toContain('Belum ada titik peta.');
      expect(wrapper().find('[data-test="peta-add"]').exists()).toBe(true);
    });

    it('shows a plain load error with a retry that recovers', async () => {
      listFails = true;
      const { page: wrapper } = await mountLoaded();
      const error = wrapper().find('[data-test="peta-load-error"]');
      expect(error.exists()).toBe(true);
      expect(error.text()).not.toMatch(/500|boom/);
      expect(wrapper().find('[data-test="peta-empty"]').exists()).toBe(false);

      listFails = false;
      await wrapper().find('[data-test="alert-banner-retry"]').trigger('click');
      await flushPromises();
      expect(wrapper().find('[data-test="peta-load-error"]').exists()).toBe(false);
      expect(wrapper().findAll('[data-test^="point-row-"]')).toHaveLength(4);
    });
  });

  describe('coverage conflicts', () => {
    it('flags points whose RT coverage conflicts, with a corrective action, and can filter to them', async () => {
      serverPoints = [
        point({ id: 'a', name: 'Pos A', rts: [5] }),
        point({ id: 'b', name: 'Pos B', rts: [5] }),
        point({ id: 'c', name: 'Pos C', rts: [6, 7] }),
        rt2,
      ];
      const { page: wrapper } = await mountLoaded();
      expect(wrapper().find('[data-test="peta-issues"]').text()).toContain('3 titik perlu diperbaiki');
      expect(wrapper().find('[data-test="point-row-a"] [data-test="point-issue"]').text()).toContain(
        'RT 5 dipakai oleh lebih dari satu titik Ketua RT',
      );
      expect(wrapper().find('[data-test="point-row-c"] [data-test="point-issue"]').text()).toContain(
        'memilih 2 RT',
      );
      expect(wrapper().find('[data-test="point-row-rt2"] [data-test="point-issue"]').exists()).toBe(
        false,
      );

      await wrapper().find('[data-test="peta-only-issues"]').setValue(true);
      expect(wrapper().findAll('[data-test^="point-row-"]')).toHaveLength(3);
    });

    it('shows no conflict banner for a consistent set', async () => {
      const { page: wrapper } = await mountLoaded();
      expect(wrapper().find('[data-test="peta-issues"]').exists()).toBe(false);
    });
  });

  describe('layout', () => {
    it('shows list and map side by side on a wide screen, without a view switch', async () => {
      const { page: wrapper } = await mountLoaded();
      expect(wrapper().find('[data-test="interactive-map"]').exists()).toBe(true);
      expect(wrapper().find('[data-test="peta-list-section"]').isVisible()).toBe(true);
      expect(wrapper().find('[data-test="peta-view-map"]').exists()).toBe(false);
      expect(wrapper().find('[data-test="point-show-on-map"]').exists()).toBe(false);
    });

    it('switches between list and map on a narrow screen', async () => {
      stubViewport(false);
      const { page: wrapper } = await mountLoaded();
      expect(wrapper().find('[data-test="interactive-map"]').exists()).toBe(false);
      expect(wrapper().find('[data-test="peta-view-list"]').attributes('aria-pressed')).toBe('true');

      await wrapper().find('[data-test="peta-view-map"]').trigger('click');
      await flushPromises();
      expect(wrapper().find('[data-test="interactive-map"]').exists()).toBe(true);
      expect(wrapper().find('[data-test="peta-view-map"]').attributes('aria-pressed')).toBe('true');
      expect(wrapper().find('[data-test="peta-list-section"]').isVisible()).toBe(false);
      expect(mapMocks.invalidateSize).toHaveBeenCalled();

      await wrapper().find('[data-test="peta-view-list"]').trigger('click');
      expect(wrapper().find('[data-test="peta-list-section"]').isVisible()).toBe(true);
    });

    it('reacts when the window crosses the split breakpoint', async () => {
      const viewport = stubResizableViewport(false);
      const { page: wrapper } = await mountLoaded();
      expect(wrapper().find('[data-test="interactive-map"]').exists()).toBe(false);
      viewport.setMatches(true);
      await flushPromises();
      expect(wrapper().find('[data-test="interactive-map"]').exists()).toBe(true);
      expect(wrapper().find('[data-test="peta-view-map"]').exists()).toBe(false);
    });

    it('"Lihat di peta" switches to the map and reveals the point on a narrow screen', async () => {
      stubViewport(false);
      const { page: wrapper } = await mountLoaded();
      await wrapper().find('[data-test="point-row-bsu"] [data-test="point-show-on-map"]').trigger('click');
      await flushPromises();
      expect(wrapper().find('[data-test="interactive-map"]').attributes('data-selected')).toBe('bsu');
      expect(mapMocks.revealPoint).toHaveBeenCalledWith('bsu');
    });

    it('selecting a marker highlights its row and opens its details with the same actions', async () => {
      const { page: wrapper } = await mountLoaded();
      await wrapper().find('[data-test="map-pin-bsu"]').trigger('click');
      const row = wrapper().find('[data-test="point-row-bsu"]');
      expect(row.attributes('aria-current')).toBe('true');
      expect(wrapper().find('[data-test="peta-selected"]').text()).toContain('Bank Sampah Mawar');
      expect(wrapper().find('[data-test="selected-edit"]').exists()).toBe(true);
      expect(wrapper().find('[data-test="selected-delete"]').exists()).toBe(true);

      await wrapper().find('[data-test="point-row-rt2"] [data-test="point-select"]').trigger('click');
      expect(wrapper().find('[data-test="peta-selected"]').text()).toContain('Pos RT 02');
      expect(mapMocks.revealPoint).toHaveBeenCalledWith('rt2');
    });

    it('lists only the filtered points on the map while framing on all of them', async () => {
      const { page: wrapper } = await mountLoaded();
      await wrapper().find('[data-test="peta-type-filter"]').setValue('bank_sampah');
      expect(wrapper().find('[data-test="interactive-map"]').attributes('data-count')).toBe('1');
    });
  });

  describe('create and edit', () => {
    it('adds a point, then reloads points, summary and RT roster so public views update', async () => {
      const { page: wrapper } = await mountLoaded();
      requests.length = 0;
      respond = (request) =>
        request.method === 'POST'
          ? jsonResponse({ point: point({ id: 'new', name: 'Bank Sampah Melati', type: 'bank_sampah', rts: [10, 11] }) })
          : undefined;

      await wrapper().find('[data-test="peta-add"]').trigger('click');
      expect(wrapper().find('[role="dialog"]').exists()).toBe(true);
      await wrapper().find('[data-test="point-type-bank_sampah"] input').setValue(true);
      await wrapper().find('#point-name').setValue('Bank Sampah Melati');
      await wrapper().find('[data-test="picker-set"]').trigger('click');
      await wrapper().find('[data-test="rt-tile-10"] input').setValue(true);
      await wrapper().find('[data-test="rt-tile-11"] input').setValue(true);
      await wrapper().find('form').trigger('submit');
      await flushPromises();

      const post = calls('POST', '/api/maps/points')[0];
      expect(post?.body).toEqual({
        name: 'Bank Sampah Melati',
        type: 'bank_sampah',
        latitude: -1.25,
        longitude: 116.95,
        rts: [10, 11],
      });
      expect(wrapper().find('[role="dialog"]').exists()).toBe(false);
      expect(calls('GET', '/api/maps/points').length).toBeGreaterThanOrEqual(1);
      expect(calls('GET', '/api/maps/summary')).toHaveLength(1);
      expect(calls('GET', '/api/maps/rt-leaders')).toHaveLength(1);
      expect(wrapper().find('[data-test="peta-status"]').text()).toContain(
        'Titik “Bank Sampah Melati” ditambahkan.',
      );
    });

    it('edits a Ketua RT point with expectedRtNumber and reloads afterwards', async () => {
      const { page: wrapper } = await mountLoaded();
      requests.length = 0;
      await wrapper().find('[data-test="point-row-rt1"] [data-test="point-edit"]').trigger('click');
      expect(wrapper().find('[role="dialog"]').text()).toContain('Ubah titik peta');
      await wrapper().find('#point-name').setValue('Pos RT 01 Baru');
      await wrapper().find('form').trigger('submit');
      await flushPromises();

            const patch = calls('PATCH', '/api/maps/points/rt1')[0];
      expect(patch?.url).toBe('/api/maps/points/rt1?expectedRtNumber=1');
      expect(patch?.body).toEqual({ name: 'Pos RT 01 Baru' });
      expect(calls('GET', '/api/maps/summary')).toHaveLength(1);
      expect(calls('GET', '/api/maps/rt-leaders')).toHaveLength(1);
      expect(wrapper().find('[data-test="peta-status"]').text()).toContain('disimpan');
    });

    it('moves multi-RT Bank Sampah coverage without expectedRtNumber', async () => {
      const { page: wrapper } = await mountLoaded();
      requests.length = 0;
      await wrapper().find('[data-test="point-row-bsu"] [data-test="point-edit"]').trigger('click');
      await wrapper().find('[data-test="rt-tile-60"] input').setValue(true);
      await wrapper().find('form').trigger('submit');
      await flushPromises();
      const patch = calls('PATCH', '/api/maps/points/bsu')[0];
      expect(patch?.url).toBe('/api/maps/points/bsu');
      expect(patch?.body).toEqual({ rts: [30, 60, 72] });
    });

    it('keeps the draft on a stale save, reloads the points, and only reloads the draft on request', async () => {
      const { page: wrapper } = await mountLoaded();
      await wrapper().find('[data-test="point-row-rt1"] [data-test="point-edit"]').trigger('click');
      await wrapper().find('#point-name').setValue('Draf saya');
      respond = (request) =>
        request.method === 'PATCH' ? failure(409, { error: 'x', code: 'STALE_WRITE' }) : undefined;
      requests.length = 0;
      await wrapper().find('form').trigger('submit');
      await flushPromises();

      expect(wrapper().find('[role="dialog"]').exists()).toBe(true);
      expect((wrapper().find('#point-name').element as HTMLInputElement).value).toBe('Draf saya');
      expect(calls('GET', '/api/maps/points').length).toBeGreaterThanOrEqual(1);
      expect(wrapper().find('[data-test="point-save"]').attributes('disabled')).toBeDefined();

      // Someone else renamed the point; the explicit reload replaces the draft with their version.
      serverPoints = [point({ ...rt1, name: 'Nama dari orang lain' }), rt2, bsu, balai];
      respond = () => undefined;
      await wrapper().find('[data-test="point-reload"]').trigger('click');
      await flushPromises();
      expect((wrapper().find('#point-name').element as HTMLInputElement).value).toBe(
        'Nama dari orang lain',
      );
      expect(wrapper().find('[data-test="point-save"]').attributes('disabled')).toBeUndefined();
    });

    it('closes the editor with a notice when the reloaded point no longer exists', async () => {
      const { page: wrapper } = await mountLoaded();
      await wrapper().find('[data-test="point-row-rt1"] [data-test="point-edit"]').trigger('click');
      await wrapper().find('#point-name').setValue('Draf');
      respond = (request) => (request.method === 'PATCH' ? failure(404, { error: 'hilang' }) : undefined);
      await wrapper().find('form').trigger('submit');
      await flushPromises();
      expect(wrapper().find('[data-test="point-reload"]').exists()).toBe(true);

      serverPoints = [rt2, bsu, balai];
      respond = () => undefined;
      await wrapper().find('[data-test="point-reload"]').trigger('click');
      await flushPromises();
      expect(wrapper().find('[role="dialog"]').exists()).toBe(false);
      expect(wrapper().find('[data-test="peta-status"]').text()).toContain(
        'sudah dihapus oleh orang lain',
      );
      expect(wrapper().find('[data-test="point-row-rt1"]').exists()).toBe(false);
    });

    it('asks before discarding a changed draft, and keeps it on "Tetap di sini"', async () => {
      const { page: wrapper } = await mountLoaded();
      await wrapper().find('[data-test="peta-add"]').trigger('click');
      await wrapper().find('#point-name').setValue('Draf');
      await wrapper().find('[data-test="point-cancel"]').trigger('click');
      expect(wrapper().find('[data-test="discard-dialog"]').exists()).toBe(true);

      await wrapper().find('[data-test="discard-keep"]').trigger('click');
      expect(wrapper().find('[data-test="discard-dialog"]').exists()).toBe(false);
      expect((wrapper().find('#point-name').element as HTMLInputElement).value).toBe('Draf');

      await wrapper().find('[data-test="point-cancel"]').trigger('click');
      await wrapper().find('[data-test="discard-confirm"]').trigger('click');
      expect(wrapper().find('[role="dialog"]').exists()).toBe(false);
    });

    it('closes an untouched form without a prompt', async () => {
      const { page: wrapper } = await mountLoaded();
      await wrapper().find('[data-test="peta-add"]').trigger('click');
      await wrapper().find('[data-test="point-cancel"]').trigger('click');
      expect(wrapper().find('[role="dialog"]').exists()).toBe(false);
      expect(calls('POST', '/api/maps/points')).toHaveLength(0);
    });
  });

  describe('delete', () => {
    it('names the point, sends expectedRtNumber for a Ketua RT point, and reloads afterwards', async () => {
      const { page: wrapper } = await mountLoaded();
      await wrapper().find('[data-test="point-row-rt1"] [data-test="point-delete"]').trigger('click');
      const dialog = wrapper().find('[data-test="delete-dialog"]');
      expect(dialog.text()).toContain('Hapus titik “Pos RT 01” (Ketua RT)?');
      expect(dialog.text()).toContain('Nama dan telepon Ketua RT tidak ikut terhapus');
      expect(dialog.text()).toContain('tidak bisa dibatalkan');
      expect(calls('DELETE', '/api/maps/points')).toHaveLength(0);

      serverPoints = [rt2, bsu, balai];
      requests.length = 0;
      await wrapper().find('[data-test="delete-confirm"]').trigger('click');
      await flushPromises();

      expect(calls('DELETE', '/api/maps/points')[0]?.url).toBe(
        '/api/maps/points/rt1?expectedRtNumber=1',
      );
      expect(wrapper().find('[data-test="delete-dialog"]').exists()).toBe(false);
      expect(wrapper().find('[data-test="point-row-rt1"]').exists()).toBe(false);
      expect(calls('GET', '/api/maps/summary')).toHaveLength(1);
      expect(calls('GET', '/api/maps/rt-leaders')).toHaveLength(1);
      expect(wrapper().find('[data-test="peta-status"]').text()).toContain('Titik “Pos RT 01” dihapus.');
    });

    it('deletes a Bank Sampah point without expectedRtNumber and explains the RTs it releases', async () => {
      const { page: wrapper } = await mountLoaded();
      await wrapper().find('[data-test="point-row-bsu"] [data-test="point-delete"]').trigger('click');
      expect(wrapper().find('[data-test="delete-dialog"]').text()).toContain('RT 30, 72 tidak lagi terhubung');
      await wrapper().find('[data-test="delete-confirm"]').trigger('click');
      await flushPromises();
      expect(calls('DELETE', '/api/maps/points')[0]?.url).toBe('/api/maps/points/bsu');
    });

    it('does nothing when the confirmation is cancelled', async () => {
      const { page: wrapper } = await mountLoaded();
      await wrapper().find('[data-test="point-row-rt1"] [data-test="point-delete"]').trigger('click');
      await wrapper().find('[data-test="delete-cancel"]').trigger('click');
      expect(wrapper().find('[data-test="delete-dialog"]').exists()).toBe(false);
      expect(calls('DELETE', '/api/maps/points')).toHaveLength(0);
    });

    it('treats an already-deleted point as done and refreshes', async () => {
      const { page: wrapper } = await mountLoaded();
      await wrapper().find('[data-test="point-row-rt1"] [data-test="point-delete"]').trigger('click');
      respond = (request) => (request.method === 'DELETE' ? failure(404, { error: 'tidak ada' }) : undefined);
      serverPoints = [rt2, bsu, balai];
      await wrapper().find('[data-test="delete-confirm"]').trigger('click');
      await flushPromises();
      expect(wrapper().find('[data-test="delete-dialog"]').exists()).toBe(false);
      expect(wrapper().find('[data-test="peta-status"]').text()).toContain('sudah tidak ada');
      expect(wrapper().find('[data-test="point-row-rt1"]').exists()).toBe(false);
    });

    it('does not delete a Ketua RT point whose ownership changed, and says why', async () => {
      const { page: wrapper } = await mountLoaded();
      await wrapper().find('[data-test="point-row-rt1"] [data-test="point-delete"]').trigger('click');
      respond = (request) =>
        request.method === 'DELETE' ? failure(409, { error: 'x', code: 'STALE_WRITE' }) : undefined;
      requests.length = 0;
      await wrapper().find('[data-test="delete-confirm"]').trigger('click');
      await flushPromises();
      expect(wrapper().find('[data-test="delete-dialog"]').exists()).toBe(false);
      const notice = wrapper().find('[data-test="peta-page-error"]');
      expect(notice.text()).toContain('Titik “Pos RT 01” baru saja diubah oleh orang lain');
      expect(notice.text()).not.toMatch(/409|STALE/);
      expect(calls('GET', '/api/maps/points').length).toBeGreaterThanOrEqual(1);
      expect(wrapper().find('[data-test="point-row-rt1"]').exists()).toBe(true);
    });

    it('keeps the dialog open with a plain message when the server fails', async () => {
      const { page: wrapper } = await mountLoaded();
      await wrapper().find('[data-test="point-row-rt1"] [data-test="point-delete"]').trigger('click');
      respond = (request) => (request.method === 'DELETE' ? failure(500, { error: 'ER_ROW' }) : undefined);
      await wrapper().find('[data-test="delete-confirm"]').trigger('click');
      await flushPromises();
      const error = wrapper().find('[data-test="delete-error"]');
      expect(error.text()).toContain('Gagal menghapus titik.');
      expect(error.text()).not.toMatch(/ER_ROW|500/);
      expect(wrapper().find('[data-test="point-row-rt1"]').exists()).toBe(true);
    });
  });

  describe('navigation entry', () => {
    it('no longer carries the "Segera hadir" badge on Peta', () => {
      const peta = ADMIN_NAV.filter((entry) => !isAdminNavGroup(entry)).find(
        (entry) => entry.dataTest === 'nav-peta',
      );
      expect(peta).toBeDefined();
      expect(peta && 'badge' in peta ? peta.badge : undefined).toBeUndefined();
    });
  });
});
