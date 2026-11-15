<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import ImageCropModal from '../../common/ImageCropModal.vue';
import { useAuthenticatedBlobUrl } from '../../../composables/useAuthenticatedBlobUrl';
import { ceritaCoverFor } from '../../../content/ceritaCovers';
import { MediaUploadError, mediaPreviewPath, uploadMedia } from '../../../services/media.service';
import {
  DEFAULT_BANNER_ASPECT_RATIO,
  DEFAULT_BANNER_TARGET_HEIGHT,
  DEFAULT_BANNER_TARGET_WIDTH,
} from '../../../utils/imageCrop';
import type { FailureKind } from '../../../utils/userMessages';

/**
 * Thumbnail crop and upload dialog for one Cerita page.
 *
 * Wraps `ImageCropModal` with the banner aspect ratio (`1851 / 731`). When the page already has a
 * custom `coverAssetId`, its full preview is loaded via the authenticated client; otherwise the
 * bundled category photo (`ceritaCoverFor`) is shown as the starting preview.
 *
 * On save, the cropped file is uploaded with purpose `'cerita-cover'` and the resulting media id
 * is emitted via `submit` so the parent view can persist it (and handle stale-write reloads).
 */
const props = withDefaults(
  defineProps<{
    open: boolean;
    pageSlug: string;
    pageTitle: string;
    coverAssetId?: string | null;
    busy?: boolean;
    error?: string;
    /** Failure class of `error`, for AlertBanner. */
    errorKind?: FailureKind;
    stale?: boolean;
  }>(),
  {
    coverAssetId: null,
    busy: false,
    error: '',
    errorKind: undefined,
    stale: false,
  },
);

const emit = defineEmits<{
  (e: 'submit', coverAssetId: string): void;
  (e: 'remove'): void;
  (e: 'close'): void;
  (e: 'reload'): void;
}>();

const uploading = ref(false);
const uploadError = ref('');
const uploadErrorKind = ref<FailureKind | undefined>(undefined);
let unmounted = false;

onBeforeUnmount(() => {
  unmounted = true;
});

watch(
  () => props.open,
  () => {
    uploadError.value = '';
    uploadErrorKind.value = undefined;
  },
);

const customCoverPath = computed(() =>
  props.open && props.coverAssetId ? mediaPreviewPath(props.coverAssetId) : null,
);
const customCover = useAuthenticatedBlobUrl(customCoverPath);

const currentPreviewUrl = computed(() =>
  props.coverAssetId ? customCover.url.value : ceritaCoverFor(props.pageSlug),
);

const isBusy = computed(() => props.busy || uploading.value);
const combinedError = computed(() => uploadError.value || props.error);
const combinedErrorKind = computed(() =>
  uploadError.value ? uploadErrorKind.value : props.errorKind,
);

function clearUploadError(): void {
  uploadError.value = '';
  uploadErrorKind.value = undefined;
}

async function handleSave(file: File): Promise<void> {
  if (isBusy.value) return;
  clearUploadError();
  uploading.value = true;
  try {
    const result = await uploadMedia(file, 'cerita-cover');
    if (unmounted) return;
    emit('submit', result.id);
  } catch (error) {
    if (unmounted) return;
    if (error instanceof MediaUploadError) {
      uploadError.value = error.message;
      uploadErrorKind.value = error.status === 401 ? 'session' : undefined;
    } else {
      uploadError.value = 'Foto belum terunggah. Periksa koneksi lalu coba lagi.';
      uploadErrorKind.value = 'network';
    }
  } finally {
    if (!unmounted) uploading.value = false;
  }
}

function handleRemove(): void {
  if (isBusy.value) return;
  clearUploadError();
  emit('remove');
}

function handleClose(): void {
  if (isBusy.value) return;
  clearUploadError();
  emit('close');
}

function handleReload(): void {
  clearUploadError();
  emit('reload');
}
</script>

<template>
  <ImageCropModal
    :open="open"
    title="Ubah thumbnail halaman"
    :description="`Halaman “${pageTitle}”`"
    :aspect-ratio="DEFAULT_BANNER_ASPECT_RATIO"
    :target-width="DEFAULT_BANNER_TARGET_WIDTH"
    :target-height="DEFAULT_BANNER_TARGET_HEIGHT"
    :current-preview-url="currentPreviewUrl"
    :has-custom-image="Boolean(coverAssetId)"
    :busy="isBusy"
    :error="combinedError"
    :error-kind="combinedErrorKind"
    :stale="stale"
    @save="handleSave"
    @remove="handleRemove"
    @close="handleClose"
    @reload="handleReload"
  />
</template>
