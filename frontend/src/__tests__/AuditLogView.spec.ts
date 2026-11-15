import { describe, it, expect, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import AuditLogView from '../views/AuditLogView.vue';
import { useAuthStore } from '../stores/auth';
import { useAuditStore } from '../stores/audit.store';

const CRITICAL_OPEN_LOG = {
  id: 'log-critical-open',
  action: 'user.role_changed',
  outcome: 'success',
  severity: 'critical',
  acknowledgedAt: null,
  acknowledgedById: null,
  actorId: 'admin-1',
  actorEmail: 'admin@example.com',
  actorRole: 'admin',
  targetType: 'user',
  targetId: 'u-2',
  targetLabel: 'user2@example.com',
  metadata: { fromRoleName: 'admin', toRoleName: 'editor' },
  ipAddress: '127.0.0.1',
  userAgent: 'Mozilla/5.0',
  createdAt: '2026-10-19T01:02:03.000Z',
};

const INFO_LOG = {
  ...CRITICAL_OPEN_LOG,
  id: 'log-info',
  action: 'auth.login',
  severity: 'info',
};

const ACKNOWLEDGED_LOG = {
  ...CRITICAL_OPEN_LOG,
  id: 'log-acknowledged',
  acknowledgedAt: '2026-10-19T02:00:00.000Z',
};

function mockBackend(logs: unknown[]) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('csrf-token')) {
      return { ok: true, json: async () => ({ csrfToken: 'mock-csrf' }) } as Response;
    }
    if (url.includes('/acknowledge')) {
      return {
        ok: true,
        json: async () => ({
          message: 'Audit log berhasil di-acknowledge.',
          log: { ...CRITICAL_OPEN_LOG, acknowledgedAt: '2026-10-19T02:00:00.000Z' },
        }),
      } as Response;
    }
    if (url.includes('/summary')) {
      return {
        ok: true,
        json: async () => ({
          since: '2026-09-19T00:00:00.000Z',
          counts: { info: 1, warning: 0, critical: 2 },
          openCritical: 1,
        }),
      } as Response;
    }
    return {
      ok: true,
      json: async () => ({ logs, total: logs.length, page: 1, pageSize: 50 }),
    } as Response;
  });
  globalThis.fetch = fetchMock;
  return fetchMock;
}

async function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);

  const authStore = useAuthStore();
  authStore.setAuth({ id: 'admin-1', email: 'admin@example.com', role: 'admin' }, 'mock-token');

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/audit-logs', component: AuditLogView }],
  });
  await router.push('/audit-logs');
  await router.isReady();

  const wrapper = mount(AuditLogView, { global: { plugins: [pinia, router] } });
  // let onMounted fetches resolve
  await vi.waitFor(() => expect(wrapper.find('tbody').text()).toContain('Ganti role user'));
  return wrapper;
}

describe('AuditLogView', () => {
  it('renders a semantic table with caption and scoped column headers', async () => {
    mockBackend([CRITICAL_OPEN_LOG, INFO_LOG]);
    const wrapper = await mountView();

    const table = wrapper.find('table');
    expect(table.exists()).toBe(true);
    expect(table.find('caption').exists()).toBe(true);

    const headers = table.findAll('th');
    expect(headers.map((th) => th.text())).toEqual([
      'Waktu',
      'Kejadian',
      'Nama',
      'Role',
      'Target',
      'Tingkat Keparahan',
      'Aksi',
    ]);
    for (const th of headers) {
      expect(th.attributes('scope')).toBe('col');
    }
  });

  it('labels events in Indonesian, including the role change detail from metadata', async () => {
    mockBackend([CRITICAL_OPEN_LOG, INFO_LOG]);
    const wrapper = await mountView();

    const body = wrapper.find('tbody').text();
    expect(body).toContain('Ganti role user (admin to editor)');
    expect(body).toContain('Berhasil login');
  });

  it('shows the summary stat cards from the summary endpoint', async () => {
    mockBackend([CRITICAL_OPEN_LOG]);
    const wrapper = await mountView();

    const section = wrapper.find('section[aria-label="Ringkasan log audit"]');
    expect(section.exists()).toBe(true);
    expect(section.text()).toContain('Total Log');
    // info:1 + critical:2
    expect(section.text()).toContain('3');
    expect(section.text()).toContain('Kejadian Kritis');
    expect(section.text()).toContain('Butuh Review');
    expect(section.text()).toContain('Aksi Admin');
    expect(section.text()).toContain('24 Jam Terakhir');
  });

  it('renders the acknowledge button only for open critical rows', async () => {
    mockBackend([CRITICAL_OPEN_LOG, INFO_LOG, ACKNOWLEDGED_LOG]);
    const wrapper = await mountView();

    const acknowledgeButtons = wrapper
      .findAll('tbody tr')
      .filter((tr) => tr.text().includes('Tandai Telah Dibaca'));
    expect(acknowledgeButtons).toHaveLength(1);
    expect(acknowledgeButtons[0]?.text()).toContain('Ganti role user');
  });

  it('acknowledges an open critical row via PATCH and updates the row in place', async () => {
    const fetchMock = mockBackend([CRITICAL_OPEN_LOG]);
    const wrapper = await mountView();

    await wrapper.find('tbody tr button').trigger('click');

    await vi.waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input).includes('/log-critical-open/acknowledge') && init?.method === 'PATCH',
      );
      expect(patchCall).toBeDefined();
    });

    // Button disappears once acknowledged, without refetching the list.
    // Excludes the fetchAdminActionCount call (pageSize=200) from the count.
    await vi.waitFor(() =>
      expect(
        wrapper.findAll('tbody tr button').filter((b) => b.text().includes('Tandai')),
      ).toHaveLength(0),
    );
    const listCalls = fetchMock.mock.calls.filter(
      ([input]) =>
        String(input).startsWith('/api/audit-logs?') && !String(input).includes('pageSize=200'),
    );
    expect(listCalls).toHaveLength(1);
  });

  it('applies the severity dropdown filter server-side on change', async () => {
    const fetchMock = mockBackend([CRITICAL_OPEN_LOG]);
    const wrapper = await mountView();

    await wrapper.find('#severity-filter').setValue('critical');

    await vi.waitFor(() => {
      const filteredCall = fetchMock.mock.calls.find(([input]) =>
        String(input).includes('severity=critical'),
      );
      expect(filteredCall).toBeDefined();
    });
  });

  it('filters rows client-side via the search box', async () => {
    mockBackend([CRITICAL_OPEN_LOG, INFO_LOG]);
    const wrapper = await mountView();

    await wrapper.find('#audit-search').setValue('login');

    const body = wrapper.find('tbody');
    await vi.waitFor(() => {
      expect(body.text()).toContain('Berhasil login');
      expect(body.text()).not.toContain('Ganti role user');
    });
  });

  it('groups both filter controls in a fieldset with a labelled legend', async () => {
    mockBackend([CRITICAL_OPEN_LOG]);
    const wrapper = await mountView();

    // The reviewer's exact check: the fieldset must actually contain the controls.
    const fieldset = wrapper.find('fieldset');
    expect(fieldset.exists()).toBe(true);
    expect(fieldset.find('legend').text()).toBe('Filter log audit');

    const controls = fieldset.element.querySelectorAll('input, select, button');
    expect(controls).toHaveLength(2);
    expect(fieldset.find('#audit-search').exists()).toBe(true);
    expect(fieldset.find('#severity-filter').exists()).toBe(true);
  });

  it('announces result changes via an always-mounted polite live region', async () => {
    mockBackend([CRITICAL_OPEN_LOG, INFO_LOG]);
    const wrapper = await mountView();

    const status = wrapper.find('[role="status"]');
    expect(status.exists()).toBe(true);
    expect(status.attributes('aria-live')).toBe('polite');
    expect(status.text()).toContain('Menampilkan');
    expect(status.text()).toContain('halaman 1 dari 1');

    // Client-side search narrows the count → live text must follow.
    await wrapper.find('#audit-search').setValue('login');
    await vi.waitFor(() => expect(status.text()).toMatch(/Menampilkan\s+1\s+dari\s+2/));
    // Still mounted after filtering — never v-if'd out of the DOM.
    expect(wrapper.find('[role="status"]').exists()).toBe(true);
  });

  it('shows the pagination footer with the row and total counts', async () => {
    mockBackend([CRITICAL_OPEN_LOG, INFO_LOG]);
    const wrapper = await mountView();

    const footer = wrapper.find('nav[aria-label="Navigasi halaman log audit"]');
    expect(footer.text()).toContain('Menampilkan');
    expect(footer.text()).toContain('2');
    expect(footer.text()).toContain('data');
    expect(footer.text()).toContain('Selanjutnya');
  });

  it.each([
    [500, true],
    [403, false],
  ])('load error (HTTP %i) shows retry button: %s', async (status, retry) => {
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'c' }) } as Response;
      }
      if (url.includes('/summary')) {
        return { ok: true, json: async () => ({ counts: {}, openCritical: 0 }) } as Response;
      }
      return { ok: false, status, json: async () => ({ error: 'x' }) } as Response;
    });
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore().setAuth({ id: 'a', email: 'a@example.com', role: 'admin' }, 'mock-token');
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/audit-logs', component: AuditLogView }],
    });
    await router.push('/audit-logs');
    await router.isReady();
    const wrapper = mount(AuditLogView, { global: { plugins: [pinia, router] } });
    await vi.waitFor(() =>
      expect(wrapper.find('[data-test="audit-load-error"]').exists()).toBe(true),
    );
    expect(wrapper.find('[data-test="alert-banner-retry"]').exists()).toBe(retry);
  });

  describe('failure banners and pagination', () => {
    const previousButton = (wrapper: VueWrapper) =>
      wrapper.findAll('nav button').find((b) => b.text().includes('Sebelumnya'));

    /** Mock where the named endpoint fails with `status`; everything else answers normally. */
    function failing(endpoint: 'summary' | 'acknowledge', status: number) {
      // A fresh copy: the acknowledge test above mutates the shared fixture in place.
      const base = mockBackend([
        { ...CRITICAL_OPEN_LOG, acknowledgedAt: null, acknowledgedById: null },
      ]);
      const ok = base.getMockImplementation()!;
      base.mockImplementation(async (input, init) => {
        const url = String(input);
        if (endpoint === 'summary' && url.includes('/summary')) {
          return { ok: false, status, json: async () => ({ error: 'x' }) } as Response;
        }
        if (endpoint === 'acknowledge' && url.includes('/acknowledge')) {
          return { ok: false, status, json: async () => ({ error: 'x' }) } as Response;
        }
        return ok(input, init);
      });
      return base;
    }

    it('shows the summary failure in its own words, without a prefix, with its kind', async () => {
      failing('summary', 500);
      const wrapper = await mountView();

      const banner = wrapper.find('[data-test="audit-summary-error"]');
      expect(banner.exists()).toBe(true);
      expect(banner.text()).toContain('Gagal memuat ringkasan audit log.');
      expect(banner.text()).not.toContain('Ringkasan tidak tersedia');
    });

    it('shows an acknowledge failure in plain words with no retry for a forbidden answer', async () => {
      failing('acknowledge', 403);
      const wrapper = await mountView();

      await wrapper.find('tbody tr button').trigger('click');

      await vi.waitFor(() =>
        expect(wrapper.find('[data-test="audit-acknowledge-error"]').exists()).toBe(true),
      );
      const banner = wrapper.find('[data-test="audit-acknowledge-error"]');
      expect(banner.text()).toContain('Gagal menandai log telah dibaca.');
      expect(banner.find('[data-test="alert-banner-retry"]').exists()).toBe(false);
    });

    it('keeps "Sebelumnya" mounted and disabled on the first page, enabled after it', async () => {
      mockBackend([CRITICAL_OPEN_LOG, INFO_LOG]);
      const wrapper = await mountView();
      expect(previousButton(wrapper)).toBeDefined();
      expect(previousButton(wrapper)!.attributes('disabled')).toBeDefined();

      useAuditStore().page = 2;
      await vi.waitFor(() =>
        expect(previousButton(wrapper)!.attributes('disabled')).toBeUndefined(),
      );
    });

    it('keeps the "Sebelumnya" button in place when returning to the first page', async () => {
      mockBackend([CRITICAL_OPEN_LOG, INFO_LOG]);
      const wrapper = await mountView();
      useAuditStore().page = 2;
      await vi.waitFor(() =>
        expect(previousButton(wrapper)!.attributes('disabled')).toBeUndefined(),
      );
      const before = previousButton(wrapper)!.element;

      useAuditStore().page = 1;
      await vi.waitFor(() => expect(previousButton(wrapper)!.attributes('disabled')).toBeDefined());
      expect(previousButton(wrapper)!.element).toBe(before);
    });
  });
});
