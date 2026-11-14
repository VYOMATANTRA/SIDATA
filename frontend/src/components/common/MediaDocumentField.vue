<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import AlertBanner from './AlertBanner.vue';
import BaseButton from './BaseButton.vue';
import {
  DOCUMENT_ACCEPT,
  MediaUploadError,
  uploadMedia,
  validateDocumentFile,
  type MediaPurpose,
  type MediaUploadResult,
} from '../../services/media.service';

/**
 * One document slot (PDF or DOCX): pick a file, upload it, replace it or remove it. The value is
 * the stored asset's id, or null while the slot is empty. A failed upload never touches the
 * current value. The real file input is focusable, so every step works from the keyboard.
 */
const props = withDefaults(
  defineProps<{
    modelValue: string | null;
    purpose: MediaPurpose;
    label: string;
    /** What the slot currently holds, in words (e.g. "PDF, 2,1 MB"); shown while a file is set. */
    currentLabel?: string;
    disabled?: boolean;
    error?: string;
    inputId?: string;
  }>(),
  { currentLabel: '', disabled: false, error: undefined, inputId: undefined },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void;
  (e: 'uploaded', result: MediaUploadResult, file: File): void;
  (e: 'busy', busy: boolean): void;
}>();

const generatedId = useId();
const baseId = computed(() => props.inputId ?? `${generatedId}-berkas`);
const errorId = computed(() => `${baseId.value}-error`);

const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const uploadError = ref('');
const statusText = ref('');
const heldName = ref('');
let unmounted = false;

const shownError = computed(() => uploadError.value || props.error || '');
const controlsDisabled = computed(() => props.disabled || uploading.value);

watch(uploading, (value) => emit('busy', value));
onBeforeUnmount(() => {
  unmounted = true;
  if (uploading.value) emit('busy', false);
});

async function handleFile(file: File): Promise<void> {
  if (controlsDisabled.value) return;
  uploadError.value = '';
  statusText.value = '';
  const problem = validateDocumentFile(file);
  if (problem) {
    uploadError.value = problem;
    return;
  }
  uploading.value = true;
  statusText.value = 'Mengunggah berkas…';
  try {
    const result = await uploadMedia(file, props.purpose);
    if (unmounted) return;
    heldName.value = result.originalName;
    emit('update:modelValue', result.id);
    emit('uploaded', result, file);
    statusText.value = 'Berkas berhasil diunggah.';
  } catch (error) {
    if (unmounted) return;
    statusText.value = '';
    uploadError.value =
      error instanceof MediaUploadError
        ? error.message
        : 'Berkas belum terunggah. Periksa koneksi lalu coba lagi.';
  } finally {
    if (!unmounted) uploading.value = false;
  }
}

function onChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const picked = input.files?.[0] ?? null;
  try {
    input.value = '';
  } catch {
    /* some environments refuse to clear a file input */
  }
  if (picked) void handleFile(picked);
}

function remove(): void {
  uploadError.value = '';
  heldName.value = '';
  statusText.value = 'Berkas dihapus dari isian ini.';
  emit('update:modelValue', null);
  void nextTick(() => fileInput.value?.focus());
}
</script>

<template>
  <div class="space-y-2" role="group" :aria-label="label" data-test="media-document-field">
    <p v-if="modelValue" class="text-brand-navy text-sm font-semibold" data-test="document-current">
      Berkas terunggah<span v-if="heldName">: {{ heldName }}</span
      ><span v-if="currentLabel" class="text-text-muted font-normal"> ({{ currentLabel }})</span>
    </p>
    <div class="flex flex-wrap items-center gap-2">
      <input
        :id="baseId"
        ref="fileInput"
        type="file"
        :accept="DOCUMENT_ACCEPT"
        class="peer sr-only"
        :disabled="controlsDisabled"
        :aria-describedby="shownError ? errorId : undefined"
        :aria-invalid="shownError ? 'true' : undefined"
        data-test="document-input"
        @change="onChange"
      />
      <label
        :for="baseId"
        class="rounded-btn border-brand-navy text-brand-navy hover:bg-surface-muted peer-focus-visible:ring-focus-ring peer-focus-visible:ring-offset-surface peer-disabled:border-border peer-disabled:text-text-muted inline-flex min-h-11 cursor-pointer items-center border-2 bg-white px-4 text-sm font-medium peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed"
        data-test="document-pick"
      >
        {{ uploading ? 'Mengunggah…' : modelValue ? 'Ganti berkas' : 'Pilih berkas' }}
        <span class="sr-only"> untuk {{ label }}</span>
      </label>
      <BaseButton
        v-if="modelValue"
        type="button"
        variant="secondary"
        size="md"
        class="min-h-11"
        :disabled="controlsDisabled"
        data-test="document-remove"
        @click="remove"
      >
        Hapus berkas<span class="sr-only"> {{ label }}</span>
      </BaseButton>
    </div>
    <p class="text-text-muted text-xs">Format PDF atau DOCX, maksimal 20 MB.</p>
    <p class="sr-only" role="status" aria-live="polite" data-test="document-status">
      {{ statusText }}
    </p>
    <AlertBanner
      v-if="shownError"
      :id="errorId"
      :message="shownError"
      data-test="document-error"
    />
  </div>
</template>
