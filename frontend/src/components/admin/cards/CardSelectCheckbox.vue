<script setup lang="ts">
/**
 * The selection checkbox of a card. Always shown, never hidden until a card is selected, and kept
 * vertically centred by its row. The label is screen-reader only and names the card.
 */
defineProps<{
  id: string;
  checked: boolean;
  disabled?: boolean;
  /** Accessible name: "Pilih halaman <judul>" and so on. */
  label: string;
  dataTest?: string;
}>();

const emit = defineEmits<{ (e: 'toggle'): void }>();
</script>

<template>
  <div class="flex shrink-0 items-center self-center">
    <input
      :id="id"
      type="checkbox"
      class="focus-visible:outline-focus-ring accent-brand-navy h-5 w-5 focus-visible:outline-2 focus-visible:outline-offset-2"
      :checked="checked"
      :disabled="disabled"
      :data-test="dataTest ?? 'page-checkbox'"
      @change="emit('toggle')"
    />
    <label :for="id" class="sr-only">{{ label }}</label>
  </div>
</template>
