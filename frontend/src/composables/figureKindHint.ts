import { ref } from 'vue';

/**
 * A one-shot hand-off from "Tambah bagian baru" (the chapter overview) to the section figure
 * editor. The overview sets the kind the editor picked before it opens the new section; the figure
 * editor reads it once when it mounts with `consumePendingFigureKind()`, which also clears it, so
 * a later section is never preselected by mistake.
 *
 * Kinds: `photo` (1 gambar), `photos-2` (2 gambar), `gallery` (Galeri, 3 or more photos) and
 * `chart` (Grafik, from a table in the Data menu). `null` means no hint.
 */
export type PendingFigureKind = 'photo' | 'photos-2' | 'gallery' | 'chart';

export const pendingFigureKind = ref<PendingFigureKind | null>(null);

/** Returns the pending kind and clears it, so it is used at most once. */
export function consumePendingFigureKind(): PendingFigureKind | null {
  const kind = pendingFigureKind.value;
  pendingFigureKind.value = null;
  return kind;
}
