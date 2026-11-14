import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useWeatherConfigStore } from '../stores/weatherConfig.store';
import { useAuditRetentionStore } from '../stores/auditRetention.store';
import { useSettingsStore } from '../stores/settings.store';
import { useMapsStore } from '../stores/maps';
import { useIndicatorsStore } from '../stores/indicators.store';
import { useIndicatorTablesStore } from '../stores/indicatorTables.store';
import { usePagesStore } from '../stores/pages.store';
import { useContentBlocksStore } from '../stores/contentBlocks.store';
import { useComparisonTemplatesStore } from '../stores/comparisonTemplates.store';
import { useCeritaAdminStore } from '../stores/ceritaAdmin.store';
import type { FailureKind } from '../utils/userMessages';

type Outcome = 403 | 500 | 'network' | 'ok';

/** Answers every request the same way, so one load can be driven through each outcome. */
function respondWith(outcome: Outcome, okBody: unknown): void {
  globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async () => {
    if (outcome === 'network') throw new TypeError('Failed to fetch');
    const ok = outcome === 'ok';
    return {
      ok,
      status: ok ? 200 : outcome,
      headers: new Headers(),
      json: async () => (ok ? okBody : { error: 'x' }),
    } as Response;
  });
}

interface Case {
  name: string;
  okBody: unknown;
  /** Runs the store's load and returns the current errorKind. */
  load: () => Promise<{ kind: FailureKind | null; message: string | null }>;
}

const cases: Case[] = [
  {
    name: 'weatherConfig.errorKind',
    okBody: {
      settings: { bmkgBaseUrl: 'x', cacheTtlMs: 1, staleRetryMs: 1, fetchTimeoutMs: 1 },
    },
    load: async () => {
      const s = useWeatherConfigStore();
      await s.fetchConfig();
      return { kind: s.errorKind, message: s.error };
    },
  },
  {
    name: 'auditRetention.errorKind',
    okBody: { retention: { info: 0, warning: 0, critical: 0 } },
    load: async () => {
      const s = useAuditRetentionStore();
      await s.fetchRetention();
      return { kind: s.errorKind, message: s.error };
    },
  },
  {
    name: 'settings.errorKind',
    okBody: { settings: { appName: 'SIDATA' } },
    load: async () => {
      const s = useSettingsStore();
      await s.fetchPublicSettings();
      return { kind: s.errorKind, message: s.error };
    },
  },
  {
    name: 'maps.errorKind',
    okBody: { points: [], total: 0 },
    load: async () => {
      const s = useMapsStore();
      await s.loadPoints();
      return { kind: s.errorKind, message: s.error };
    },
  },
  {
    name: 'indicators.errorKind',
    okBody: { indicators: [], total: 0 },
    load: async () => {
      const s = useIndicatorsStore();
      await s.fetchIndicators(true);
      return { kind: s.errorKind, message: s.error };
    },
  },
  {
    name: 'indicatorTables.errorKind',
    okBody: { tables: [], total: 0 },
    load: async () => {
      const s = useIndicatorTablesStore();
      await s.fetchTables(true);
      return { kind: s.errorKind, message: s.error };
    },
  },
  {
    name: 'pages.hierarchyErrorKind',
    okBody: { pages: [] },
    load: async () => {
      const s = usePagesStore();
      await s.fetchHierarchy(true);
      return { kind: s.hierarchyErrorKind, message: s.hierarchyError };
    },
  },
  {
    name: 'contentBlocks.errorKind',
    okBody: { blocks: [] },
    load: async () => {
      const s = useContentBlocksStore();
      await s.fetchBlocks(true);
      return { kind: s.errorKind, message: s.error };
    },
  },
  {
    name: 'comparisonTemplates.errorKind',
    okBody: { templates: [] },
    load: async () => {
      const s = useComparisonTemplatesStore();
      await s.fetchTemplates(true);
      return { kind: s.errorKind, message: s.error };
    },
  },
  {
    name: 'ceritaAdmin.loadErrorKind',
    okBody: { pages: [], blocks: [] },
    load: async () => {
      const s = useCeritaAdminStore();
      await s.load();
      return { kind: s.loadErrorKind, message: s.loadError };
    },
  },
];

describe.each(cases)('$name', ({ okBody, load }) => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it.each([
    [403, 'forbidden'],
    ['network', 'network'],
    [500, 'server'],
  ] as const)('is set for %s and cleared by a successful retry', async (outcome, kind) => {
    respondWith(outcome, okBody);
    const failed = await load();
    expect(failed.message).toBeTruthy();
    expect(failed.kind).toBe(kind);

    respondWith('ok', okBody);
    const recovered = await load();
    expect(recovered.message).toBeNull();
    expect(recovered.kind).toBeNull();
  });
});

describe('errorKind for non-HTTP failures', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('weather config: an unreadable payload is unknown', async () => {
    respondWith('ok', { settings: {} });
    const s = useWeatherConfigStore();
    await s.fetchConfig();
    expect(s.error).toContain('tidak dapat dibaca');
    expect(s.errorKind).toBe('unknown');
  });

  it('audit retention: an unreadable payload is unknown, a bad policy is validation', async () => {
    respondWith('ok', {});
    const s = useAuditRetentionStore();
    await s.fetchRetention();
    expect(s.errorKind).toBe('unknown');
    await s.updateRetention({ info: 60, warning: 30, critical: 90 });
    expect(s.errorKind).toBe('validation');
    s.clearMessages();
    expect(s.errorKind).toBeNull();
  });
});
