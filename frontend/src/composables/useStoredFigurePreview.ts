import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue';
import type { ArticleFigure, ArticlePhoto } from '../types/ceritaArticle';
import { fetchMediaPreviewBlob, mediaPreviewPath } from '../services/media.service';

const PUBLIC_MEDIA_PATH = /^\/api\/media\/([0-9a-f-]{36})$/i;

/** The media id behind a public photo address (`/api/media/<id>`), or null. */
export function mediaIdOf(src: string | undefined): string | null {
  const match = src ? PUBLIC_MEDIA_PATH.exec(src) : null;
  return match ? match[1]!.toLowerCase() : null;
}

/** Every media id a figure shows, in order, without repeats. */
export function mediaIdsOf(figure: ArticleFigure): string[] {
  const srcs: Array<string | undefined> =
    figure.kind === 'photo'
      ? [figure.photo.src]
      : figure.kind === 'photos'
        ? figure.photos.map((photo) => photo.src)
        : figure.kind === 'diagram'
          ? [figure.src]
          : [];
  const ids = srcs.map(mediaIdOf).filter((id): id is string => id !== null);
  return [...new Set(ids)];
}

/** Replaces each photo address with the blob URL for its media id (`urlFor` returns '' if none). */
function withSources(figure: ArticleFigure, urlFor: (id: string) => string): ArticleFigure {
  const photoOf = (photo: ArticlePhoto): ArticlePhoto => ({
    ...photo,
    src: urlFor(mediaIdOf(photo.src) ?? ''),
  });
  switch (figure.kind) {
    case 'photo':
      return { ...figure, photo: photoOf(figure.photo) };
    case 'photos':
      return { ...figure, photos: figure.photos.map(photoOf) };
    case 'diagram': {
      if (!figure.src) return figure;
      return { ...figure, src: urlFor(mediaIdOf(figure.src) ?? '') };
    }
    case 'chart':
      return figure;
  }
}

export interface StoredFigurePreview {
  /** The figure with blob URLs for its photos; photos not loaded yet are left out by the figure. */
  figure: ComputedRef<ArticleFigure | null>;
  /** Photos are being fetched. */
  loading: Ref<boolean>;
  /** At least one photo could not be fetched (missing, deleted or offline). */
  unavailable: ComputedRef<boolean>;
}

/**
 * Loads the photos of a stored figure for the editor's live preview. Each photo is fetched with the
 * authenticated client from the editor preview route and shown as a blob URL, because a bare
 * `<img src>` to the API would get 401 for an editor's session. Fetched photos are kept while the
 * figure still uses them, and every blob URL is revoked when the preview goes away.
 */
export function useStoredFigurePreview(source: Ref<ArticleFigure | null>): StoredFigurePreview {
  const urls = ref<Record<string, string>>({});
  const loading = ref(false);
  let generation = 0;

  function revoke(id: string): void {
    const url = urls.value[id];
    if (url) URL.revokeObjectURL(url);
  }

  watch(
    source,
    async (figure) => {
      const current = ++generation;
      const ids = figure ? mediaIdsOf(figure) : [];
      const kept: Record<string, string> = {};
      for (const [id, url] of Object.entries(urls.value)) {
        if (ids.includes(id)) kept[id] = url;
        else URL.revokeObjectURL(url);
      }
      urls.value = kept;

      const missing = ids.filter((id) => !(id in kept));
      loading.value = missing.length > 0;
      await Promise.all(
        missing.map(async (id) => {
          try {
            const blob = await fetchMediaPreviewBlob(mediaPreviewPath(id));
            if (current !== generation) return;
            urls.value = { ...urls.value, [id]: URL.createObjectURL(blob) };
          } catch {
            // Left out: the figure drops the photo and `unavailable` says so.
          }
        }),
      );
      if (current === generation) loading.value = false;
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    generation++;
    for (const id of Object.keys(urls.value)) revoke(id);
    urls.value = {};
  });

  const figure = computed<ArticleFigure | null>(() => {
    const current = source.value;
    if (!current) return null;
    return withSources(current, (id) => urls.value[id] ?? '');
  });

  const unavailable = computed(() => {
    if (loading.value || !source.value) return false;
    return mediaIdsOf(source.value).some((id) => !(id in urls.value));
  });

  return { figure, loading, unavailable };
}
