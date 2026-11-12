import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createPoint, deletePoint, updatePoint } from '../services/adminMaps.service';

interface Call {
  url: string;
  method: string;
  body: unknown;
}

describe('adminMaps.service', () => {
  let calls: Call[];

  beforeEach(() => {
    setActivePinia(createPinia());
    calls = [];
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/auth/csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response;
      }
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return { ok: true, json: async () => ({ point: { id: 'p1', name: 'Titik' } }) } as Response;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a point with the full payload and returns the saved point', async () => {
    const saved = await createPoint({
      name: 'Bank Sampah Mawar',
      type: 'bank_sampah',
      latitude: -1.2,
      longitude: 116.9,
      rts: [30, 72],
    });
    expect(saved).toMatchObject({ id: 'p1' });
    expect(calls).toEqual([
      {
        url: '/api/maps/points',
        method: 'POST',
        body: {
          name: 'Bank Sampah Mawar',
          type: 'bank_sampah',
          latitude: -1.2,
          longitude: 116.9,
          rts: [30, 72],
        },
      },
    ]);
  });

  it('patches only what it is given and sends expectedRtNumber for an RT-owned point', async () => {
    await updatePoint('p/1', { name: 'Baru' }, 7);
    expect(calls[0]).toEqual({
      url: '/api/maps/points/p%2F1?expectedRtNumber=7',
      method: 'PATCH',
      body: { name: 'Baru' },
    });
  });

  it('omits expectedRtNumber when the point does not own an RT', async () => {
    await updatePoint('p1', { rts: [1, 2] });
    await deletePoint('p1');
    expect(calls.map((call) => call.url)).toEqual(['/api/maps/points/p1', '/api/maps/points/p1']);
    expect(calls[1]?.method).toBe('DELETE');
  });

  it('deletes with expectedRtNumber for an RT-owned point', async () => {
    await deletePoint('p1', 12);
    expect(calls[0]).toMatchObject({
      url: '/api/maps/points/p1?expectedRtNumber=12',
      method: 'DELETE',
    });
  });
});
