import { nextTick, ref, type Ref } from 'vue';
import type { ContentBlock } from '../../../stores/contentBlocks.store';

/** What every block form emits on save. `metadata` is omitted when the block has none to edit. */
export interface BlockSavePayload {
  title: string | null;
  body: string;
  metadata?: Record<string, unknown> | null;
}

/** Props shared by every per-block form and by the dispatcher in `ContentBlockForm.vue`. */
export interface BlockFormProps {
  block: ContentBlock;
  busy?: boolean;
  /** Approved failure text from the save request; shown in the error summary. */
  serverError?: string;
  idPrefix?: string;
  /** True after a save was refused because someone else saved the block first. */
  stale?: boolean;
  /** "Tampil di: …" line for the dialog header. */
  placement?: string;
  /** False when no public page reads the block (decision D1). */
  shownOnSite?: boolean;
}

export const BLOCK_FORM_DEFAULTS = {
  busy: false,
  serverError: '',
  idPrefix: 'block',
  stale: false,
  placement: '',
  shownOnSite: true,
} as const;

export interface FormErrorEntry {
  fieldId: string;
  message: string;
}

export const BODY_MAX_LENGTH = 50000;
export const TITLE_MAX_LENGTH = 255;

/** Shared title/body rules, identical for every block (backend `updateContentBlockSchema`). */
export function validateTitleBody(title: string, body: string): { title?: string; body?: string } {
  const errors: { title?: string; body?: string } = {};
  if (!body.trim()) {
    errors.body = 'Isi konten wajib diisi dan tidak boleh hanya berupa spasi.';
  } else if (body.length > BODY_MAX_LENGTH) {
    errors.body = 'Isi konten maksimal 50.000 karakter.';
  }
  if (title && title.length > TITLE_MAX_LENGTH) {
    errors.title = 'Judul maksimal 255 karakter.';
  }
  return errors;
}

/** Summary entries for the title/body errors, in field order. */
export function titleBodyEntries(
  idPrefix: string,
  errors: { title?: string; body?: string },
): FormErrorEntry[] {
  const entries: FormErrorEntry[] = [];
  if (errors.title) entries.push({ fieldId: `${idPrefix}-title`, message: errors.title });
  if (errors.body) entries.push({ fieldId: `${idPrefix}-body`, message: errors.body });
  return entries;
}

/** Reads a string from untyped stored metadata without ever throwing. */
export function readString(meta: Record<string, unknown> | null | undefined, key: string): string {
  const value = meta?.[key];
  return typeof value === 'string' ? value : '';
}

let nextRowUid = 1;

export interface RepeatableRowIds {
  /** Id of the first field of the row at `index` (focus target after adding a row). */
  firstField: (index: number) => string;
  moveUp: (index: number) => string;
  moveDown: (index: number) => string;
  /** The "Tambah" button, focused after a row is removed. */
  add: string;
}

export interface RepeatableRowsOptions<T extends object> {
  max: number;
  makeEmpty: () => T;
  ids: RepeatableRowIds;
  /** Singular noun for the live announcements, e.g. "poin" or "publikasi". */
  noun: string;
}

export type KeyedRow<T extends object> = T & { uid: number };

/**
 * Add / remove / move for a repeatable list of editable rows. Rows carry a client-side `uid`
 * (used as the `v-for` key, never sent to the server) so a reorder moves the DOM nodes and their
 * drafts together. Every action updates a live-region message and hands keyboard focus to a
 * sensible control, because a button that moves or disappears would otherwise drop focus to
 * `<body>` (docs/ACCESSIBILITY.md §4).
 */
export function useRepeatableRows<T extends object>(
  initial: T[],
  options: RepeatableRowsOptions<T>,
): {
  rows: Ref<KeyedRow<T>[]>;
  announcement: Ref<string>;
  isFull: () => boolean;
  add: () => void;
  remove: (index: number) => void;
  move: (index: number, direction: -1 | 1) => void;
} {
  const rows = ref(initial.map((row) => ({ ...row, uid: nextRowUid++ }))) as Ref<KeyedRow<T>[]>;
  const announcement = ref('');

  function focusId(id: string): void {
    void nextTick(() => {
      const element = typeof document === 'undefined' ? null : document.getElementById(id);
      if (element instanceof HTMLElement) element.focus();
    });
  }

  function isFull(): boolean {
    return rows.value.length >= options.max;
  }

  function add(): void {
    if (isFull()) return;
    rows.value = [...rows.value, { ...options.makeEmpty(), uid: nextRowUid++ }];
    const index = rows.value.length - 1;
    announcement.value = `Baris ${options.noun} ${index + 1} ditambahkan.`;
    focusId(options.ids.firstField(index));
  }

  function remove(index: number): void {
    if (index < 0 || index >= rows.value.length) return;
    rows.value = rows.value.filter((_, i) => i !== index);
    announcement.value = `Baris ${options.noun} ${index + 1} dihapus. Tersisa ${rows.value.length}.`;
    focusId(options.ids.add);
  }

  function move(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (index < 0 || index >= rows.value.length || target < 0 || target >= rows.value.length) {
      return;
    }
    const next = [...rows.value];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    rows.value = next;
    announcement.value = `Baris ${options.noun} dipindah ke urutan ${target + 1} dari ${next.length}.`;
    // Keep focus on the same kind of control. At the end of the list that control is disabled,
    // so fall back to the opposite direction's button on the moved row.
    const sameDirectionAvailable = direction === -1 ? target > 0 : target < next.length - 1;
    const id =
      direction === -1
        ? sameDirectionAvailable
          ? options.ids.moveUp(target)
          : options.ids.moveDown(target)
        : sameDirectionAvailable
          ? options.ids.moveDown(target)
          : options.ids.moveUp(target);
    focusId(id);
  }

  return { rows, announcement, isFull, add, remove, move };
}
