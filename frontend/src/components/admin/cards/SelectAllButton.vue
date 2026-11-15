<script setup lang="ts">
import { computed } from 'vue';
import BaseButton from '../../common/BaseButton.vue';

/**
 * "Select all" for a list of admin cards, with three visual states: none checked (empty box), some
 * checked (dash), all checked (ticked box). It is a plain button: its accessible name is the visible
 * label ("Pilih semua" or "Batal pilih semua"), and the partial or full state is spoken through a
 * described-by note, not a checkbox role (a checkbox role would announce the label as its state).
 * `filled` gives the primary style, used while at least one card is selected.
 */
const props = defineProps<{
  /** How many of the listed cards are checked. */
  state: 'none' | 'some' | 'all';
  /** Id of the button; the state note is `${id}-estado`. */
  id: string;
  filled?: boolean;
  disabled?: boolean;
  dataTest?: string;
}>();

defineEmits<{ (e: 'click'): void }>();

const label = computed(() => (props.state === 'all' ? 'Batal pilih semua' : 'Pilih semua'));
const stateNoteId = computed(() => `${props.id}-estado`);
const stateNote = computed(() => {
  if (props.state === 'some') return 'sebagian dipilih';
  if (props.state === 'all') return 'semua dipilih';
  return '';
});
</script>

<template>
  <BaseButton
    :id="id"
    type="button"
    :variant="filled ? 'primary' : 'secondary'"
    size="md"
    class="min-h-11 w-full min-w-[12.5rem] md:w-auto"
    :aria-describedby="stateNote ? stateNoteId : undefined"
    :disabled="disabled"
    :data-test="dataTest"
    @click="$emit('click')"
  >
    <template #leftIcon>
      <svg viewBox="0 0 20 20" class="h-4 w-4" aria-hidden="true" focusable="false">
        <rect
          x="3"
          y="3"
          width="14"
          height="14"
          rx="3"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
        />
        <path
          v-if="state === 'all'"
          d="M6.5 10.5l2.4 2.4 4.6-4.8"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          v-else-if="state === 'some'"
          d="M6.5 10h7"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        />
      </svg>
    </template>
    {{ label }}
  </BaseButton>
  <!-- Outside the button, so it is not part of the name; off-screen, so it takes no room in the toolbar. -->
  <span v-if="stateNote" :id="stateNoteId" class="sr-only">{{ stateNote }}</span>
</template>
