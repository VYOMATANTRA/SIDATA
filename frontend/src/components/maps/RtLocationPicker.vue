<script setup lang="ts">
/**
 * Ketua RT home location: a thin wrapper over the shared `LocationPicker` in pin mode. Public
 * props and events are unchanged (`modelValue`, `disabled`, `update:modelValue`,
 * `validity-change`) so `AdminRukunTetanggaView` needs no edits. There are no coordinate fields:
 * the pin is placed and refined on the map or with the keyboard buttons.
 */
import { computed } from 'vue';
import LocationPicker, { type PickerLocation } from './LocationPicker.vue';

export interface PickedLocation {
  latitude: number;
  longitude: number;
}

const props = defineProps<{
  modelValue: PickedLocation | null;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: PickedLocation | null): void;
  (event: 'validity-change', value: boolean): void;
}>();

const value = computed<PickerLocation | null>(() =>
  props.modelValue
    ? { latitude: props.modelValue.latitude, longitude: props.modelValue.longitude }
    : null,
);

function update(next: PickerLocation | null): void {
  // Pin positions come from the map, so they are always valid; the event stays for the view.
  emit('validity-change', true);
  emit('update:modelValue', next ? { latitude: next.latitude, longitude: next.longitude } : null);
}
</script>

<template>
  <LocationPicker
    :model-value="value"
    label="Lokasi rumah Ketua RT"
    help-text="Klik atau ketuk peta untuk meletakkan pin, lalu geser pin untuk menyesuaikan. Lokasi perangkat belum tentu sama dengan lokasi rumah Ketua RT."
    test-id="rt-location"
    map-test-id="rt-location-picker"
    :disabled="disabled"
    clearable
    detectable
    @update:model-value="update"
  />
</template>
