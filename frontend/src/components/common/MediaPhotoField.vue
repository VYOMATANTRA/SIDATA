<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import BaseButton from './BaseButton.vue';
import { useAuthenticatedBlobUrl } from '../../composables/useAuthenticatedBlobUrl';
import {
  MediaUploadError,
  PHOTO_ACCEPT,
  PHOTO_MAX_MB_LABEL,
  mediaPreviewPath,
  uploadMedia,
  validatePhotoFile,
  type MediaPurpose,
  type MediaUploadResult,
} from '../../services/media.service';

/**
 * One photo slot: pick a file (button or drag-and-drop), upload it, preview it, replace it or
 * remove it. The value is the stored asset's id, or null while the slot is empty.
 *
 * Rules (SPEC §8):
 * - The preview is loaded with the authenticated client and shown from a blob URL, because the
 *   editor preview route answers 401 to a bare `<img src>`. The blob URL is revoked on change and
 *   on unmount.
 * - A failed upload never touches the current value: the previous photo stays, and the reason is
 *   written in plain Indonesian beside the field.
 * - Dragging is only a shortcut. The file button is a real, focusable file input, so every step
 *   works from the keyboard.
 * - Removing only clears the slot. The stored file is released by whoever saves the content that
 *   used it (an unused upload is cleaned up by the scheduled media cleanup).
 */
const props = withDefaults(
  defineProps<{
    /** Asset id of the current photo, or null. */
    modelValue: string | null;
    /** Server-side upload purpose; decides which files are accepted. */
    purpose: MediaPurpose;
    label: string;
    disabled?: boolean;
    /** Validation message from the parent form, e.g. "Pilih foto untuk bagian ini". */
    error?: string;
    previewAlt?: string;
    /** Prefix for generated ids so the parent can focus the file input from an error summary. */
    inputId?: string;
  }>(),
  {
    disabled: false,
    error: undefined,
    previewAlt: 'Pratinjau foto',
    inputId: undefined,
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void;
  (e: 'uploaded', result: MediaUploadResult): void;
  (e: 'busy', busy: boolean): void;
}>();

const generatedId = useId();
const baseId = computed(() => props.inputId ?? `${generatedId}-foto`);
const hintId = computed(() => `${baseId.value}-hint`);
const errorId = computed(() => `${baseId.value}-error`);
const statusId = computed(() => `${baseId.value}-status`);
const labelId = computed(() => `${baseId.value}-label`);

const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const dragging = ref(false);
const uploadError = ref('');
const statusText = ref('');
let unmounted = false;

const previewPath = computed(() => (props.modelValue ? mediaPreviewPath(props.modelValue) : null));
const preview = useAuthenticatedBlobUrl(previewPath);

const shownError = computed(() => uploadError.value || props.error || '');
const describedBy = computed(() => {
  const ids = [hintId.value, shownError.value ? errorId.value : null].filter(Boolean);
  return ids.join(' ');
});
const controlsDisabled = computed(() => props.disabled || uploading.value);

watch(uploading, (value) => emit('busy', value));

onBeforeUnmount(() => {
  unmounted = true;
});

async function handleFile(file: File): Promise<void> {
  if (controlsDisabled.value) return;
  uploadError.value = '';
  statusText.value = '';

  const problem = validatePhotoFile(file);
  if (problem) {
    uploadError.value = problem;
    return;
  }

  uploading.value = true;
  statusText.value = 'Mengunggah foto…';
  try {
    const result = await uploadMedia(file, props.purpose);
    if (unmounted) return;
    emit('update:modelValue', result.id);
    emit('uploaded', result);
    statusText.value = 'Foto berhasil diunggah.';
  } catch (error) {
    if (unmounted) return;
    // The previous value is left exactly as it was.
    statusText.value = '';
    uploadError.value =
      error instanceof MediaUploadError
        ? error.message
        : 'Foto belum terunggah. Periksa koneksi lalu coba lagi.';
  } finally {
    if (!unmounted) uploading.value = false;
  }
}

function onChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // Clearing lets the same file be chosen again after a failure.
  const picked = file ?? null;
  try {
    input.value = '';
  } catch {
    /* some environments refuse to clear a file input */
  }
  if (picked) void handleFile(picked);
}

function onDragOver(): void {
  if (!controlsDisabled.value) dragging.value = true;
}

function onDragLeave(): void {
  dragging.value = false;
}

function onDrop(event: DragEvent): void {
  dragging.value = false;
  if (controlsDisabled.value) return;
  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) return;
  if (files.length > 1) {
    uploadError.value = 'Unggah satu foto setiap kali.';
    return;
  }
  const first = files[0];
  if (first) void handleFile(first);
}

function remove(): void {
  uploadError.value = '';
  statusText.value = 'Foto dihapus dari isian ini.';
  emit('update:modelValue', null);
  void nextTick(() => fileInput.value?.focus());
}
</script>

<template>
  <div class="space-y-3" role="group" :aria-labelledby="labelId" data-test="media-photo-field">
    <p :id="labelId" class="text-text-muted text-sm font-medium">{{ label }}</p>

    <div
      v-if="modelValue"
      class="rounded-card border-border bg-surface-muted flex min-h-32 items-center justify-center overflow-hidden border p-2"
      data-test="photo-preview"
    >
      <img
        v-if="preview.url.value"
        :src="preview.url.value"
        :alt="previewAlt"
        class="rounded-btn max-h-56 w-auto max-w-full object-contain"
        data-test="photo-preview-image"
      />
      <p
        v-else-if="preview.status.value === 'error'"
        class="text-text-muted p-3 text-center text-sm"
        data-test="photo-preview-error"
      >
        Pratinjau foto tidak dapat dimuat.
        <button
          type="button"
          class="text-brand-navy focus-visible:outline-focus-ring ml-1 min-h-11 rounded-xs px-2 font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
          data-test="photo-preview-retry"
          @click="preview.retry()"
        >
          Coba lagi
        </button>
      </p>
      <p v-else class="text-text-muted p-3 text-sm" data-test="photo-preview-loading">
        Memuat pratinjau…
      </p>
    </div>

    <div
      class="rounded-card border-border-strong flex flex-col items-start gap-2 border border-dashed p-4"
      :class="dragging ? 'bg-surface-hover' : 'bg-surface'"
      data-test="photo-dropzone"
      @dragover.prevent="onDragOver"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
    >
      <p class="text-text-muted text-sm">
        {{
          modelValue
            ? 'Seret foto baru ke sini untuk mengganti, atau gunakan tombol.'
            : 'Seret foto ke sini, atau gunakan tombol.'
        }}
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <input
          :id="baseId"
          ref="fileInput"
          type="file"
          :accept="PHOTO_ACCEPT"
          class="peer sr-only"
          :disabled="controlsDisabled"
          :aria-describedby="describedBy"
          :aria-invalid="shownError ? 'true' : undefined"
          data-test="photo-input"
          @change="onChange"
        />
        <label
          :for="baseId"
          class="rounded-btn border-brand-navy text-brand-navy hover:bg-surface-muted peer-focus-visible:ring-focus-ring peer-focus-visible:ring-offset-surface peer-disabled:border-border peer-disabled:text-text-muted inline-flex min-h-11 cursor-pointer items-center border-2 bg-white px-4 text-sm font-medium peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed"
          data-test="photo-pick"
        >
          {{ uploading ? 'Mengunggah…' : modelValue ? 'Ganti foto' : 'Pilih foto' }}
          <span class="sr-only"> untuk {{ label }}</span>
        </label>
        <BaseButton
          v-if="modelValue"
          type="button"
          variant="secondary"
          size="md"
          class="min-h-11"
          :disabled="controlsDisabled"
          data-test="photo-remove"
          @click="remove"
        >
          Hapus foto<span class="sr-only"> {{ label }}</span>
        </BaseButton>
      </div>
      <p :id="hintId" class="text-text-muted text-xs">
        Format JPEG, PNG, atau WebP, maksimal {{ PHOTO_MAX_MB_LABEL }}.
      </p>
    </div>

    <p :id="statusId" class="sr-only" role="status" aria-live="polite" data-test="photo-status">
      {{ statusText }}
    </p>
    <p
      v-if="shownError"
      :id="errorId"
      role="alert"
      class="text-status-error text-xs font-medium"
      data-test="photo-error"
    >
      {{ shownError }}
    </p>
  </div>
</template>
