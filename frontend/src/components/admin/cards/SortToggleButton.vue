<script setup lang="ts">
import { ArrowsUpDownIcon } from '@heroicons/vue/24/outline';
import BaseButton from '../../common/BaseButton.vue';

/**
 * The Urutkan toggle of a card list: shows the Naik / Turun controls on every card. Pressed state is
 * exposed with aria-pressed. The icon is decorative; the label names the list ("Urutkan Cerita").
 */
withDefaults(
  defineProps<{
    pressed: boolean;
    label: string;
    id?: string;
    disabled?: boolean;
    dataTest?: string;
  }>(),
  { id: undefined, disabled: false, dataTest: 'sort-toggle' },
);

defineEmits<{ (e: 'click'): void }>();
</script>

<template>
  <BaseButton
    :id="id"
    type="button"
    variant="secondary"
    size="md"
    class="min-h-11 w-full md:w-auto"
    :aria-pressed="pressed ? 'true' : 'false'"
    :disabled="disabled"
    :data-test="dataTest"
    @click="$emit('click')"
  >
    <template #leftIcon>
      <ArrowsUpDownIcon class="h-4 w-4" aria-hidden="true" />
    </template>
    {{ label }}
  </BaseButton>
</template>
