import { describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import { useCardDragReorder } from '../composables/useCardDragReorder';

function setup(order: string[], blocked: 'search' | 'busy' | null = null) {
  const orderRef = ref(order);
  const blockRef = ref<'search' | 'busy' | null>(blocked);
  const onMove = vi.fn<(key: string, toIndex: number) => void>();
  const drag = useCardDragReorder({
    order: computed(() => orderRef.value),
    blocked: computed(() => blockRef.value),
    onMove,
  });
  return { drag, onMove, blockRef };
}

describe('useCardDragReorder', () => {
  it('moves a card after a card below it, to the index in the full order', () => {
    const { drag, onMove } = setup(['a', 'b', 'c']);
    drag.startDrag('a');
    drag.dropOn('c', 'after');
    expect(onMove).toHaveBeenCalledWith('a', 2);
  });

  it('moves a card before a card above it', () => {
    const { drag, onMove } = setup(['a', 'b', 'c']);
    drag.startDrag('c');
    drag.dropOn('a', 'before');
    expect(onMove).toHaveBeenCalledWith('c', 0);
  });

  it('does nothing when the drop would leave the card where it is', () => {
    const { drag, onMove } = setup(['a', 'b', 'c']);
    drag.startDrag('b');
    drag.dropOn('b', 'after');
    drag.startDrag('b');
    drag.dropOn('a', 'after');
    expect(onMove).not.toHaveBeenCalled();
  });

  it('drops after the last card to the end of the list', () => {
    const { drag, onMove } = setup(['a', 'b', 'c']);
    drag.startDrag('a');
    drag.hoverEnd();
    expect(drag.dropAtEnd.value).toBe(true);
    drag.dropEnd();
    expect(onMove).toHaveBeenCalledWith('a', 2);
    expect(drag.dragKey.value).toBeNull();
    expect(drag.dropAtEnd.value).toBe(false);
  });

  it('does not move when the last card is dropped on the end zone', () => {
    const { drag, onMove } = setup(['a', 'b']);
    drag.startDrag('b');
    drag.dropEnd();
    expect(onMove).not.toHaveBeenCalled();
  });

  it('will not start a drag while blocked (a search, filter or save)', () => {
    const { drag, blockRef } = setup(['a', 'b'], 'search');
    drag.startDrag('a');
    expect(drag.dragKey.value).toBeNull();
    blockRef.value = null;
    drag.startDrag('a');
    expect(drag.dragKey.value).toBe('a');
  });

  it('tracks the hovered card and side, and clears on drop', () => {
    const { drag } = setup(['a', 'b']);
    drag.startDrag('a');
    drag.hoverDrop('b', 'before');
    expect(drag.dropTarget.value).toEqual({ key: 'b', edge: 'before' });
    drag.hoverDrop('a', 'after');
    expect(drag.dropTarget.value).toBeNull();
    drag.clearDrag();
    expect(drag.dragKey.value).toBeNull();
  });
});
