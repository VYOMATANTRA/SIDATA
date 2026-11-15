import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';

export type SelectAllState = 'none' | 'some' | 'all';

/**
 * Checked cards of a card list. Only cards the list shows can be selected: when the visible keys
 * change (a search, a filter, a removal elsewhere) a selected key that is no longer visible is
 * dropped, so a bulk action can never touch what the editor cannot see.
 *
 * `toggleSelectAll` acts on the visible cards only: it selects all of them, or clears them when they
 * are all selected already, and reports which of the two it did so the view can announce it.
 */
export function useCardSelection(visibleKeys: ComputedRef<readonly string[]>): {
  selected: Ref<string[]>;
  selectedVisibleCount: ComputedRef<number>;
  selectAllState: ComputedRef<SelectAllState>;
  toggle: (key: string) => void;
  toggleSelectAll: () => 'selected' | 'cleared';
  clear: () => void;
} {
  const selected = ref<string[]>([]);

  watch(visibleKeys, (keys) => {
    const visible = new Set(keys);
    const kept = selected.value.filter((key) => visible.has(key));
    if (kept.length !== selected.value.length) selected.value = kept;
  });

  const selectedVisibleCount = computed(
    () => visibleKeys.value.filter((key) => selected.value.includes(key)).length,
  );

  const selectAllState = computed<SelectAllState>(() => {
    if (selectedVisibleCount.value === 0) return 'none';
    return selectedVisibleCount.value === visibleKeys.value.length ? 'all' : 'some';
  });

  function toggle(key: string): void {
    selected.value = selected.value.includes(key)
      ? selected.value.filter((item) => item !== key)
      : [...selected.value, key];
  }

  function toggleSelectAll(): 'selected' | 'cleared' {
    const visible = [...visibleKeys.value];
    if (selectAllState.value === 'all') {
      selected.value = selected.value.filter((key) => !visible.includes(key));
      return 'cleared';
    }
    selected.value = [...new Set([...selected.value, ...visible])];
    return 'selected';
  }

  function clear(): void {
    selected.value = [];
  }

  return { selected, selectedVisibleCount, selectAllState, toggle, toggleSelectAll, clear };
}
