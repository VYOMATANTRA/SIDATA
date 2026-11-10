import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  describeTemplateFailure,
  inUseMessage,
  useComparisonTemplatesStore,
  type ComparisonTemplate,
  type TemplateDraft,
} from '../stores/comparisonTemplates.store';
import { USER_MESSAGES } from '../utils/userMessages';

function makeTemplate(overrides: Partial<ComparisonTemplate> = {}): ComparisonTemplate {
  return {
    id: 'tpl-1',
    slug: 'perbandingan-tahunan',
    label: 'Perbandingan tahunan',
    body: 'Data {label}, {trend}.',
    trendNaik: 'naik {delta}',
    trendTurun: 'turun {delta}',
    trendTetap: 'tidak berubah',
    usageCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

const DRAFT: TemplateDraft = {
  label: 'Perbandingan tahunan',
  body: 'Data {label}, {trend}.',
  trendNaik: 'naik {delta}',
  trendTurun: 'turun {delta}',
  trendTetap: 'tidak berubah',
};

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>;

function route(handlers: Record<string, Handler>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/auth/csrf-token') return json({ csrfToken: 'csrf-1' });
    const key = `${(init?.method ?? 'GET').toUpperCase()} ${url}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`unexpected fetch: ${key}`);
    return handler(init);
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('comparison templates store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('loads templates with their usage counts', async () => {
    route({
      'GET /api/comparison-templates': () =>
        json({ templates: [makeTemplate({ usageCount: 2 }), makeTemplate({ id: 'tpl-2' })] }),
    });
    const store = useComparisonTemplatesStore();

    await store.fetchTemplates();

    expect(store.templates.map((t) => t.usageCount)).toEqual([2, 0]);
    expect(store.isLoaded).toBe(true);
    expect(store.error).toBeNull();
  });

  it('reports a failed load in approved wording and keeps the rows already shown', async () => {
    route({
      'GET /api/comparison-templates': () => json({ error: 'ER_BAD_FIELD_ERROR stack' }, 500),
    });
    const store = useComparisonTemplatesStore();
    store.templates = [makeTemplate()];

    await store.fetchTemplates(true);

    expect(store.error).toContain('Gagal memuat daftar templat kalimat.');
    expect(store.error).not.toMatch(/ER_BAD|stack|500/);
    expect(store.templates).toHaveLength(1);
    expect(store.selectorError).toBeNull();
  });

  it('records failure in selectorError (and leaves error null) when called with forSelector: true', async () => {
    route({
      'GET /api/comparison-templates': () => json({ error: 'network down' }, 500),
    });
    const store = useComparisonTemplatesStore();

    await store.fetchTemplates({ force: true, forSelector: true });

    expect(store.selectorError).toContain('Gagal memuat daftar templat kalimat.');
    expect(store.error).toBeNull();

    store.clearSelectorError();
    expect(store.selectorError).toBeNull();
  });

  it('records failure in error (and leaves selectorError null) when called without forSelector', async () => {
    route({
      'GET /api/comparison-templates': () => json({ error: 'network down' }, 500),
    });
    const store = useComparisonTemplatesStore();

    await store.fetchTemplates(true);

    expect(store.error).toContain('Gagal memuat daftar templat kalimat.');
    expect(store.selectorError).toBeNull();
  });

  it('awaits in-flight request and performs a fresh fetch when force is true', async () => {
    let getCalls = 0;
    let resolveFirstGet!: (res: Response) => void;
    const firstGetPromise = new Promise<Response>((resolve) => {
      resolveFirstGet = resolve;
    });

    route({
      'GET /api/comparison-templates': () => {
        getCalls += 1;
        if (getCalls === 1) {
          return firstGetPromise;
        }
        return json({ templates: [makeTemplate({ id: 'tpl-fresh' })] });
      },
    });

    const store = useComparisonTemplatesStore();
    const firstFetch = store.fetchTemplates();

    const forcedFetch = store.fetchTemplates({ force: true });

    resolveFirstGet(json({ templates: [makeTemplate({ id: 'tpl-stale' })] }));

    await Promise.all([firstFetch, forcedFetch]);

    expect(getCalls).toBe(2);
    expect(store.templates.map((t) => t.id)).toEqual(['tpl-fresh']);
  });

  it('isolates error channels when selector fetch is followed by forced admin refresh that fails', async () => {
    let getCalls = 0;
    let resolveFirstGet!: (res: Response) => void;
    const firstGetPromise = new Promise<Response>((resolve) => {
      resolveFirstGet = resolve;
    });

    route({
      'GET /api/comparison-templates': () => {
        getCalls += 1;
        if (getCalls === 1) return firstGetPromise;
        return json({ error: 'Admin refresh failed' }, 500);
      },
    });

    const store = useComparisonTemplatesStore();
    const selectorFetch = store.fetchTemplates({ force: false, forSelector: true });
    const adminFetch = store.fetchTemplates({ force: true, forSelector: false });

    resolveFirstGet(json({ templates: [makeTemplate({ id: 'tpl-selector' })] }));

    await Promise.all([selectorFetch, adminFetch]);

    expect(getCalls).toBe(2);
    expect(store.selectorError).toBeNull();
    expect(store.error).toContain('Gagal memuat daftar templat kalimat.');
  });

  it('prevents a slow in-flight fetchTemplates from overwriting templates mutated in the meantime', async () => {
    let resolveGet!: (res: Response) => void;
    const getPromise = new Promise<Response>((resolve) => {
      resolveGet = resolve;
    });

    route({
      'GET /api/comparison-templates': () => getPromise,
      'POST /api/comparison-templates': () =>
        json({ template: makeTemplate({ id: 'tpl-created', label: 'Created While In Flight' }) }),
    });

    const store = useComparisonTemplatesStore();
    const slowFetch = store.fetchTemplates({ force: true });

    // While slowFetch is in flight, an admin creates a template
    await store.createTemplate({ ...DRAFT, label: 'Created While In Flight' });
    expect(store.templates.map((t) => t.id)).toEqual(['tpl-created']);

    // Now the slow fetch resolves with an older snapshot
    resolveGet(json({ templates: [makeTemplate({ id: 'tpl-stale-from-server' })] }));
    const slowResult = await slowFetch;

    expect(slowResult).toBe(false);
    expect(store.isLoaded).toBe(false);

    // Mutated list must not be clobbered by the stale GET response
    expect(store.templates.map((t) => t.id)).toEqual(['tpl-created']);
  });

  describe('delete', () => {
    it('explains an in-use template with the usage count and what to do first', async () => {
      route({
        'DELETE /api/comparison-templates/tpl-1': () =>
          json({ error: 'Template masih dipakai 3 indikator. Lepaskan ...' }, 409),
        'GET /api/comparison-templates': () =>
          json({ templates: [makeTemplate({ usageCount: 3 })] }),
      });
      const store = useComparisonTemplatesStore();
      store.templates = [makeTemplate({ usageCount: 1 })];

      const outcome = await store.deleteTemplate(store.templates[0]!);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('unreachable');
      expect(outcome.kind).toBe('in_use');
      // The count is refreshed from the server, not taken from the stale row.
      expect(outcome.message).toContain('3 indikator');
      expect(outcome.message).toContain('Perbandingan tahunan');
      expect(outcome.message).toMatch(/Lepaskan atau ganti/);
      expect(outcome.message).not.toMatch(/409|slug|[{}]/);
      expect(store.templates).toHaveLength(1);
    });

    it('removes the row on success', async () => {
      route({ 'DELETE /api/comparison-templates/tpl-1': () => json({ template: makeTemplate() }) });
      const store = useComparisonTemplatesStore();
      store.templates = [makeTemplate()];

      const outcome = await store.deleteTemplate(store.templates[0]!);

      expect(outcome).toEqual({ ok: true });
      expect(store.templates).toEqual([]);
    });

    it('uses approved wording for any other failure', async () => {
      route({ 'DELETE /api/comparison-templates/tpl-1': () => json({ error: 'sql boom' }, 500) });
      const store = useComparisonTemplatesStore();
      store.templates = [makeTemplate()];

      const outcome = await store.deleteTemplate(store.templates[0]!);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('unreachable');
      expect(outcome.kind).toBe('error');
      expect(JSON.stringify(outcome)).toContain(USER_MESSAGES.server);
      expect(JSON.stringify(outcome)).not.toContain('sql boom');
      expect(store.templates).toHaveLength(1);
    });

    it('returns kind: in_use when error code is TEMPLATE_IN_USE even if fresh count is 0', async () => {
      route({
        'DELETE /api/comparison-templates/tpl-1': () =>
          json({ error: 'Template masih dipakai', code: 'TEMPLATE_IN_USE' }, 409),
        'GET /api/comparison-templates': () =>
          json({ templates: [makeTemplate({ usageCount: 0 })] }),
      });
      const store = useComparisonTemplatesStore();
      store.templates = [makeTemplate({ usageCount: 0 })];

      const outcome = await store.deleteTemplate(store.templates[0]!);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('unreachable');
      expect(outcome.kind).toBe('in_use');
    });

    it('returns kind: error on 409 when not TEMPLATE_IN_USE and fresh usageCount is 0', async () => {
      route({
        'DELETE /api/comparison-templates/tpl-1': () =>
          json({ error: 'Konflik lain tanpa status in-use' }, 409),
        'GET /api/comparison-templates': () =>
          json({ templates: [makeTemplate({ usageCount: 0 })] }),
      });
      const store = useComparisonTemplatesStore();
      store.templates = [makeTemplate({ usageCount: 0 })];

      const outcome = await store.deleteTemplate(store.templates[0]!);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('unreachable');
      expect(outcome.kind).toBe('error');
    });
  });

  describe('save', () => {
    it('returns the flagged phrases as an ack outcome, keeping the keys out of any message', async () => {
      route({
        'POST /api/comparison-templates': () =>
          json(
            {
              error: 'Body template memuat kata tren di luar slot {trend}.',
              code: 'TREND_KEYWORD_ACK_REQUIRED',
              warnings: [
                { ackKey: 'abc', phrase: 'terus', excerpt: 'x terus y', acknowledged: false },
                { nonsense: true },
              ],
            },
            422,
          ),
      });
      const store = useComparisonTemplatesStore();

      const outcome = await store.createTemplate(DRAFT);

      expect(outcome).toEqual({
        ok: false,
        kind: 'ack',
        warnings: [{ ackKey: 'abc', phrase: 'terus', excerpt: 'x terus y' }],
      });
    });

    it('echoes acknowledged keys only when there are some', async () => {
      const bodies: Array<Record<string, unknown>> = [];
      route({
        'PATCH /api/comparison-templates/tpl-1': (init) => {
          bodies.push(JSON.parse(String(init?.body)));
          return json({ template: makeTemplate() });
        },
      });
      const store = useComparisonTemplatesStore();

      await store.updateTemplate('tpl-1', DRAFT, '2026-01-02T00:00:00.000Z');
      await store.updateTemplate('tpl-1', DRAFT, '2026-01-02T00:00:00.000Z', ['k1', 'k2']);

      expect(bodies[0]).not.toHaveProperty('acknowledgedWarnings');
      expect(bodies[1]).toMatchObject({ acknowledgedWarnings: ['k1', 'k2'] });
    });

    it('always sends expectedUpdatedAt in PATCH body', async () => {
      let body: Record<string, unknown> | null = null;
      route({
        'PATCH /api/comparison-templates/tpl-1': (init) => {
          body = JSON.parse(String(init?.body));
          return json({ template: makeTemplate() });
        },
      });
      const store = useComparisonTemplatesStore();
      await store.updateTemplate('tpl-1', DRAFT, '2026-01-02T00:00:00.000Z');

      expect(body).toMatchObject({
        expectedUpdatedAt: '2026-01-02T00:00:00.000Z',
      });
    });

    it('returns a stale outcome for 409 STALE_WRITE', async () => {
      route({
        'PATCH /api/comparison-templates/tpl-1': () =>
          json({ error: 'Data telah diubah', code: 'STALE_WRITE' }, 409),
      });
      const store = useComparisonTemplatesStore();
      const outcome = await store.updateTemplate('tpl-1', DRAFT, '2026-01-01T00:00:00.000Z');

      expect(outcome).toMatchObject({
        ok: false,
        kind: 'stale',
      });
    });

    it('treats a 422 without usable warnings as an ordinary failure, not an ack flow', async () => {
      route({
        'POST /api/comparison-templates': () =>
          json({ error: 'x', code: 'TREND_KEYWORD_ACK_REQUIRED', warnings: [] }, 422),
      });
      const store = useComparisonTemplatesStore();

      const outcome = await store.createTemplate(DRAFT);

      expect(outcome).toMatchObject({ ok: false, kind: 'error' });
    });

    it('never surfaces the server sentence of a 400, which quotes placeholder syntax', async () => {
      route({
        'POST /api/comparison-templates': () =>
          json({ error: 'Body harus memuat tepat satu {trend}; Slug tidak valid' }, 400),
      });
      const store = useComparisonTemplatesStore();

      const outcome = await store.createTemplate(DRAFT);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('unreachable');
      expect(outcome).toMatchObject({ kind: 'error' });
      const message = (outcome as { message: string }).message;
      expect(message).toContain('Templat belum bisa disimpan. Periksa nama dan kalimatnya.');
      expect(message).not.toMatch(/[{}]|Slug/);
    });

    it('keeps plain Indonesian server sentences when free of placeholder syntax and hidden tokens', async () => {
      route({
        'POST /api/comparison-templates': () =>
          json({ error: 'Kalimat perbandingan tidak memenuhi kaidah bahasa.' }, 400),
      });
      const store = useComparisonTemplatesStore();

      const outcome = await store.createTemplate(DRAFT);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('unreachable');
      expect(outcome).toMatchObject({ kind: 'error' });
      const message = (outcome as { message: string }).message;
      expect(message).toContain('Kalimat perbandingan tidak memenuhi kaidah bahasa.');
    });

    it('retries create on 409 SLUG_TAKEN up to MAX_SLUG_RETRIES times', async () => {
      let postCount = 0;
      let getCount = 0;
      route({
        'POST /api/comparison-templates': () => {
          postCount += 1;
          if (postCount < 3) {
            return json({ error: 'Slug sudah dipakai', code: 'SLUG_TAKEN' }, 409);
          }
          return json({ template: makeTemplate({ slug: 'perbandingan-3' }) });
        },
        'GET /api/comparison-templates': () => {
          getCount += 1;
          return json({ templates: [makeTemplate({ slug: `perbandingan-${getCount}` })] });
        },
      });
      const store = useComparisonTemplatesStore();
      const outcome = await store.createTemplate(DRAFT);

      expect(outcome.ok).toBe(true);
      expect(postCount).toBe(3);
      expect(getCount).toBe(2);
    });

    it('does not retry create on 409 without SLUG_TAKEN code (issues exactly 1 request)', async () => {
      let postCount = 0;
      let getCount = 0;
      route({
        'POST /api/comparison-templates': () => {
          postCount += 1;
          return json({ error: 'Konflik lain tanpa kode' }, 409);
        },
        'GET /api/comparison-templates': () => {
          getCount += 1;
          return json({ templates: [] });
        },
      });
      const store = useComparisonTemplatesStore();
      const outcome = await store.createTemplate(DRAFT);

      expect(outcome.ok).toBe(false);
      expect(outcome).toMatchObject({ kind: 'error' });
      expect(postCount).toBe(1);
      expect(getCount).toBe(0);
    });

    it('flows to failureToOutcome when SLUG_TAKEN retry attempts are exhausted', async () => {
      let postCount = 0;
      let getCount = 0;
      route({
        'POST /api/comparison-templates': () => {
          postCount += 1;
          return json({ error: 'Slug sudah dipakai', code: 'SLUG_TAKEN' }, 409);
        },
        'GET /api/comparison-templates': () => {
          getCount += 1;
          return json({ templates: [makeTemplate({ slug: `perbandingan-${getCount}` })] });
        },
      });
      const store = useComparisonTemplatesStore();
      const outcome = await store.createTemplate(DRAFT);

      expect(outcome.ok).toBe(false);
      expect(outcome).toMatchObject({ kind: 'error' });
      expect(postCount).toBe(4);
      expect(getCount).toBe(3);
    });

    it('sorts templates in store alphabetically by label and slug on creation and update', async () => {
      route({
        'POST /api/comparison-templates': () =>
          json({ template: makeTemplate({ id: 'tpl-1', slug: 'b-slug', label: 'B Label' }) }),
        'PATCH /api/comparison-templates/tpl-2': () =>
          json({ template: makeTemplate({ id: 'tpl-2', slug: 'a-slug', label: 'A Label' }) }),
      });
      const store = useComparisonTemplatesStore();
      store.templates = [
        makeTemplate({ id: 'tpl-2', slug: 'z-slug', label: 'Z Label' }),
        makeTemplate({ id: 'tpl-3', slug: 'm-slug', label: 'M Label' }),
      ];

      // Create 'B Label': should be inserted in sorted order: [M, Z] -> [B, M, Z]
      await store.createTemplate({ ...DRAFT, label: 'B Label' });
      expect(store.templates.map((t) => t.label)).toEqual(['B Label', 'M Label', 'Z Label']);

      // Update 'tpl-2' from 'Z Label' to 'A Label': should re-sort to [A, B, M]
      await store.updateTemplate('tpl-2', { ...DRAFT, label: 'A Label' }, '2026-01-02T00:00:00.000Z');
      expect(store.templates.map((t) => t.label)).toEqual(['A Label', 'B Label', 'M Label']);
    });

    it('uses slug as tie-breaker when labels are identical on replacement', async () => {
      route({
        'POST /api/comparison-templates': () =>
          json({ template: makeTemplate({ id: 'tpl-new', slug: 'alpha', label: 'Same Label' }) }),
      });
      const store = useComparisonTemplatesStore();
      store.templates = [
        makeTemplate({ id: 'tpl-existing', slug: 'beta', label: 'Same Label' }),
      ];

      await store.createTemplate({ ...DRAFT, label: 'Same Label' });
      expect(store.templates.map((t) => t.slug)).toEqual(['alpha', 'beta']);
    });
  });

  describe('describeTemplateFailure', () => {
    it('uses template-specific validation fallback when without fieldErrors', () => {
      const errNoFields = { status: 400, serverMessage: 'Body {trend} tidak valid' };
      const msg = describeTemplateFailure(errNoFields, 'menyimpan templat kalimat');
      expect(msg).toContain('Templat belum bisa disimpan. Periksa nama dan kalimatnya.');

      const plainFallback = describeTemplateFailure({ status: 400 }, '');
      expect(plainFallback).toBe('Templat belum bisa disimpan. Periksa nama dan kalimatnya.');
    });

    it('filters server messages containing hidden tokens or placeholder syntax', () => {
      const tokenErr = { status: 400, serverMessage: 'Kolom comparisonTemplateId salah' };
      expect(describeTemplateFailure(tokenErr, 'menyimpan templat kalimat')).toContain(
        'Templat belum bisa disimpan. Periksa nama dan kalimatnya.',
      );

      const placeholderErr = { status: 400, serverMessage: 'Gunakan {period_current} di awal' };
      expect(describeTemplateFailure(placeholderErr, 'menyimpan templat kalimat')).toContain(
        'Templat belum bisa disimpan. Periksa nama dan kalimatnya.',
      );
    });

    it('keeps plain Indonesian server messages in describeTemplateFailure', () => {
      const cleanErr = { status: 400, serverMessage: 'Kalimat perbandingan tidak boleh kosong.' };
      expect(describeTemplateFailure(cleanErr, 'menyimpan templat kalimat')).toContain(
        'Kalimat perbandingan tidak boleh kosong.',
      );
    });

    it('describes failures with approved wording whatever the error carries when fieldErrors exist', () => {
      const hostile = {
        status: 400,
        code: 'TREND_SLOT_MISSING',
        serverMessage: 'Body harus memuat {trend}',
        fieldErrors: { body: 'pakai {trend}' },
      };

      const message = describeTemplateFailure(hostile, 'menyimpan templat kalimat');

      expect(message).toBe(`Gagal menyimpan templat kalimat. ${USER_MESSAGES.validation}`);
    });
  });

  it('words the in-use message from the count', () => {
    expect(inUseMessage('Tahunan', 4)).toContain('masih dipakai 4 indikator');
    expect(inUseMessage('Tahunan', 0)).toContain('indikator lain');
  });
});
