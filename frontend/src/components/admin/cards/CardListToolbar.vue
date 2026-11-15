<script setup lang="ts">
/**
 * The control row of a card list: search, optional filters, the Urutkan toggle, select-all and the
 * add button. Phones stack every control full width in one column; from md they sit in one row,
 * right-aligned. The add slot receives `hiddenClass` (`invisible` while `hideAdd`, a selection is active): the
 * control keeps its place so the row stays still, and a hidden control leaves the focus order.
 */
defineProps<{ hideAdd?: boolean }>();
</script>

<template>
  <div
    class="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-center md:justify-end"
    data-test="toolbar"
  >
    <slot name="search" />
    <slot name="filters" />
    <slot name="sort" />
    <slot name="select-all" />
    <slot name="add" :hidden-class="hideAdd ? 'invisible' : ''" />
  </div>
</template>
