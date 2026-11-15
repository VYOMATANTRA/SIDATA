import { ref, type ComputedRef, type Ref } from 'vue';

export type DropEdge = 'before' | 'after';
/** Why dragging is off right now: a search or filter hides part of the order, or a save is running. */
export type DragBlock = 'search' | 'busy' | null;

/** Upper half of a card means "before it", lower half "after it". */
export function edgeAt(event: DragEvent): DropEdge {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  return event.clientY < box.top + box.height / 2 ? 'before' : 'after';
}

export interface CardDragOptions {
  /** Keys in the full display order, before any search or filter. */
  order: ComputedRef<readonly string[]>;
  blocked: ComputedRef<DragBlock>;
  /** Saves the move: `key` goes to `toIndex` (0-based, full order). Called only for a real move. */
  onMove: (key: string, toIndex: number) => void;
}

/**
 * Drag state for a card list reordered by its grips. The view supplies the order and the save; this
 * only tracks the card in flight, the card it hovers and the side, and turns a drop into an index in
 * the full order (a search filter cannot shift the result). Naik / Turun reach the same save from the
 * keyboard and on touch.
 */
export function useCardDragReorder(options: CardDragOptions): {
  dragKey: Ref<string | null>;
  dropTarget: Ref<{ key: string; edge: DropEdge } | null>;
  dropAtEnd: Ref<boolean>;
  clearDrag: () => void;
  startDrag: (key: string) => void;
  hoverDrop: (key: string, edge: DropEdge) => void;
  hoverEnd: () => void;
  dropOn: (key: string, edge: DropEdge) => void;
  dropEnd: () => void;
} {
  const dragKey = ref<string | null>(null);
  const dropTarget = ref<{ key: string; edge: DropEdge } | null>(null);
  const dropAtEnd = ref(false);

  function clearDrag(): void {
    dragKey.value = null;
    dropTarget.value = null;
    dropAtEnd.value = false;
  }

  function startDrag(key: string): void {
    if (options.blocked.value) return;
    dragKey.value = key;
    dropTarget.value = null;
  }

  function hoverDrop(key: string, edge: DropEdge): void {
    dropAtEnd.value = false;
    if (!dragKey.value || dragKey.value === key) {
      dropTarget.value = null;
      return;
    }
    dropTarget.value = { key, edge };
  }

  function hoverEnd(): void {
    dropTarget.value = null;
    dropAtEnd.value = dragKey.value !== null;
  }

  function dropOn(key: string, edge: DropEdge): void {
    const dragged = dragKey.value;
    clearDrag();
    if (!dragged || dragged === key) return;
    const order = options.order.value;
    const from = order.indexOf(dragged);
    const anchor = order.indexOf(key);
    if (from < 0 || anchor < 0) return;
    let toIndex = edge === 'before' ? anchor : anchor + 1;
    if (from < toIndex) toIndex -= 1;
    if (toIndex !== from) options.onMove(dragged, toIndex);
  }

  function dropEnd(): void {
    const dragged = dragKey.value;
    clearDrag();
    if (!dragged) return;
    const order = options.order.value;
    const last = order[order.length - 1];
    if (last === undefined || last === dragged) return;
    options.onMove(dragged, order.length - 1);
  }

  return {
    dragKey,
    dropTarget,
    dropAtEnd,
    clearDrag,
    startDrag,
    hoverDrop,
    hoverEnd,
    dropOn,
    dropEnd,
  };
}
