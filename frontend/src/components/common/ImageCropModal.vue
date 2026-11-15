<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import AlertBanner from './AlertBanner.vue';
import BaseButton from './BaseButton.vue';
import BaseModal from './BaseModal.vue';
import { PHOTO_ACCEPT, PHOTO_MAX_MB_LABEL, validatePhotoFile } from '../../services/media.service';
import {
  CROP_BACKGROUND_COLOR,
  DEFAULT_BANNER_ASPECT_RATIO,
  DEFAULT_BANNER_TARGET_HEIGHT,
  DEFAULT_BANNER_TARGET_WIDTH,
  DEFAULT_SAFE_ASPECT_RATIO,
  clampPan,
  computeCoverCropRect,
  computeMaxPan,
  computeSafeZoneBox,
  exportCroppedCanvasBlob,
  type CropSourceRect,
} from '../../utils/imageCrop';
import type { FailureKind } from '../../utils/userMessages';

/**
 * Reusable `<canvas>` cover-crop and zoom modal.
 *
 * Keeps the uploaded photo covering 100% of the target frame (`aspectRatio`) while exposing a
 * dashed center safe-zone guide (`safeAspectRatio`) so operators can keep important subjects
 * framed for both desktop banners and narrower cards.
 */
export interface ImageCropModalProps {
  open: boolean;
  title: string;
  description?: string;
  aspectRatio?: number;
  targetWidth?: number;
  targetHeight?: number;
  safeAspectRatio?: number;
  currentPreviewUrl?: string | null;
  hasCustomImage?: boolean;
  busy?: boolean;
  error?: string;
  errorKind?: FailureKind;
  stale?: boolean;
}

const props = withDefaults(defineProps<ImageCropModalProps>(), {
  description: undefined,
  aspectRatio: DEFAULT_BANNER_ASPECT_RATIO,
  targetWidth: DEFAULT_BANNER_TARGET_WIDTH,
  targetHeight: DEFAULT_BANNER_TARGET_HEIGHT,
  safeAspectRatio: DEFAULT_SAFE_ASPECT_RATIO,
  currentPreviewUrl: null,
  hasCustomImage: false,
  busy: false,
  error: '',
  errorKind: undefined,
  stale: false,
});

const emit = defineEmits<{
  (e: 'save', file: File): void;
  (e: 'remove'): void;
  (e: 'close'): void;
  (e: 'reload'): void;
}>();

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_SLIDER_STEP = 0.05;
const ZOOM_BUTTON_STEP = 0.1;
const PREVIEW_LOGICAL_WIDTH = 740;

const baseId = useId();
const fileInputId = `${baseId}-file`;
const fileHintId = `${baseId}-file-hint`;
const stageHintId = `${baseId}-stage-hint`;
const zoomSliderId = `${baseId}-zoom`;

const canvasRef = ref<HTMLCanvasElement | null>(null);
const stageRef = ref<HTMLElement | null>(null);
const zoomSliderRef = ref<HTMLInputElement | null>(null);

const pickedObjectUrl = ref<string | null>(null);
const loadedImage = ref<HTMLImageElement | null>(null);
const imageLoadError = ref(false);
const localError = ref('');
const statusText = ref('');
const draggingFile = ref(false);
const draggingCanvas = ref(false);
const exporting = ref(false);

const zoom = ref(MIN_ZOOM);
const panX = ref(0);
const panY = ref(0);

interface DragState {
  pointerId: number;
  clientX: number;
  clientY: number;
  startPanX: number;
  startPanY: number;
}

let activeDrag: DragState | null = null;
let loadGeneration = 0;

const previewWidth = computed(() => PREVIEW_LOGICAL_WIDTH);
const previewHeight = computed(() => {
  const ratio = props.aspectRatio > 0 ? props.aspectRatio : DEFAULT_BANNER_ASPECT_RATIO;
  return Math.max(1, Math.round(PREVIEW_LOGICAL_WIDTH / ratio));
});

const activePreviewSrc = computed(() => pickedObjectUrl.value || props.currentPreviewUrl || null);
const controlsDisabled = computed(() => props.busy || exporting.value);
const shownError = computed(() => localError.value || props.error || '');
const shownErrorKind = computed(() => (localError.value ? undefined : props.errorKind));

const safeZoneStyle = computed(() => {
  const ratio = props.aspectRatio > 0 ? props.aspectRatio : DEFAULT_BANNER_ASPECT_RATIO;
  const frameHeight = 100 / ratio;
  const box = computeSafeZoneBox(100, frameHeight, props.safeAspectRatio);
  return {
    left: `${box.x}%`,
    top: `${(box.y / frameHeight) * 100}%`,
    width: `${box.width}%`,
    height: `${(box.height / frameHeight) * 100}%`,
  };
});

const zoomPercentLabel = computed(() => `${Math.round(zoom.value * 100)}%`);

function revokePickedUrl(): void {
  if (!pickedObjectUrl.value) return;
  URL.revokeObjectURL(pickedObjectUrl.value);
  pickedObjectUrl.value = null;
}

function resetCropTransform(): void {
  zoom.value = MIN_ZOOM;
  panX.value = 0;
  panY.value = 0;
}

function currentCropRect(): CropSourceRect | null {
  const img = loadedImage.value;
  if (!img || !img.naturalWidth || !img.naturalHeight) return null;
  return computeCoverCropRect({
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    aspectRatio: props.aspectRatio,
    zoom: zoom.value,
    panX: panX.value,
    panY: panY.value,
  });
}

function clampCurrentPan(nextPanX: number, nextPanY: number, nextZoom = zoom.value): void {
  const img = loadedImage.value;
  if (!img || !img.naturalWidth || !img.naturalHeight) {
    panX.value = 0;
    panY.value = 0;
    return;
  }
  const rect = computeCoverCropRect({
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    aspectRatio: props.aspectRatio,
    zoom: nextZoom,
    panX: 0,
    panY: 0,
  });
  const { maxPanX, maxPanY } = computeMaxPan(img.naturalWidth, img.naturalHeight, rect.sw, rect.sh);
  const clamped = clampPan(nextPanX, nextPanY, maxPanX, maxPanY);
  panX.value = clamped.panX;
  panY.value = clamped.panY;
}

function setZoom(nextZoom: number): void {
  const bounded = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  const rounded = Math.round(bounded * 100) / 100;
  zoom.value = rounded;
  clampCurrentPan(panX.value, panY.value, rounded);
}

function redrawPreview(): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = previewWidth.value;
  const height = previewHeight.value;
  ctx.fillStyle = CROP_BACKGROUND_COLOR;
  ctx.fillRect(0, 0, width, height);

  const img = loadedImage.value;
  const crop = currentCropRect();
  if (!img || !crop || crop.sw <= 0 || crop.sh <= 0) return;

  ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
}

function loadPreviewSource(src: string | null): void {
  const generation = ++loadGeneration;
  loadedImage.value = null;
  imageLoadError.value = false;

  if (!src) {
    redrawPreview();
    return;
  }

  const img = new Image();
  img.onload = () => {
    if (generation !== loadGeneration) return;
    loadedImage.value = img;
    clampCurrentPan(panX.value, panY.value);
    redrawPreview();
  };
  img.onerror = () => {
    if (generation !== loadGeneration) return;
    loadedImage.value = null;
    imageLoadError.value = true;
    redrawPreview();
  };
  img.src = src;
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      revokePickedUrl();
      localError.value = '';
      statusText.value = '';
      resetCropTransform();
      loadPreviewSource(activePreviewSrc.value);
      return;
    }

    loadGeneration++;
    activeDrag = null;
    draggingCanvas.value = false;
    draggingFile.value = false;
    loadedImage.value = null;
    revokePickedUrl();
  },
  { immediate: true },
);

watch(activePreviewSrc, (nextSrc) => {
  if (!props.open) return;
  loadPreviewSource(nextSrc);
});

watch(
  [canvasRef, loadedImage, zoom, panX, panY, () => props.aspectRatio],
  () => {
    redrawPreview();
  },
  { flush: 'post' },
);

onBeforeUnmount(() => {
  loadGeneration++;
  revokePickedUrl();
});

function acceptFile(file: File): void {
  if (controlsDisabled.value) return;
  localError.value = '';

  const problem = validatePhotoFile(file);
  if (problem) {
    localError.value = problem;
    return;
  }

  revokePickedUrl();
  pickedObjectUrl.value = URL.createObjectURL(file);
  resetCropTransform();
  statusText.value = 'Foto baru dimuat. Geser atau perbesar sesuai kebutuhan.';
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  try {
    input.value = '';
  } catch {
    /* ignore environments that disallow resetting file input value */
  }
  if (file) acceptFile(file);
}

function onFileDragOver(): void {
  if (!controlsDisabled.value) draggingFile.value = true;
}

function onFileDragLeave(): void {
  draggingFile.value = false;
}

function onFileDrop(event: DragEvent): void {
  draggingFile.value = false;
  if (controlsDisabled.value) return;
  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) return;
  if (files.length > 1) {
    localError.value = 'Unggah satu foto setiap kali.';
    return;
  }
  const first = files[0];
  if (first) acceptFile(first);
}

function onZoomSliderInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  if (Number.isFinite(value)) setZoom(value);
}

function zoomOut(): void {
  if (controlsDisabled.value) return;
  setZoom(zoom.value - ZOOM_BUTTON_STEP);
  if (zoom.value <= MIN_ZOOM) {
    void nextTick(() => zoomSliderRef.value?.focus());
  }
}

function zoomIn(): void {
  if (controlsDisabled.value) return;
  setZoom(zoom.value + ZOOM_BUTTON_STEP);
  if (zoom.value >= MAX_ZOOM) {
    void nextTick(() => zoomSliderRef.value?.focus());
  }
}

function resetPosition(): void {
  if (controlsDisabled.value) return;
  resetCropTransform();
  statusText.value = 'Posisi dan perbesaran gambar dipusatkan ulang.';
}

function onStagePointerDown(event: PointerEvent): void {
  if (controlsDisabled.value || !loadedImage.value) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;

  const pointerId = event.pointerId ?? 0;
  stageRef.value?.focus();
  const target = event.currentTarget as HTMLElement | null;
  target?.setPointerCapture?.(pointerId);

  activeDrag = {
    pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
    startPanX: panX.value,
    startPanY: panY.value,
  };
  draggingCanvas.value = true;
}

function onStagePointerMove(event: PointerEvent): void {
  const pointerId = event.pointerId ?? 0;
  if (!activeDrag || pointerId !== activeDrag.pointerId) return;
  const crop = currentCropRect();
  const canvas = canvasRef.value;
  if (!crop || !canvas) return;

  const rect = canvas.getBoundingClientRect();
  const displayWidth = rect.width > 0 ? rect.width : previewWidth.value;
  const displayHeight = rect.height > 0 ? rect.height : previewHeight.value;

  const dx = event.clientX - activeDrag.clientX;
  const dy = event.clientY - activeDrag.clientY;
  const scaleX = crop.sw / displayWidth;
  const scaleY = crop.sh / displayHeight;

  clampCurrentPan(activeDrag.startPanX - dx * scaleX, activeDrag.startPanY - dy * scaleY);
}

function endStageDrag(event: PointerEvent): void {
  const pointerId = event.pointerId ?? 0;
  if (!activeDrag || pointerId !== activeDrag.pointerId) return;
  const target = event.currentTarget as HTMLElement | null;
  if (target?.hasPointerCapture?.(pointerId)) {
    target.releasePointerCapture(pointerId);
  }
  activeDrag = null;
  draggingCanvas.value = false;
}

function onStageKeydown(event: KeyboardEvent): void {
  if (controlsDisabled.value) return;
  const crop = currentCropRect();
  const stepX = crop ? Math.max(10, Math.round(crop.sw * 0.05)) : 20;
  const stepY = crop ? Math.max(10, Math.round(crop.sh * 0.05)) : 20;

  switch (event.key) {
    case 'ArrowLeft':
      event.preventDefault();
      clampCurrentPan(panX.value - stepX, panY.value);
      break;
    case 'ArrowRight':
      event.preventDefault();
      clampCurrentPan(panX.value + stepX, panY.value);
      break;
    case 'ArrowUp':
      event.preventDefault();
      clampCurrentPan(panX.value, panY.value - stepY);
      break;
    case 'ArrowDown':
      event.preventDefault();
      clampCurrentPan(panX.value, panY.value + stepY);
      break;
    case '+':
    case '=':
      event.preventDefault();
      setZoom(zoom.value + ZOOM_BUTTON_STEP);
      break;
    case '-':
    case '_':
      event.preventDefault();
      setZoom(zoom.value - ZOOM_BUTTON_STEP);
      break;
    default:
      break;
  }
}

function handleClose(): void {
  if (controlsDisabled.value) return;
  emit('close');
}

async function handleSave(): Promise<void> {
  if (controlsDisabled.value) return;
  localError.value = '';

  const img = loadedImage.value;
  const crop = currentCropRect();
  if (!img || !crop || crop.sw <= 0 || crop.sh <= 0) {
    localError.value = 'Pilih foto terlebih dahulu.';
    return;
  }

  exporting.value = true;
  try {
    const blob = await exportCroppedCanvasBlob({
      image: img,
      crop,
      targetWidth: props.targetWidth,
      targetHeight: props.targetHeight,
    });
    const ext = blob.type === 'image/png' ? 'png' : 'webp';
    const mime = blob.type || 'image/webp';
    const file = new File([blob], `thumbnail.${ext}`, { type: mime });
    emit('save', file);
  } catch {
    localError.value = 'Foto tidak dapat diproses. Pilih foto lain lalu coba lagi.';
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <BaseModal
    :open="open"
    :title="title"
    :description="description"
    size="lg"
    :busy="busy || exporting"
    @close="handleClose"
  >
    <form
      v-if="open"
      novalidate
      class="space-y-4"
      data-test="image-crop-form"
      @submit.prevent="handleSave"
    >
      <div
        class="rounded-card border-border-strong flex flex-col gap-3 border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between"
        :class="draggingFile ? 'bg-surface-hover' : 'bg-surface'"
        data-test="crop-dropzone"
        @dragover.prevent="onFileDragOver"
        @dragleave="onFileDragLeave"
        @drop.prevent="onFileDrop"
      >
        <div class="space-y-1">
          <p class="text-brand-navy text-sm font-medium">
            {{
              activePreviewSrc
                ? 'Pilih foto lain atau atur posisi gambar di bawah.'
                : 'Pilih foto untuk dipangkas.'
            }}
          </p>
          <p :id="fileHintId" class="text-text-muted text-xs">
            Format JPEG, PNG, atau WebP, maksimal {{ PHOTO_MAX_MB_LABEL }}.
          </p>
        </div>

        <div class="shrink-0">
          <input
            :id="fileInputId"
            type="file"
            :accept="PHOTO_ACCEPT"
            class="peer sr-only"
            :disabled="controlsDisabled"
            :aria-describedby="fileHintId"
            data-test="crop-file-input"
            @change="onFileChange"
          />
          <label
            :for="fileInputId"
            class="rounded-btn border-brand-navy text-brand-navy hover:bg-surface-muted peer-focus-visible:ring-focus-ring peer-focus-visible:ring-offset-surface peer-disabled:border-border peer-disabled:text-text-muted inline-flex min-h-11 cursor-pointer items-center border-2 bg-white px-4 text-sm font-medium peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed"
            data-test="crop-pick-btn"
          >
            {{ activePreviewSrc ? 'Ganti foto' : 'Pilih foto' }}
          </label>
        </div>
      </div>

      <div class="space-y-2">
        <div
          ref="stageRef"
          tabindex="0"
          role="application"
          aria-label="Area pemangkasan gambar. Seret gambar atau gunakan tombol panah untuk menggeser, serta tombol plus atau minus untuk mengatur perbesaran."
          :aria-describedby="stageHintId"
          class="rounded-card border-border focus-visible:ring-focus-ring relative w-full overflow-hidden border bg-slate-900 select-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          :class="[loadedImage ? (draggingCanvas ? 'cursor-grabbing' : 'cursor-grab') : '']"
          :style="{ aspectRatio: String(aspectRatio) }"
          data-test="crop-stage"
          @pointerdown="onStagePointerDown"
          @pointermove="onStagePointerMove"
          @pointerup="endStageDrag"
          @pointercancel="endStageDrag"
          @keydown="onStageKeydown"
        >
          <canvas
            ref="canvasRef"
            :width="previewWidth"
            :height="previewHeight"
            class="block h-full w-full touch-none"
            data-test="crop-canvas"
          />

          <div
            aria-hidden="true"
            class="pointer-events-none absolute border-2 border-dashed border-white/85 shadow-[0_0_0_9999px_rgba(10,35,83,0.18)]"
            :style="safeZoneStyle"
            data-test="crop-safe-zone"
          />

          <div
            v-if="!activePreviewSrc"
            class="pointer-events-none absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-white/80"
            data-test="crop-empty"
          >
            Belum ada foto yang dipilih.
          </div>

          <div
            v-else-if="imageLoadError"
            class="pointer-events-none absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-white"
            data-test="crop-load-error"
          >
            Pratinjau gambar gagal dimuat. Pilih foto baru untuk melanjutkan.
          </div>
        </div>

        <p :id="stageHintId" class="text-text-muted text-xs">
          Area di dalam garis putus-putus tetap terlihat penuh pada kartu admin dan layar ponsel.
        </p>
      </div>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex flex-1 items-center gap-2">
          <BaseButton
            type="button"
            variant="secondary"
            size="sm"
            class="min-h-11 min-w-11"
            aria-label="Perkecil gambar"
            :disabled="controlsDisabled || zoom <= MIN_ZOOM"
            data-test="crop-zoom-out"
            @click="zoomOut"
          >
            -
          </BaseButton>

          <label :for="zoomSliderId" class="sr-only">Perbesaran gambar</label>
          <input
            :id="zoomSliderId"
            ref="zoomSliderRef"
            type="range"
            :min="MIN_ZOOM"
            :max="MAX_ZOOM"
            :step="ZOOM_SLIDER_STEP"
            :value="zoom"
            :aria-valuemin="MIN_ZOOM"
            :aria-valuemax="MAX_ZOOM"
            :aria-valuenow="zoom"
            :aria-valuetext="zoomPercentLabel"
            :disabled="controlsDisabled"
            class="accent-brand-navy h-2 flex-1 cursor-pointer"
            data-test="crop-zoom-slider"
            @input="onZoomSliderInput"
          />

          <BaseButton
            type="button"
            variant="secondary"
            size="sm"
            class="min-h-11 min-w-11"
            aria-label="Perbesar gambar"
            :disabled="controlsDisabled || zoom >= MAX_ZOOM"
            data-test="crop-zoom-in"
            @click="zoomIn"
          >
            +
          </BaseButton>

          <span
            class="text-text-muted w-12 text-right text-xs font-medium tabular-nums"
            data-test="crop-zoom-value"
          >
            {{ zoomPercentLabel }}
          </span>
        </div>

        <BaseButton
          type="button"
          variant="secondary"
          size="sm"
          class="min-h-11"
          :disabled="controlsDisabled"
          data-test="crop-reset"
          @click="resetPosition"
        >
          Pusatkan ulang
        </BaseButton>
      </div>

      <p class="sr-only" role="status" aria-live="polite" data-test="crop-status">
        {{ statusText }}
      </p>

      <AlertBanner
        v-if="shownError"
        :message="shownError"
        :kind="shownErrorKind"
        data-test="crop-error"
      />

      <div
        v-if="stale"
        class="rounded-card border-status-warning-border bg-status-warning-surface border px-4 py-3"
        data-test="crop-stale"
      >
        <p class="text-status-warning text-sm">
          Pengaturan gambar Anda masih ada di sini. Memuat versi terbaru tidak menghapus foto yang
          baru dipilih.
        </p>
        <BaseButton
          type="button"
          variant="secondary"
          size="sm"
          class="mt-3 min-h-11"
          :disabled="controlsDisabled"
          data-test="crop-reload"
          @click="emit('reload')"
        >
          Muat versi terbaru
        </BaseButton>
      </div>

      <div class="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <BaseButton
            v-if="hasCustomImage"
            type="button"
            variant="secondary"
            size="md"
            class="min-h-11"
            :disabled="controlsDisabled"
            data-test="crop-remove"
            @click="emit('remove')"
          >
            Hapus thumbnail
          </BaseButton>
        </div>

        <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <BaseButton
            type="button"
            variant="secondary"
            size="md"
            class="min-h-11"
            :disabled="controlsDisabled"
            data-test="crop-cancel"
            @click="handleClose"
          >
            Batal
          </BaseButton>
          <BaseButton
            type="submit"
            size="md"
            class="min-h-11"
            :disabled="controlsDisabled"
            data-test="crop-save"
          >
            {{ busy || exporting ? 'Menyimpan…' : 'Simpan' }}
          </BaseButton>
        </div>
      </div>
    </form>
  </BaseModal>
</template>
