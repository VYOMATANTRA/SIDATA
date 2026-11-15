<script setup lang="ts">
import { computed } from 'vue';
import BaseButton from '../../common/BaseButton.vue';
import type { SelectAllState } from '../../../composables/useCardSelection';

/**
 * The select-all control of a card list: a tri-state checkbox drawn as a button (role="checkbox",
 * aria-checked none / mixed / true). Empty box: "Pilih semua". Dash: some are selected, so the next
 * press selects the rest, still "Pilih semua". Checked box: all are selected, so the press clears
 * them, "Batal pilih semua". `primary` makes it the main action while something is selected.
 */
const props = withDefaults(
  defineProps<{
    state: SelectAllState;
    id?: string;
    primary?: boolean;
    disabled?: boolean;
    dataTest?: string;
  }>(),
  { id: undefined, primary: false, disabled: false, dataTest: 'select-all' },
);

const emit = defineEmits<{ (e: 'click'): void }>();

const label = computed(() => (props.state === 'all' ? 'Batal pilih semua' : 'Pilih semua'));
const ariaChecked = computed(() =>
  props.state === 'some' ? 'mixed' : props.state === 'all' ? 'true' : 'false',
);
</script>

<template>
  <BaseButton
    :id="id"
    type="button"
    role="checkbox"
    :variant="primary ? 'primary' : 'secondary'"
    size="md"
    class="min-h-11 w-full min-w-[12.5rem] md:w-auto"
    :aria-checked="ariaChecked"
    :disabled="disabled"
    :data-test="dataTest"
    @click="emit('click')"
  >
    <template #leftIcon>
      <svg viewBox="0 0 20 20" class="h-4 w-4" aria-hidden="true" focusable="false">
        <rect x="3" y="3" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.6" />
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
</template>
