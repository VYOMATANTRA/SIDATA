import { computed, nextTick, ref, watch, type ComputedRef, type Ref } from 'vue';

/**
 * The instruction a grip button describes itself with (aria-describedby), so a keyboard user hears
 * how the reorder works without a visible hint.
 */
export const REORDER_HELP =
  'Tekan Spasi untuk mengangkat, panah atas atau bawah untuk memindah, Spasi untuk menjatuhkan, Escape untuk membatalkan.';

/** What a move reports: `false` when it was refused or failed; anything else counts as done. */
export type ReorderResult = boolean | void;

export interface KeyboardReorderOptions {
  /** Keys in the full display order, before any preview. */
  order: ComputedRef<readonly string[]>;
  /** A save is running: a new pick-up is refused. */
  blocked: ComputedRef<boolean>;
  /** Name of an item as it reads when picked up, e.g. "Bagian 1.3" or "Bab 2". */
  label: (key: string) => string;
  /** Noun used in the drop announcement, e.g. "Bagian" ("Bagian dipindahkan ke posisi 2 dari 3."). */
  noun: string;
  /**
   * Saves the move: `key` goes to `toIndex` (0-based, full order). Called only for a real move.
   * Return `false` (or a promise of it) when the move was refused or failed; the list then goes back
   * to its real order. A draft move returns nothing.
   */
  onMove: (key: string, toIndex: number) => ReorderResult | Promise<ReorderResult>;
  /** Runs when a keyboard move ends: dropped and settled, cancelled, or cancelled by a list change. */
  onFinish?: () => void;
}

export type KeyboardEdge = 'before' | 'after';

/**
 * Keyboard ordering for a grip button (WCAG 2.1.1), the keyboard twin of `useCardDragReorder`.
 * Space or Enter picks the item up; ArrowUp and ArrowDown move it one place, and the list previews
 * that place at once (renumbered by the caller through `arrange`); Space or Enter drops it and
 * saves through `onMove`; Escape cancels, and so does moving focus away or a change to the list
 * while the item is carried. Every step is announced in `announcement`, which the list renders in
 * a polite live region.
 *
 * While a dropped move is being saved its order stays on screen, so the grip keeps its focus. The
 * preview ends when the save settles: on success the store already shows the same order; on refusal
 * or failure the real order returns and the grip gets focus back.
 */
export function useKeyboardReorder(options: KeyboardReorderOptions): {
  carriedKey: Ref<string | null>;
  announcement: Ref<string>;
  isCarried: (key: string) => boolean;
  /** Where the carried item (or a saved drop being saved) sits, as a border edge; null otherwise. */
  edgeOf: (key: string) => KeyboardEdge | null;
  /** The items in the order to show: the committed order with any preview applied. */
  arrange: <T>(items: readonly T[], keyOf: (item: T) => string) => T[];
  onGripKeydown: (event: KeyboardEvent, key: string) => void;
  onGripBlur: (event: FocusEvent, key: string) => void;
} {
  const carriedKey = ref<string | null>(null);
  const carriedFrom = ref(0);
  const carriedTo = ref(0);
  /** The order when the item was picked up; a different order later cancels the carry. */
  let carriedSnapshot = '';
  /** A dropped move whose save is still running: its order is shown until the save settles. */
  const settling = ref<{ key: string; index: number } | null>(null);
  const announcement = ref('');
  /** The grip that holds the item; focus returns to it after each step. */
  let grip: HTMLElement | null = null;

  const preview = computed<{ key: string; index: number } | null>(() => {
    if (carriedKey.value !== null) return { key: carriedKey.value, index: carriedTo.value };
    return settling.value;
  });

  const previewKeys = computed<string[]>(() => {
    const keys = [...options.order.value];
    const active = preview.value;
    if (!active) return keys;
    const from = keys.indexOf(active.key);
    if (from < 0) return keys;
    keys.splice(from, 1);
    keys.splice(Math.min(Math.max(active.index, 0), keys.length), 0, active.key);
    return keys;
  });

  function focusGrip(): void {
    void nextTick(() => grip?.focus());
  }

  function finish(): void {
    options.onFinish?.();
  }

  // A change to the list while an item is carried (a store refresh, a deletion) makes the carried
  // position meaningless: the carry is cancelled and the user is told why.
  watch(
    () => options.order.value.join('\u0001'),
    (keys) => {
      if (carriedKey.value === null || keys === carriedSnapshot) return;
      carriedKey.value = null;
      carriedTo.value = carriedFrom.value;
      announcement.value = 'Urutan berubah saat dipindahkan. Pemindahan dibatalkan.';
      finish();
    },
  );

  function isCarried(key: string): boolean {
    return carriedKey.value === key;
  }

  function edgeOf(key: string): KeyboardEdge | null {
    if (carriedKey.value !== key || carriedTo.value === carriedFrom.value) return null;
    // Moved up: the line sits under the item it passed; moved down: above it.
    return carriedTo.value < carriedFrom.value ? 'after' : 'before';
  }

  function arrange<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
    const keys = previewKeys.value;
    if (keys.length !== items.length) return [...items];
    const byKey = new Map(items.map((item) => [keyOf(item), item] as const));
    const result: T[] = [];
    for (const key of keys) {
      const item = byKey.get(key);
      if (item === undefined) return [...items];
      result.push(item);
    }
    return result;
  }

  function pickUp(event: KeyboardEvent, key: string): void {
    const order = options.order.value;
    const from = order.indexOf(key);
    if (options.blocked.value || from < 0) return;
    grip = event.currentTarget as HTMLElement;
    settling.value = null;
    carriedKey.value = key;
    carriedFrom.value = from;
    carriedTo.value = from;
    carriedSnapshot = order.join('\u0001');
    announcement.value = `${options.label(key)} diangkat. Posisi ${from + 1} dari ${order.length}.`;
  }

  function moveBy(delta: -1 | 1): void {
    if (carriedKey.value === null) return;
    const total = options.order.value.length;
    const next = carriedTo.value + delta;
    if (next < 0 || next >= total) {
      announcement.value = `Sudah di posisi ${carriedTo.value + 1} dari ${total}.`;
      return;
    }
    carriedTo.value = next;
    announcement.value = `Posisi ${next + 1} dari ${total}.`;
    focusGrip();
  }

  function drop(): void {
    const key = carriedKey.value;
    if (key === null) return;
    const from = carriedFrom.value;
    const to = carriedTo.value;
    const total = options.order.value.length;
    carriedKey.value = null;
    if (to === from) {
      announcement.value = `Posisi tidak berubah: ${to + 1} dari ${total}.`;
      focusGrip();
      finish();
      return;
    }
    settling.value = { key, index: to };
    announcement.value = `${options.noun} dipindahkan ke posisi ${to + 1} dari ${total}.`;
    focusGrip();
    const result = options.onMove(key, to);
    void Promise.resolve(result).then((ok) => {
      settling.value = null;
      if (ok === false) {
        announcement.value = 'Gagal memindahkan. Urutan dikembalikan.';
        focusGrip();
      }
      finish();
    });
  }

  // Escape puts focus back on the grip; a blur-cancel must leave focus where the user put it.
  function cancel(restoreFocus = true): void {
    if (carriedKey.value === null) return;
    carriedKey.value = null;
    carriedTo.value = carriedFrom.value;
    announcement.value = 'Dibatalkan.';
    if (restoreFocus) focusGrip();
    finish();
  }

  function onGripKeydown(event: KeyboardEvent, key: string): void {
    const carried = carriedKey.value;
    if (carried !== null) {
      if (carried !== key) return;
      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          moveBy(-1);
          return;
        case 'ArrowDown':
          event.preventDefault();
          moveBy(1);
          return;
        case ' ':
        case 'Spacebar':
        case 'Enter':
          event.preventDefault();
          drop();
          return;
        case 'Escape':
        case 'Esc':
          event.preventDefault();
          cancel();
          return;
        default:
          return;
      }
    }
    if (event.key === ' ' || event.key === 'Spacebar' || event.key === 'Enter') {
      event.preventDefault();
      pickUp(event, key);
    }
  }

  function onGripBlur(event: FocusEvent, key: string): void {
    if (carriedKey.value !== key) return;
    const element = event.currentTarget as HTMLElement;
    // Let a list re-render (which can move the grip in the DOM) settle first, then check focus.
    void nextTick(() => {
      if (carriedKey.value === key && document.activeElement !== element) cancel(false);
    });
  }

  return {
    carriedKey,
    announcement,
    isCarried,
    edgeOf,
    arrange,
    onGripKeydown,
    onGripBlur,
  };
}
