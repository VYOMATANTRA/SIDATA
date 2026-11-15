import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import UserManagement from '../views/UserManagement.vue';
import AdminLayout from '../layouts/AdminLayout.vue';
import { useAuthStore } from '../stores/auth';
import { USER_MESSAGES } from '../utils/userMessages';

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/users', component: UserManagement },
      { path: '/settings/audit-retention', component: { template: '<div>Audit Retention</div>' } },
    ],
  });
}

describe('UserManagement Header Layout', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('renders header action buttons inside a container with flex-wrap to prevent horizontal overflow on mobile screens', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        users: [],
        roles: [{ id: 'role-1', name: 'admin' }],
      }),
    } as Response);

    const router = createTestRouter();
    await router.push('/users');
    await router.isReady();

    const wrapper = mount(UserManagement, {
      global: { plugins: [router] },
    });
    await flushPromises();

    // Locate the "Retensi Audit" link
    const auditRetentionLink = wrapper.find('a[href="/settings/audit-retention"]');
    expect(auditRetentionLink.exists()).toBe(true);
    expect(auditRetentionLink.text()).toContain('Retensi Audit');

    // The container wrapping "Retensi Audit" and "Tambah Pengguna" buttons
    const buttonContainer = auditRetentionLink.element.parentElement;
    expect(buttonContainer).not.toBeNull();
    expect(buttonContainer?.classList.contains('flex')).toBe(true);
    expect(buttonContainer?.classList.contains('flex-wrap')).toBe(true);
  });
});

describe('UserManagement inside AdminLayout (shell regression)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('renders without errors, contributing exactly one h1 (no duplicate h2 title) via the shell', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        users: [],
        roles: [{ id: 'role-1', name: 'admin' }],
      }),
    } as Response);

    // AdminLayout is mounted directly below as the unit under test, so its own <RouterView/>
    // must sit at matched-depth 0 — the router here stays flat (no AdminLayout route record),
    // mirroring AdminLayout.spec.ts. Nesting AdminLayout as a route component too would double
    // its depth-0 RouterView and render the shell twice.
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/admin',
          component: { template: '<div>Dashboard</div>' },
          meta: { title: 'Beranda', breadcrumb: [] },
        },
        {
          path: '/users',
          component: UserManagement,
          meta: {
            title: 'Manajemen Pengguna',
            subtitle: 'Kelola akun pengguna sistem.',
            breadcrumb: ['Sistem', 'Akun pengguna'],
          },
        },
        { path: '/data', component: { template: '<div>Data</div>' } },
        { path: '/audit-logs', component: { template: '<div>Audit</div>' } },
        { path: '/admin/:pathMatch(.*)*', component: { template: '<div>Admin Page</div>' } },
      ],
    });

    const authStore = useAuthStore();
    authStore.user = { id: 'u1', email: 'admin@example.com', role: 'admin' };
    authStore.accessToken = 'token';

    await router.push('/users');
    await router.isReady();

    const wrapper = mount(AdminLayout, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.findAll('h1').length).toBe(1);
    expect(wrapper.find('h1').text()).toBe('Manajemen Pengguna');
    expect(wrapper.findComponent(UserManagement).exists()).toBe(true);
    // The view no longer renders its own duplicate <h2> title — only the shell's <h1> and the
    // subtitle seeded from route meta (a screen reader would otherwise read the page title twice).
    expect(wrapper.find('h2').exists()).toBe(false);
    expect(wrapper.find('[data-test="admin-header"] p').text()).toContain(
      'Kelola akun pengguna sistem',
    );
  });
});

const ADMIN_USER = {
  id: 'u-admin',
  email: 'admin@example.com',
  auth_provider: 'local',
  email_verified: true,
  requires_password_change: false,
  deletedAt: null,
  roleId: 'role-admin',
  role: { id: 'role-admin', name: 'admin' },
  createdAt: '2026-01-01T00:00:00.000Z',
};

const PLAIN_USER = {
  id: 'u-plain',
  email: 'plain@example.com',
  auth_provider: 'local',
  email_verified: false,
  requires_password_change: false,
  deletedAt: null,
  roleId: 'role-user',
  role: { id: 'role-user', name: 'user' },
  createdAt: '2026-01-01T00:00:00.000Z',
};

const DEACTIVATED_USER = {
  id: 'u-deactivated',
  email: 'deactivated@example.com',
  auth_provider: 'local',
  email_verified: true,
  requires_password_change: false,
  deletedAt: '2026-01-02T00:00:00.000Z',
  roleId: 'role-user',
  role: { id: 'role-user', name: 'user' },
  createdAt: '2026-01-01T00:00:00.000Z',
};

const ROLES = [
  { id: 'role-admin', name: 'admin' },
  { id: 'role-user', name: 'user' },
];

// Deep-clones `body` so the store mutating a returned user object (e.g. updateUserRole's
// `target.role = matchedRole`) can never leak into the shared ADMIN_USER/PLAIN_USER/
// DEACTIVATED_USER fixtures used across tests in this file.
function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  const cloned = structuredClone(body);
  return { ok, status, json: async () => cloned } as Response;
}

function installFetchMock(
  overrides: { onRequest?: (url: string, init?: RequestInit) => Response | undefined } = {},
) {
  globalThis.fetch = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    const override = overrides.onRequest?.(url, init);
    if (override) return override;

    if (url === '/api/auth/csrf-token') {
      return jsonResponse({ csrfToken: 'csrf-token' });
    }
    if (url === '/api/users') {
      return jsonResponse({ users: [ADMIN_USER, PLAIN_USER, DEACTIVATED_USER] });
    }
    if (url === '/api/users/roles') {
      return jsonResponse({ roles: ROLES });
    }

    throw new Error(`unexpected fetch: ${url} ${init?.method ?? 'GET'}`);
  }) as typeof fetch;
}

async function mountReadyUserManagement() {
  const router = createTestRouter();
  await router.push('/users');
  await router.isReady();

  const wrapper = mount(UserManagement, {
    global: { plugins: [router], stubs: { teleport: true } },
  });
  await flushPromises();
  return wrapper;
}

describe('UserManagement.vue — light theme shell (no dark panel)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    installFetchMock();
  });

  it('does not wrap its content in a dark panel (bg-slate-950) distinct from the white shell', async () => {
    const wrapper = await mountReadyUserManagement();
    expect(wrapper.html()).not.toContain('bg-slate-950');
    expect(wrapper.find('table').exists()).toBe(true);
  });
});

describe('UserManagement.vue — create user flow', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('creates a user and shows a success message inside the BaseModal dialog', async () => {
    installFetchMock({
      onRequest: (url, init) => {
        if (url === '/api/users' && init?.method === 'POST') {
          return jsonResponse({
            message: 'Pengguna berhasil dibuat.',
            user: { ...PLAIN_USER, id: 'u-new', email: 'baru@example.com' },
          });
        }
        return undefined;
      },
    });

    const wrapper = await mountReadyUserManagement();

    const addButton = wrapper.findAll('button').find((b) => b.text().includes('Tambah Pengguna'));
    expect(addButton).toBeTruthy();
    await addButton!.trigger('click');

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(wrapper.find('#create-user-email').exists()).toBe(true);

    await wrapper.find('#create-user-email').setValue('baru@example.com');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.text()).toContain('Pengguna berhasil dibuat.');
  });

  it('shows a server error inside the dialog when creation fails', async () => {
    installFetchMock({
      onRequest: (url, init) => {
        if (url === '/api/users' && init?.method === 'POST') {
          return jsonResponse({ error: 'Email sudah terdaftar.' }, false, 409);
        }
        return undefined;
      },
    });

    const wrapper = await mountReadyUserManagement();
    const addButton = wrapper.findAll('button').find((b) => b.text().includes('Tambah Pengguna'));
    await addButton!.trigger('click');

    await wrapper.find('#create-user-email').setValue('baru@example.com');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toContain(
      `Gagal membuat pengguna. ${USER_MESSAGES.conflict}`,
    );
  });
});

describe('UserManagement.vue — role, password, and deactivate/activate flows', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('updates a role and closes the dialog', async () => {
    installFetchMock({
      onRequest: (url, init) => {
        if (url === `/api/users/${PLAIN_USER.id}/role` && init?.method === 'PATCH') {
          return jsonResponse({ user: { role: { id: 'role-admin', name: 'admin' } } });
        }
        return undefined;
      },
    });

    const wrapper = await mountReadyUserManagement();
    const plainRow = wrapper.findAll('tbody tr').find((r) => r.text().includes(PLAIN_USER.email));
    const roleButton = plainRow!.findAll('button').find((b) => b.text() === 'Ubah Role');
    await roleButton!.trigger('click');

    expect(wrapper.text()).toContain(`Pilih role baru untuk ${PLAIN_USER.email}`);

    await wrapper.find('select').setValue('role-admin');
    const saveButton = wrapper.findAll('button').find((b) => b.text() === 'Simpan Perubahan');
    await saveButton!.trigger('click');
    await flushPromises();

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it('rejects a weak new password with an inline error before submitting', async () => {
    installFetchMock();
    const wrapper = await mountReadyUserManagement();

    const passwordButtons = wrapper.findAll('button').filter((b) => b.text() === 'Ganti Password');
    await passwordButtons[0]!.trigger('click');

    await wrapper.find('#change-password-new').setValue('password');
    await wrapper.find('#change-password-new').trigger('blur');
    await flushPromises();

    expect(wrapper.find('#change-password-new-error').text()).toContain('lemah');
  });

  it('shows a user-specific confirmation and deactivates the account on confirm', async () => {
    installFetchMock({
      onRequest: (url, init) => {
        if (url === `/api/users/${PLAIN_USER.id}` && init?.method === 'DELETE') {
          return jsonResponse({});
        }
        return undefined;
      },
    });

    const wrapper = await mountReadyUserManagement();
    const deactivateButton = wrapper.findAll('button').find((b) => b.text() === 'Deactivate');
    await deactivateButton!.trigger('click');

    expect(wrapper.text()).toContain('Nonaktifkan Pengguna?');
    expect(wrapper.text()).toContain(PLAIN_USER.email);

    const confirmButton = wrapper.findAll('button').find((b) => b.text() === 'Ya');
    await confirmButton!.trigger('click');
    await flushPromises();

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it('shows an activate confirmation for a deactivated account', async () => {
    installFetchMock({
      onRequest: (url, init) => {
        if (url === `/api/users/${DEACTIVATED_USER.id}/reactivate` && init?.method === 'PATCH') {
          return jsonResponse({});
        }
        return undefined;
      },
    });

    const wrapper = await mountReadyUserManagement();
    const activateButton = wrapper.findAll('button').find((b) => b.text() === 'Activate');
    await activateButton!.trigger('click');

    expect(wrapper.text()).toContain('Aktifkan Pengguna?');
    expect(wrapper.text()).toContain(DEACTIVATED_USER.email);
  });

  it('shows a role-change failure inline instead of a native alert, and clears it on the next attempt', async () => {
    const alertSpy = vi.fn<(message?: string) => void>();
    vi.stubGlobal('alert', alertSpy);
    let fail = true;
    installFetchMock({
      onRequest: (url, init) => {
        if (url === `/api/users/${PLAIN_USER.id}/role` && init?.method === 'PATCH') {
          return fail
            ? jsonResponse({ error: 'Gagal.' }, false, 500)
            : jsonResponse({ user: { role: { id: 'role-admin', name: 'admin' } } });
        }
        return undefined;
      },
    });

    const wrapper = await mountReadyUserManagement();
    const plainRow = wrapper.findAll('tbody tr').find((r) => r.text().includes(PLAIN_USER.email));
    await plainRow!
      .findAll('button')
      .find((b) => b.text() === 'Ubah Role')!
      .trigger('click');
    await wrapper.find('select').setValue('role-admin');
    const save = () => wrapper.findAll('button').find((b) => b.text() === 'Simpan Perubahan')!;
    await save().trigger('click');
    await flushPromises();

    expect(alertSpy).not.toHaveBeenCalled();
    expect(wrapper.find('[data-test="user-action-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="user-action-error"]').attributes('role')).toBe('alert');

    fail = false;
    await save().trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="user-action-error"]').exists()).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe('UserManagement.vue — load error banner', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('offers retry for a server failure but not for a 403', async () => {
    installFetchMock({
      onRequest: (url) =>
        url === '/api/users' ? jsonResponse({ error: 'x' }, false, 500) : undefined,
    });
    let wrapper = await mountReadyUserManagement();
    expect(wrapper.find('[data-test="users-load-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="alert-banner-retry"]').exists()).toBe(true);

    setActivePinia(createPinia());
    installFetchMock({
      onRequest: (url) =>
        url === '/api/users' ? jsonResponse({ error: 'x' }, false, 403) : undefined,
    });
    wrapper = await mountReadyUserManagement();
    expect(wrapper.find('[data-test="users-load-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="alert-banner-retry"]').exists()).toBe(false);
  });
});

function requestCount(url: string): number {
  return vi.mocked(globalThis.fetch).mock.calls.filter(([input]) => String(input) === url).length;
}

describe('UserManagement.vue — list, roles and dialog failures', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('retries both lists from the users banner', async () => {
    let usersFail = true;
    installFetchMock({
      onRequest: (url) =>
        url === '/api/users' && usersFail ? jsonResponse({ error: 'x' }, false, 500) : undefined,
    });
    const wrapper = await mountReadyUserManagement();
    expect(wrapper.find('[data-test="users-load-error"]').exists()).toBe(true);
    const rolesBefore = requestCount('/api/users/roles');
    const usersBefore = requestCount('/api/users');

    usersFail = false;
    await wrapper
      .find('[data-test="users-load-error"] [data-test="alert-banner-retry"]')
      .trigger('click');
    await flushPromises();

    expect(requestCount('/api/users/roles')).toBe(rolesBefore + 1);
    expect(requestCount('/api/users')).toBe(usersBefore + 1);
    expect(wrapper.find('[data-test="users-load-error"]').exists()).toBe(false);
  });

  it('shows a roles failure in its own banner, with a retry that loads only the roles', async () => {
    let rolesFail = true;
    installFetchMock({
      onRequest: (url) =>
        url === '/api/users/roles' && rolesFail
          ? jsonResponse({ error: 'x' }, false, 500)
          : undefined,
    });
    const wrapper = await mountReadyUserManagement();
    expect(wrapper.find('[data-test="users-load-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="roles-load-error"]').text()).toContain(
      'Gagal memuat daftar role.',
    );
    const usersBefore = requestCount('/api/users');

    rolesFail = false;
    await wrapper
      .find('[data-test="roles-load-error"] [data-test="alert-banner-retry"]')
      .trigger('click');
    await flushPromises();

    expect(requestCount('/api/users')).toBe(usersBefore);
    expect(wrapper.find('[data-test="roles-load-error"]').exists()).toBe(false);
  });

  it('shows the roles failure in the create dialog, not the users failure', async () => {
    installFetchMock({
      onRequest: (url) =>
        url === '/api/users' || url === '/api/users/roles'
          ? jsonResponse({ error: 'x' }, false, 500)
          : undefined,
    });
    const wrapper = await mountReadyUserManagement();
    const addButton = wrapper.findAll('button').find((b) => b.text().includes('Tambah Pengguna'));
    await addButton!.trigger('click');

    const dialog = wrapper.find('[role="dialog"]');
    expect(dialog.find('[data-test="create-roles-error"]').text()).toContain(
      'Gagal memuat daftar role.',
    );
    expect(dialog.text()).not.toContain('Gagal memuat daftar pengguna');
  });

  it('shows the roles failure in the role dialog', async () => {
    installFetchMock({
      onRequest: (url) =>
        url === '/api/users/roles' ? jsonResponse({ error: 'x' }, false, 500) : undefined,
    });
    const wrapper = await mountReadyUserManagement();
    const roleButton = wrapper
      .findAll('tbody tr')
      .find((r) => r.text().includes(PLAIN_USER.email))!
      .findAll('button')
      .find((b) => b.text() === 'Ubah Role');
    await roleButton!.trigger('click');

    const dialog = wrapper.find('[role="dialog"]');
    expect(dialog.find('[data-test="role-roles-error"]').text()).toContain(
      'Gagal memuat daftar role.',
    );
  });

  it('clears the pending close timer when the create dialog is closed by hand, and on unmount', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      installFetchMock({
        onRequest: (url, init) =>
          url === '/api/users' && init?.method === 'POST'
            ? jsonResponse({
                message: 'Pengguna berhasil dibuat.',
                user: { ...PLAIN_USER, id: 'u-new', email: 'baru@example.com' },
              })
            : undefined,
      });
      const wrapper = await mountReadyUserManagement();
      const timersBefore = vi.getTimerCount();
      const addButton = wrapper.findAll('button').find((b) => b.text().includes('Tambah Pengguna'));
      await addButton!.trigger('click');
      await wrapper.find('#create-user-email').setValue('baru@example.com');
      await wrapper.find('form').trigger('submit.prevent');
      await flushPromises();
      expect(vi.getTimerCount()).toBe(timersBefore + 1);

      const cancel = wrapper
        .find('[role="dialog"]')
        .findAll('button')
        .find((b) => b.text() === 'Batal');
      await cancel!.trigger('click');
      expect(vi.getTimerCount()).toBe(timersBefore);
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
