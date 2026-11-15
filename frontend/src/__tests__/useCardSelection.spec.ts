import { describe, expect, it } from 'vitest';
import { computed, nextTick, ref } from 'vue';
import { useCardSelection } from '../composables/useCardSelection';

function setup(initial: string[]) {
  const visible = ref(initial);
  const keys = computed(() => visible.value);
  return { visible, ...useCardSelection(keys) };
}

describe('useCardSelection', () => {
  it('toggles one card on and off', () => {
    const list = setup(['a', 'b']);
    list.toggle('a');
    expect(list.selected.value).toEqual(['a']);
    list.toggle('a');
    expect(list.selected.value).toEqual([]);
  });

  it('reports none, some and all for the tri-state select-all', () => {
    const list = setup(['a', 'b', 'c']);
    expect(list.selectAllState.value).toBe('none');
    list.toggle('b');
    expect(list.selectAllState.value).toBe('some');
    list.toggle('a');
    list.toggle('c');
    expect(list.selectAllState.value).toBe('all');
  });

  it('select-all selects every visible card, then clears them, and says which it did', () => {
    const list = setup(['a', 'b']);
    expect(list.toggleSelectAll()).toBe('selected');
    expect(list.selected.value).toEqual(['a', 'b']);
    expect(list.toggleSelectAll()).toBe('cleared');
    expect(list.selected.value).toEqual([]);
  });

  it('drops a selected card that the list no longer shows', async () => {
    const list = setup(['a', 'b', 'c']);
    list.toggle('a');
    list.toggle('c');
    list.visible.value = ['a', 'b'];
    await nextTick();
    expect(list.selected.value).toEqual(['a']);
  });

  it('select-all touches only the visible cards', async () => {
    const list = setup(['a', 'b']);
    list.toggle('a');
    list.visible.value = ['b', 'c'];
    await nextTick();
    expect(list.selected.value).toEqual([]);
    list.toggleSelectAll();
    expect(list.selected.value).toEqual(['b', 'c']);
  });

  it('clear empties the selection', () => {
    const list = setup(['a']);
    list.toggle('a');
    list.clear();
    expect(list.selected.value).toEqual([]);
  });
});
