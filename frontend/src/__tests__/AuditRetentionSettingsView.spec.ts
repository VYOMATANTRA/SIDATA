import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import AuditRetentionSettingsView from '../views/AuditRetentionSettingsView.vue';
import { useAuthStore } from '../stores/auth';

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/settings/audit-retention', component: AuditRetentionSettingsView },
      { path: '/users', component: { template: '<div>User Management</div>' } },
    ],
  });
}

describe('AuditRetentionSettingsView Accessibility & Markup', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('renders required semantic landmarks, exactly one h1, and paired label controls (docs/ACCESSIBILITY.md)', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        retention: { info: 30, warning: 60, critical: 90 },
      }),
    } as Response);

    const router = createTestRouter();
    await router.push('/settings/audit-retention');
    await router.isReady();

    const wrapper = mount(AuditRetentionSettingsView, {
      global: { plugins: [router] },
    });

    await flushPromises();

    // 1. Exactly one <main> landmark
    const mains = wrapper.findAll('main');
    expect(mains.length).toBe(1);
    expect(mains[0]?.attributes('id')).toBe('main-content');

    // 2. Exactly one <h1> heading
    const h1s = wrapper.findAll('h1');
    expect(h1s.length).toBe(1);
    expect(h1s[0]?.text()).toContain('Pengaturan Retensi Audit Log');

    // 3. Form controls must have matching <label for="..."> and id
    const inputIds = ['retention-info', 'retention-warning', 'retention-critical'];
    for (const id of inputIds) {
      const input = wrapper.find(`input#${id}`);
      expect(input.exists()).toBe(true);

      const label = wrapper.find(`label[for="${id}"]`);
      expect(label.exists()).toBe(true);
      expect(label.text().length).toBeGreaterThan(0);
    }
  });

  it('provides a skip to content link matching WCAG 2.4.1', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        retention: { info: 0, warning: 0, critical: 0 },
      }),
    } as Response);

    const router = createTestRouter();
    const wrapper = mount(AuditRetentionSettingsView, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const skipLink = wrapper.find('a[href="#main-content"]');
    expect(skipLink.exists()).toBe(true);
    expect(skipLink.text()).toContain('Lewati ke konten utama');
  });

  it('renders technical terms with <em> tags instead of literal markdown asterisks in header description', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        retention: { info: 30, warning: 60, critical: 90 },
      }),
    } as Response);

    const router = createTestRouter();
    const wrapper = mount(AuditRetentionSettingsView, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const header = wrapper.find('header');
    expect(header.exists()).toBe(true);
    const headerHtml = header.html();

    // Literal markdown asterisks should not show on screen
    expect(headerHtml).not.toContain('*severity*');
    expect(headerHtml).not.toContain('*critical*');

    // Emphasized HTML tags should be used
    const emTags = header.findAll('em');
    const emTexts = emTags.map((em) => em.text());
    expect(emTexts).toContain('severity');
    expect(emTexts).toContain('critical');
  });
});

describe('AuditRetentionSettingsView Client-Side Validation & Error Handling (Non-Happy Path)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('renders dash placeholder "—" in duration badge when number input is cleared', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        retention: { info: 30, warning: 60, critical: 90 },
      }),
    } as Response);

    const router = createTestRouter();
    const wrapper = mount(AuditRetentionSettingsView, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const infoInput = wrapper.find('input#retention-info');
    const badge = wrapper.find('[data-test="badge-info"]');
    expect(badge.text()).toBe('1 Bulan (30 hari)');

    // Clear input
    await infoInput.setValue('');

    // Must show dash '—', and not glitch with "0 Tahun ( hari)"
    expect(badge.text()).toBe('—');
    expect(badge.text()).not.toContain('0 Tahun');
  });

  it('blocks submit and displays validation error when info > warning (0 = infinite)', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        retention: { info: 30, warning: 60, critical: 90 },
      }),
    } as Response);

    const router = createTestRouter();
    const wrapper = mount(AuditRetentionSettingsView, {
      global: { plugins: [router] },
    });
    await flushPromises();

    // Set invalid values: info = 120, warning = 60, critical = 90 (info > warning)
    const infoInput = wrapper.find('input#retention-info');
    await infoInput.setValue(120);

    const submitBtn = wrapper.find('button[type="submit"]');
    expect(submitBtn.attributes('disabled')).toBeDefined();

    const errorAlert = wrapper.find('[data-test="client-validation-error"]');
    expect(errorAlert.exists()).toBe(true);
    expect(errorAlert.text()).toContain('Retensi critical harus >= warning >= info');
  });

  it('blocks submit when 0 (infinite) info is paired with finite warning', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        retention: { info: 30, warning: 60, critical: 90 },
      }),
    } as Response);

    const router = createTestRouter();
    const wrapper = mount(AuditRetentionSettingsView, {
      global: { plugins: [router] },
    });
    await flushPromises();

    // Set info = 0 (infinite), while warning = 60 (finite).
    // Infinite info > finite warning, so this must be flagged as invalid.
    const infoInput = wrapper.find('input#retention-info');
    await infoInput.setValue(0);

    const submitBtn = wrapper.find('button[type="submit"]');
    expect(submitBtn.attributes('disabled')).toBeDefined();

    const errorAlert = wrapper.find('[data-test="client-validation-error"]');
    expect(errorAlert.exists()).toBe(true);
    expect(errorAlert.text()).toContain('Retensi critical harus >= warning >= info');
  });

  it('displays server error banner when patch fails', async () => {
    const authStore = useAuthStore();
    authStore.setAuth({ id: 'admin-1', email: 'admin@example.com', role: 'admin' }, 'valid-token');

    // Initial fetch succeeds
    globalThis.fetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          retention: { info: 30, warning: 60, critical: 90 },
        }),
      } as Response)
      // Csrf token fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrfToken: 'fake-csrf' }),
      } as Response)
      // Patch fails
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Database transaction lock timeout' }),
      } as Response);

    const router = createTestRouter();
    const wrapper = mount(AuditRetentionSettingsView, {
      global: { plugins: [router] },
    });
    await flushPromises();

    // Trigger submit with valid input changes
    const infoInput = wrapper.find('input#retention-info');
    await infoInput.setValue(45);

    const form = wrapper.find('form');
    await form.trigger('submit.prevent');
    await flushPromises();

    const serverAlert = wrapper.find('[data-test="server-error-banner"]');
    expect(serverAlert.exists()).toBe(true);
    expect(serverAlert.text()).toContain('Database transaction lock timeout');
  });

  it('disables save button and displays load error with retry button when initial fetch fails (non-happy path)', async () => {
    // Initial fetch fails
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Gagal memuat pengaturan retensi audit dari server' }),
    } as Response);

    const router = createTestRouter();
    const wrapper = mount(AuditRetentionSettingsView, {
      global: { plugins: [router] },
    });
    await flushPromises();

    // 1. Save button must be disabled when data is not loaded (prevents silent overwrites with defaults)
    const submitBtn = wrapper.find('button[type="submit"]');
    expect(submitBtn.attributes('disabled')).toBeDefined();

    // 2. Server error banner and retry button are shown
    const serverAlert = wrapper.find('[data-test="server-error-banner"]');
    expect(serverAlert.exists()).toBe(true);
    expect(serverAlert.text()).toContain('Gagal memuat pengaturan retensi audit dari server');

    const retryBtn = wrapper.find('button[data-test="retry-btn"]');
    expect(retryBtn.exists()).toBe(true);

    // 3. Form cannot submit when triggered
    const form = wrapper.find('form');
    await form.trigger('submit.prevent');
    await flushPromises();

    // 4. Clicking Retry triggers re-fetch and enables form on success
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        retention: { info: 10, warning: 20, critical: 30 },
      }),
    } as Response);

    await retryBtn.trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-test="server-error-banner"]').exists()).toBe(false);
    expect((wrapper.find('input#retention-info').element as HTMLInputElement).value).toBe('10');
  });

  it('disables save button and displays error banner when initial fetch returns malformed retention fields', async () => {
    // Initial fetch returns malformed retention fields (info: null, warning: 'abc')
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        retention: { info: null, warning: 'abc' },
      }),
    } as Response);

    const router = createTestRouter();
    const wrapper = mount(AuditRetentionSettingsView, {
      global: { plugins: [router] },
    });
    await flushPromises();

    // 1. Save button must be disabled
    const submitBtn = wrapper.find('button[type="submit"]');
    expect(submitBtn.attributes('disabled')).toBeDefined();

    // 2. Server error banner and retry button are shown
    const serverAlert = wrapper.find('[data-test="server-error-banner"]');
    expect(serverAlert.exists()).toBe(true);
    expect(serverAlert.text()).toMatch(/tidak valid/i);

    const retryBtn = wrapper.find('button[data-test="retry-btn"]');
    expect(retryBtn.exists()).toBe(true);
  });
});

describe('AuditRetentionSettingsView Submission & Reset (Happy Path)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('successfully submits valid policy changes and updates feedback', async () => {
    const authStore = useAuthStore();
    authStore.setAuth({ id: 'admin-1', email: 'admin@example.com', role: 'admin' }, 'valid-token');

    const initialPolicy = { info: 30, warning: 60, critical: 90 };
    const nextPolicy = { info: 60, warning: 90, critical: 0 }; // 0 = infinite critical

    globalThis.fetch = vi
      .fn<typeof fetch>()
      // Initial fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ retention: initialPolicy }),
      } as Response)
      // Csrf token
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ csrfToken: 'csrf-123' }),
      } as Response)
      // Patch response
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          message: 'Pengaturan retensi audit log berhasil diperbarui.',
          retention: nextPolicy,
        }),
      } as Response);

    const router = createTestRouter();
    const wrapper = mount(AuditRetentionSettingsView, {
      global: { plugins: [router] },
    });
    await flushPromises();

    // Fill valid values
    await wrapper.find('input#retention-info').setValue(nextPolicy.info);
    await wrapper.find('input#retention-warning').setValue(nextPolicy.warning);
    await wrapper.find('input#retention-critical').setValue(nextPolicy.critical);

    const form = wrapper.find('form');
    await form.trigger('submit.prevent');
    await flushPromises();

    const successBanner = wrapper.find('[data-test="success-banner"]');
    expect(successBanner.exists()).toBe(true);
    expect(successBanner.text()).toContain('Pengaturan retensi audit log berhasil diperbarui.');

    // Status badges reflect the values (e.g., 0 days rendered as Selamanya)
    const criticalBadge = wrapper.find('[data-test="badge-critical"]');
    expect(criticalBadge.text()).toContain('Selamanya');
  });

  it('resets form back to stored server policy when Reset button is clicked', async () => {
    const initialPolicy = { info: 15, warning: 30, critical: 60 };

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ retention: initialPolicy }),
    } as Response);

    const router = createTestRouter();
    const wrapper = mount(AuditRetentionSettingsView, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const infoInput = wrapper.find('input#retention-info');
    await infoInput.setValue(100);
    expect((infoInput.element as HTMLInputElement).value).toBe('100');

    // Click Reset
    const resetBtn = wrapper.find('button[data-test="reset-btn"]');
    await resetBtn.trigger('click');

    expect((infoInput.element as HTMLInputElement).value).toBe('15');
  });
});
