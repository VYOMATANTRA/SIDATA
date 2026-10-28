<script setup lang="ts">
import { computed } from 'vue';

/**
 * Label + hint + error scaffold shared by every CMS form control.
 *
 * The acceptance criterion for the indicator CMS is that every input has a real `<label>`
 * paired to a matching `id` and that errors are announced per `docs/ACCESSIBILITY.md`. Owning
 * that wiring in one component (rather than repeating `for`/`id`/`aria-describedby` at each
 * call site) is what makes it hold as fields are added.
 *
 * The control is supplied by slot so the concrete input type stays visible at the call site;
 * the slot hands back the ARIA attributes the control must carry.
 */

export interface FormFieldProps {
  /** Control id. The label's `for`, hint and error ids are all derived from it. */
  id: string;
  label: string;
  hint?: string;
  /** Field-level validation message. Rendered in text (never colour alone) and announced. */
  error?: string;
  required?: boolean;
}

const props = withDefaults(defineProps<FormFieldProps>(), {
  hint: undefined,
  error: undefined,
  required: false,
});

defineSlots<{
  default: (slotProps: { describedBy: string | undefined; invalid: boolean }) => unknown;
}>();

const hintId = computed(() => `${props.id}-hint`);
const errorId = computed(() => `${props.id}-error`);
const invalid = computed(() => Boolean(props.error));

const describedBy = computed(() => {
  const ids = [props.hint ? hintId.value : null, props.error ? errorId.value : null].filter(
    (value): value is string => Boolean(value),
  );
  return ids.length > 0 ? ids.join(' ') : undefined;
});
</script>

<template>
  <div>
    <label :for="id" class="block text-sm font-medium text-slate-700">
      {{ label }}
      <span v-if="required" class="text-rose-600">
        <span aria-hidden="true">*</span>
        <span class="sr-only">(wajib diisi)</span>
      </span>
    </label>

    <p v-if="hint" :id="hintId" class="mt-1 text-xs leading-snug text-slate-500">{{ hint }}</p>

    <div class="mt-1.5">
      <slot :described-by="describedBy" :invalid="invalid" />
    </div>

    <p v-if="error" :id="errorId" class="mt-1.5 text-xs font-medium text-rose-600">
      {{ error }}
    </p>
  </div>
</template>
