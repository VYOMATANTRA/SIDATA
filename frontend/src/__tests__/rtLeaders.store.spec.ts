import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { RT_LEADERS_CACHE_TTL_MS, useRtLeadersStore } from '../stores/rtLeaders.store';

const roster = (isSampleRoster: boolean) => ({
  leaders: [
    {
      rtNumber: 1,
      name: isSampleRoster ? 'Ketua RT 01' : 'Bu Sari',
      phone: '—',
      phoneIsWhatsapp: false,
    },
  ],
  isSampleRoster,
});

describe('rtLeaders store freshness', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-05T00:00:00Z'));
    vi.stubGlobal('fetch', vi.fn());
  });

  it('caches successful responses within TTL and refreshes rows with the sample flag after expiry', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => roster(true) } as Response);
    const store = useRtLeadersStore();
    await store.fetchRtLeaders();
    expect(store.isSampleRoster).toBe(true);

    vi.advanceTimersByTime(RT_LEADERS_CACHE_TTL_MS - 1_500);
    await store.fetchRtLeaders();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_500);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => roster(false) } as Response);
    await store.fetchRtLeaders();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(store.isSampleRoster).toBe(false);
    expect(store.rtLeaders[0]?.name).toBe('Bu Sari');
  });

  it('preserves the last good roster and sample flag on a failed refresh', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => roster(true) } as Response);
    const store = useRtLeadersStore();
    await store.fetchRtLeaders();
    vi.advanceTimersByTime(RT_LEADERS_CACHE_TTL_MS);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 } as Response);
    await store.fetchRtLeaders();
    expect(store.isSampleRoster).toBe(true);
    expect(store.rtLeaders[0]?.name).toBe('Ketua RT 01');
    expect(store.error).toContain('503');
  });

  it('caches successful empty responses', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ leaders: [], isSampleRoster: false }),
    } as Response);
    const store = useRtLeadersStore();
    await store.fetchRtLeaders();
    await store.fetchRtLeaders();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
