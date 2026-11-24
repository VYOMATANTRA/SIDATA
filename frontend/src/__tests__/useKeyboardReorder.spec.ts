import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref } from 'vue';
import { useKeyboardReorder } from '../composables/useKeyboardReorder';

interface Setup {
  kb: ReturnType<typeof useKeyboardReorder>;
  onMove: ReturnType<typeof vi.fn<(key: string, toIndex: number) => void>>;
  orderRef: { value: string[] };
  blockRef: { value: boolean };
  grip: HTMLButtonElement;
}

/** A grip button in the document, wired like the real component: keydown and blur go to the composable. */
function setup(order: string[], blocked = false): Setup {
  const orderRef = ref(order);
  const blockRef = ref(blocked);
  const onMove = vi.fn<(key: string, toIndex: number) => void>();
  const kb = useKeyboardReorder({
    order: computed(() => orderRef.value),
    blocked: computed(() => blockRef.value),
    label: (key) => `Bagian ${key}`,
    noun: 'Bagian',
    onMove,
  });
  const grip = document.createElement('button');
  grip.textContent = 'grip';
  document.body.appendChild(grip);
  grip.addEventListener('keydown', (event) => kb.onGripKeydown(event, 'b'));
  grip.addEventListener('blur', (event) => kb.onGripBlur(event, 'b'));
  return { kb, onMove, orderRef, blockRef, grip };
}

function press(target: HTMLElement, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useKeyboardReorder', () => {
  it('picks up with Space or Enter, moves with the arrows and drops with Space, saving the new index', async () => {
    const { kb, onMove, grip } = setup(['a', 'b', 'c']);
    grip.focus();
    press(grip, ' ');
    expect(kb.isCarried('b')).toBe(true);
    expect(kb.announcement.value).toBe('Bagian b diangkat. Posisi 2 dari 3.');

    press(grip, 'ArrowDown');
    expect(kb.announcement.value).toBe('Posisi 3 dari 3.');
    press(grip, 'ArrowUp');
    press(grip, 'ArrowUp');
    expect(kb.announcement.value).toBe('Posisi 1 dari 3.');

    press(grip, 'ArrowDown');
    press(grip, 'ArrowDown');
    press(grip, 'Enter');
    expect(onMove).toHaveBeenCalledWith('b', 2);
    expect(kb.announcement.value).toBe('Bagian dipindahkan ke posisi 3 dari 3.');
    expect(kb.isCarried('b')).toBe(false);
    await nextTick();
  });

  it('previews the carried item in its new place through arrange, and keeps the other items in order', () => {
    const { kb, grip } = setup(['a', 'b', 'c']);
    const items = [
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
      { id: 'c', n: 3 },
    ];
    press(grip, ' ');
    expect(kb.arrange(items, (item) => item.id).map((item) => item.id)).toEqual(['a', 'b', 'c']);
    press(grip, 'ArrowUp');
    expect(kb.arrange(items, (item) => item.id).map((item) => item.id)).toEqual(['b', 'a', 'c']);
    press(grip, 'ArrowUp');
    expect(kb.arrange(items, (item) => item.id).map((item) => item.id)).toEqual(['b', 'a', 'c']);
    press(grip, 'Escape');
  });

  it('marks the edge of the carried item on the side it passed', () => {
    const { kb, grip } = setup(['a', 'b', 'c']);
    press(grip, ' ');
    expect(kb.edgeOf('b')).toBeNull();
    press(grip, 'ArrowDown');
    // Moved down: the line sits above the item it now follows.
    expect(kb.edgeOf('b')).toBe('before');
    press(grip, 'ArrowUp');
    press(grip, 'ArrowUp');
    // Moved up: the line sits below the carried item.
    expect(kb.edgeOf('b')).toBe('after');
    expect(kb.edgeOf('a')).toBeNull();
  });

  it('cancels with Escape: no save, the order is restored and the cancel is announced', () => {
    const { kb, onMove, grip } = setup(['a', 'b', 'c']);
    press(grip, ' ');
    press(grip, 'ArrowDown');
    press(grip, 'Escape');
    expect(onMove).not.toHaveBeenCalled();
    expect(kb.isCarried('b')).toBe(false);
    expect(kb.announcement.value).toBe('Dibatalkan.');
    const items = ['a', 'b', 'c'].map((id) => ({ id }));
    expect(kb.arrange(items, (item) => item.id).map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not save a drop that leaves the item where it was', () => {
    const { kb, onMove, grip } = setup(['a', 'b', 'c']);
    press(grip, ' ');
    press(grip, 'ArrowDown');
    press(grip, 'ArrowUp');
    press(grip, ' ');
    expect(onMove).not.toHaveBeenCalled();
    expect(kb.announcement.value).toBe('Posisi tidak berubah: 2 dari 3.');
  });

  it('stops at the ends of the list and says where the item is', () => {
    const { kb, onMove, grip } = setup(['a', 'b']);
    press(grip, ' ');
    press(grip, 'ArrowUp');
    expect(kb.announcement.value).toBe('Posisi 1 dari 2.');
    press(grip, 'ArrowUp');
    expect(kb.announcement.value).toBe('Sudah di posisi 1 dari 2.');
    press(grip, 'ArrowDown');
    expect(kb.announcement.value).toBe('Posisi 2 dari 2.');
    press(grip, 'ArrowDown');
    expect(kb.announcement.value).toBe('Sudah di posisi 2 dari 2.');
    press(grip, ' ');
    // Back where it started: nothing is saved.
    expect(onMove).not.toHaveBeenCalled();
  });

  it('refuses a pick-up while a save is running', () => {
    const { kb, grip } = setup(['a', 'b'], true);
    press(grip, ' ');
    expect(kb.isCarried('b')).toBe(false);
  });

  it('ignores other keys, and ignores keys aimed at an item that is not carried', () => {
    const { kb, grip } = setup(['a', 'b']);
    press(grip, 'x');
    press(grip, 'ArrowDown');
    expect(kb.isCarried('b')).toBe(false);
    press(grip, ' ');
    expect(kb.isCarried('b')).toBe(true);
    // A key on another grip does nothing to the carried item.
    grip.addEventListener('keydown', (event) => kb.onGripKeydown(event, 'a'));
    press(grip, 'ArrowUp');
    expect(kb.announcement.value).toBe('Posisi 1 dari 2.');
  });

  it('cancels when focus leaves the grip, but keeps the move while focus stays', async () => {
    const { kb, onMove, grip } = setup(['a', 'b', 'c']);
    grip.focus();
    press(grip, ' ');
    press(grip, 'ArrowDown');
    await nextTick();
    grip.blur();
    await nextTick();
    await Promise.resolve();
    expect(kb.isCarried('b')).toBe(false);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('keeps the carried item while the list re-renders and focus returns to the grip', async () => {
    const { kb, onMove, grip } = setup(['a', 'b', 'c']);
    grip.focus();
    press(grip, ' ');
    press(grip, 'ArrowDown');
    // A re-render that moves the element drops focus; the composable puts it back on the grip.
    grip.blur();
    grip.focus();
    await nextTick();
    await Promise.resolve();
    expect(kb.isCarried('b')).toBe(true);
    press(grip, ' ');
    expect(onMove).toHaveBeenCalledWith('b', 2);
  });

  it('shows a dropped order until the save ends, then the committed order takes over', async () => {
    const { kb, onMove, blockRef, orderRef, grip } = setup(['a', 'b', 'c']);
    press(grip, ' ');
    press(grip, 'ArrowDown');
    press(grip, ' ');
    expect(onMove).toHaveBeenCalledWith('b', 2);

    const items = ['a', 'b', 'c'].map((id) => ({ id }));
    // The save is running: the dropped order stays on screen.
    blockRef.value = true;
    await nextTick();
    expect(kb.arrange(items, (item) => item.id).map((item) => item.id)).toEqual(['a', 'c', 'b']);
    // The save failed (the order did not change): the preview ends and the old order returns.
    blockRef.value = false;
    await nextTick();
    expect(kb.arrange(items, (item) => item.id).map((item) => item.id)).toEqual(['a', 'b', 'c']);

    // A saved order is shown as the committed order.
    press(grip, ' ');
    press(grip, 'ArrowDown');
    press(grip, ' ');
    orderRef.value = ['a', 'c', 'b'];
    await nextTick();
    expect(kb.arrange(items, (item) => item.id).map((item) => item.id)).toEqual(['a', 'c', 'b']);
  });

  it('does not reorder a list whose items do not match the order', () => {
    const { kb, grip } = setup(['a', 'b']);
    press(grip, ' ');
    press(grip, 'ArrowDown');
    const other = [{ id: 'x' }, { id: 'y' }];
    expect(kb.arrange(other, (item) => item.id).map((item) => item.id)).toEqual(['x', 'y']);
  });
});
