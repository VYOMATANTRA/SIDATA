import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h, ref, type Ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { useAuthenticatedBlobUrl } from '../composables/useAuthenticatedBlobUrl';
import { useAuthStore } from '../stores/auth';

interface Deferred {
  path: string;
  resolve: () => void;
  fail: () => void;
}

let created: string[];
let revoked: string[];
let requests: Deferred[];

function host(path: Ref<string | null>) {
  let exposed!: ReturnType<typeof useAuthenticatedBlobUrl>;
  const wrapper = mount(
    defineComponent({
      setup() {
        exposed = useAuthenticatedBlobUrl(path);
        return () => h('div');
      },
    }),
  );
  return { wrapper, state: exposed };
}

describe('useAuthenticatedBlobUrl', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useAuthStore().setAuth({ id: 'u', email: 'e@example.com', role: 'editor' }, 'token');
    created = [];
    revoked = [];
    requests = [];
    let counter = 0;
    URL.createObjectURL = () => {
      const url = `blob:test-${++counter}`;
      created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      revoked.push(url);
    };
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(
        (input) =>
          new Promise<Response>((resolve) => {
            requests.push({
              path: String(input),
              resolve: () =>
                resolve({ ok: true, status: 200, blob: async () => new Blob(['i']) } as Response),
              fail: () =>
                resolve({
                  ok: false,
                  status: 500,
                  json: async () => ({ error: 'x' }),
                } as Response),
            });
          }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function settle(index: number): Promise<void> {
    await vi.waitFor(() => expect(requests[index]).toBeDefined());
    requests[index]!.resolve();
    await flushPromises();
  }

  it('loads the first preview and revokes it on unmount', async () => {
    const path = ref<string | null>('/api/media/a/preview');
    const { wrapper, state } = host(path);
    expect(state.status.value).toBe('loading');
    expect(state.url.value).toBeNull();

    await settle(0);
    expect(state.url.value).toBe('blob:test-1');
    expect(state.status.value).toBe('ready');

    wrapper.unmount();
    expect(revoked).toEqual(['blob:test-1']);
  });

  it('keeps showing the old picture while the replacement loads, then swaps and revokes the old one', async () => {
    const path = ref<string | null>('/api/media/a/preview');
    const { wrapper, state } = host(path);
    await settle(0);

    path.value = '/api/media/b/preview';
    await flushPromises();
    // The new request is still pending: no blink, no revoke yet.
    expect(state.url.value).toBe('blob:test-1');
    expect(state.status.value).toBe('loading');
    expect(revoked).toEqual([]);

    await settle(1);
    expect(state.url.value).toBe('blob:test-2');
    expect(state.status.value).toBe('ready');
    expect(revoked).toEqual(['blob:test-1']);

    wrapper.unmount();
    expect(revoked).toEqual(['blob:test-1', 'blob:test-2']);
  });

  it('never lets a slow answer for an old path replace the current one', async () => {
    const path = ref<string | null>('/api/media/a/preview');
    const { wrapper, state } = host(path);
    await vi.waitFor(() => expect(requests[0]).toBeDefined());

    path.value = '/api/media/b/preview';
    await flushPromises();
    await settle(1);
    expect(state.url.value).toBe('blob:test-1');

    requests[0]!.resolve(); // the first, slower answer arrives last
    await flushPromises();
    expect(state.url.value).toBe('blob:test-1');
    expect(created).toHaveLength(1);
    wrapper.unmount();
  });

  it('drops the old picture when the replacement cannot be loaded, and when the path is cleared', async () => {
    const path = ref<string | null>('/api/media/a/preview');
    const { wrapper, state } = host(path);
    await settle(0);

    path.value = '/api/media/b/preview';
    await flushPromises();
    await vi.waitFor(() => expect(requests[1]).toBeDefined());
    requests[1]!.fail();
    await flushPromises();
    // A different file failed: showing the previous one as if it were this one would mislead.
    expect(state.status.value).toBe('error');
    expect(state.url.value).toBeNull();
    expect(revoked).toEqual(['blob:test-1']);

    path.value = null;
    await flushPromises();
    expect(state.status.value).toBe('idle');
    wrapper.unmount();
  });

  it('clears the picture at once when the path is removed', async () => {
    const path = ref<string | null>('/api/media/a/preview');
    const { wrapper, state } = host(path);
    await settle(0);

    path.value = null;
    await flushPromises();

    expect(state.url.value).toBeNull();
    expect(state.status.value).toBe('idle');
    expect(revoked).toEqual(['blob:test-1']);
    wrapper.unmount();
  });
});
