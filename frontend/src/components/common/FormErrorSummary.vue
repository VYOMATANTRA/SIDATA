<script setup lang="ts">
/**
 * Form-level error summary. `docs/ACCESSIBILITY.md` §3 (3.3.1) requires validation errors to
 * be identified in text and associated with their field; a `<form role="alert">` summary that
 * links to each offending control is the conventional way to also *announce* them, which is
 * what the indicator CMS acceptance criterion asks for.
 *
 * The links move focus directly (rather than relying on `href="#id"`) because inside a dialog
 * a hash change would scroll the page behind the overlay.
 */

export interface FormErrorSummaryProps {
  errors: ReadonlyArray<{ fieldId: string; message: string }>;
  /** Server-side / non-field error, e.g. a 409 slug clash or a 400 pairing rejection. */
  formError?: string;
  title?: string;
}

withDefaults(defineProps<FormErrorSummaryProps>(), {
  formError: undefined,
  title: 'Periksa kembali isian berikut:',
});

function focusField(fieldId: string): void {
  if (typeof document === 'undefined') return;
  const element = document.getElementById(fieldId);
  if (element instanceof HTMLElement) {
    element.focus();
  }
}
</script>

<template>
  <div
    v-if="errors.length > 0 || formError"
    role="alert"
    tabindex="-1"
    class="rounded-card border border-rose-300 bg-rose-50 px-4 py-3"
  >
    <p v-if="errors.length > 0" class="text-sm font-semibold text-rose-900">{{ title }}</p>

    <p v-if="formError" class="mt-1 text-sm text-rose-800" data-test="form-error">
      {{ formError }}
    </p>

    <ul v-if="errors.length > 0" class="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-800">
      <li v-for="error in errors" :key="error.fieldId">
        <a
          :href="`#${error.fieldId}`"
          class="rounded-xs underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700"
          @click.prevent="focusField(error.fieldId)"
        >
          {{ error.message }}
        </a>
      </li>
    </ul>
  </div>
</template>
