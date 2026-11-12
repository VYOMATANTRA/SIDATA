import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { fetchMediaPreviewBlob } from '../services/media.service';

export type BlobUrlStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Turns an API path that needs the `Authorization` header (the editor media preview) into a blob
 * URL an `<img>` can show. A bare `<img src>` to such a path would get 401.
 *
 * The previous blob URL stays in place while a replacement loads and is revoked once the new one
 * is ready (or the path is cleared, a load fails, or the component unmounts). A slow response for an
 * old path can never replace the URL of the current one.
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
    const source = path.value;
    if (!source) {
      revoke();
      status.value = 'idle';
      return;
    }
    // The previous picture stays on screen (and is not revoked) until the new one has arrived, so
    // replacing a photo does not blink. A failed load drops it: it belongs to a different file.
    status.value = 'loading';
    try {
      const blob = await fetchMediaPreviewBlob(source);
      if (current !== generation) return;
      const next = URL.createObjectURL(blob);
      revoke();
      url.value = next;
      status.value = 'ready';
    } catch {
      if (current !== generation) return;
      revoke();
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
