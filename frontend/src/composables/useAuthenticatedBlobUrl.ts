import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { fetchMediaPreviewBlob } from '../services/media.service';

export type BlobUrlStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Turns an API path that needs the `Authorization` header (the editor media preview) into a blob
 * URL an `<img>` can show. A bare `<img src>` to such a path would get 401.
 *
 * The previous blob URL is revoked whenever the path changes and on unmount, and a slow response
 * for an old path can never replace the URL of the current one.
 */
export function useAuthenticatedBlobUrl(path: Ref<string | null | undefined>): {
  url: Ref<string | null>;
  status: Ref<BlobUrlStatus>;
  retry: () => void;
} {
  const url = ref<string | null>(null);
  const status = ref<BlobUrlStatus>('idle');
  let generation = 0;

  function revoke(): void {
    if (url.value) {
      URL.revokeObjectURL(url.value);
      url.value = null;
    }
  }

  async function load(): Promise<void> {
    const current = ++generation;
    revoke();
    const source = path.value;
    if (!source) {
      status.value = 'idle';
      return;
    }
    status.value = 'loading';
    try {
      const blob = await fetchMediaPreviewBlob(source);
      if (current !== generation) return;
      url.value = URL.createObjectURL(blob);
      status.value = 'ready';
    } catch {
      if (current !== generation) return;
      status.value = 'error';
    }
  }

  watch(path, () => void load(), { immediate: true });

  onBeforeUnmount(() => {
    generation++;
    revoke();
  });

  return { url, status, retry: () => void load() };
}
