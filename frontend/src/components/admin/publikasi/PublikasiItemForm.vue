<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import FormField from '../../common/FormField.vue';
import FormErrorSummary from '../../common/FormErrorSummary.vue';
import BaseButton from '../../common/BaseButton.vue';
import MediaDocumentField from '../../common/MediaDocumentField.vue';
import MediaPhotoField from '../../common/MediaPhotoField.vue';
import { INPUT_CLASSES } from '../../../utils/formStyles';
import { isValidPublishedAt } from '../../../content/publikasi';
import { uploadMedia, type MediaUploadResult } from '../../../services/media.service';
import { renderPdfFirstPage } from '../../../utils/pdfFirstPageCover';
import type { FormErrorEntry } from '../../data/blocks/blockFormShared';

/**
 * One publication of the `publikasi-katalog` block, edited in the `/admin/publikasi` dialog.
 *
 * The form holds a draft of one row and emits the finished row on submit; the parent builds the
 * whole list and saves it, so this component never talks to the API. Each row has one download
 * source: an uploaded file (PDF/DOCX), an https link, or none. Availability is derived from it
 * (a source means "tersedia", none means "segera hadir"), so the server's mismatch rule cannot be
 * violated. For an uploaded file the server fills the format and size from the stored asset. A
 * PDF's first page is rendered in the browser and uploaded as the cover when the row has none or
 * an automatic one; a cover chosen by hand is never overwritten. A stored size is kept byte-for-byte
 * until the editor changes it.
 */

const props = withDefaults(
  defineProps<{
    /** The stored publication, or null for a new one. */
    publication?: Record<string, unknown> | null;
    /** A save of the whole catalog is in flight; every control waits. */
    busy?: boolean;
    /** Prefix for field ids, so two open forms cannot clash. */
    idPrefix?: string;
  }>(),
  { publication: null, busy: false, idPrefix: 'publikasi-item' },
);

const emit = defineEmits<{
  (e: 'submit', publication: Record<string, unknown>): void;
  (e: 'cancel'): void;
  /** True while a file or cover upload is running, so the dialog cannot close mid-upload. */
  (e: 'busy', busy: boolean): void;
}>();

const MAX_PAGES = 100000;
const CATEGORY_MAX = 100;
const TITLE_MAX = 255;
const DESC_MAX = 1000;
const SOURCE_MAX = 500;
const FILE_TYPE_MAX = 20;

type SizeUnit = 'KB' | 'MB';
type SourceMode = 'none' | 'file' | 'link';

const COVER_NOTICE =
  'Sampul otomatis tidak dapat dibuat dari berkas ini. Unggah sampul secara manual.';

interface PublicationDraft {
  /** Stored row identity, passed through untouched when present. */
  id: string;
  mode: SourceMode;
  documentAssetId: string | null;
  /** Shown while a file is set: the stored format and size. */
  documentLabel: string;
  coverAssetId: string | null;
  coverIsAuto: boolean;
  coverNotice: string;
  category: string;
  title: string;
  description: string;
  source: string;
  pageCount: string;
  publishedAt: string;
  href: string;
  fileType: string;
  sizeValue: string;
  sizeUnit: SizeUnit;
  /** Stored size, kept so an untouched size is saved byte-for-byte. */
  originalBytes: number | null;
  initialSizeValue: string;
  initialSizeUnit: SizeUnit;
}

function fieldId(name: string): string {
  return `${props.idPrefix}-${name}`;
}

function displaySize(bytes: number | null): { value: string; unit: SizeUnit } {
  if (bytes === null) return { value: '', unit: 'MB' };
  if (bytes >= 1024 * 1024) {
    return { value: String(Number((bytes / (1024 * 1024)).toFixed(2))), unit: 'MB' };
  }
  return { value: String(Number((bytes / 1024).toFixed(2))), unit: 'KB' };
}

function describeFile(fileType: string, bytes: number | null): string {
  const size = bytes === null ? '' : displaySize(bytes);
  return [fileType, size ? `${size.value.replace('.', ',')} ${size.unit}` : '']
    .filter(Boolean)
    .join(', ');
}

function toDraft(raw: Record<string, unknown> | null): PublicationDraft {
  const row = raw ?? {};
  const documentAssetId = typeof row.documentAssetId === 'string' ? row.documentAssetId : null;
  const coverAssetId = typeof row.coverAssetId === 'string' ? row.coverAssetId : null;
  const hasHref = typeof row.href === 'string' && row.href.trim() !== '';
  const bytes =
    typeof row.fileSizeBytes === 'number' && Number.isFinite(row.fileSizeBytes)
      ? row.fileSizeBytes
      : null;
  const size = displaySize(bytes);
  const fileType = typeof row.fileType === 'string' ? row.fileType : '';
  return {
    id: typeof row.id === 'string' ? row.id : '',
    mode: documentAssetId ? 'file' : hasHref ? 'link' : 'none',
    documentAssetId,
    documentLabel: documentAssetId ? describeFile(fileType, bytes) : '',
    coverAssetId,
    coverIsAuto: coverAssetId !== null && row.coverIsAuto === true,
    coverNotice: '',
    category: typeof row.category === 'string' ? row.category : '',
    title: typeof row.title === 'string' ? row.title : '',
    description: typeof row.description === 'string' ? row.description : '',
    source: typeof row.source === 'string' ? row.source : '',
    pageCount: typeof row.pageCount === 'number' ? String(row.pageCount) : '',
    publishedAt: typeof row.publishedAt === 'string' ? row.publishedAt : '',
    href: typeof row.href === 'string' ? row.href : '',
    fileType,
    sizeValue: size.value,
    sizeUnit: size.unit,
    originalBytes: bytes,
    initialSizeValue: size.value,
    initialSizeUnit: size.unit,
  };
}

const draft = reactive<PublicationDraft>(toDraft(props.publication));

const uploadingCount = ref(0);
const uploading = computed(() => uploadingCount.value > 0);
function trackBusy(busy: boolean): void {
  uploadingCount.value = Math.max(0, uploadingCount.value + (busy ? 1 : -1));
}
watch(uploading, (value) => emit('busy', value));

const submitted = ref(false);

/** Empty means "no page count"; anything that is not a whole number in range is null. */
function parsePageCount(text: string): number | undefined | null {
  const value = text.trim();
  if (value === '') return undefined;
  if (!/^\d+$/.test(value)) return null;
  const pages = Number(value);
  return pages >= 1 && pages <= MAX_PAGES ? pages : null;
}

/** Parses the size input; undefined means "no size", null means "not a valid size". */
function parseSizeBytes(row: PublicationDraft): number | undefined | null {
  const text = row.sizeValue.trim();
  if (text === '') return undefined;
  if (
    row.originalBytes !== null &&
    text === row.initialSizeValue.trim() &&
    row.sizeUnit === row.initialSizeUnit
  ) {
    return row.originalBytes;
  }
  if (!/^\d+([.,]\d+)?$/.test(text)) return null;
  const amount = Number(text.replace(',', '.'));
  const bytes = Math.round(amount * 1024 ** (row.sizeUnit === 'MB' ? 2 : 1));
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : null;
}

function isHttpsAddress(value: string): boolean {
  if (!value.startsWith('https://')) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

const fieldErrors = computed<Record<string, string>>(() => {
  const errors: Record<string, string> = {};

  const category = draft.category.trim();
  if (!category) errors.category = 'Kategori wajib diisi.';
  else if (category.length > CATEGORY_MAX)
    errors.category = `Kategori maksimal ${CATEGORY_MAX} karakter.`;

  const title = draft.title.trim();
  if (!title) errors.title = 'Judul wajib diisi.';
  else if (title.length > TITLE_MAX) errors.title = `Judul maksimal ${TITLE_MAX} karakter.`;

  const description = draft.description.trim();
  if (!description) errors.description = 'Deskripsi wajib diisi.';
  else if (description.length > DESC_MAX)
    errors.description = `Deskripsi maksimal ${DESC_MAX} karakter.`;

  if (draft.source.trim().length > SOURCE_MAX)
    errors.source = `Sumber maksimal ${SOURCE_MAX} karakter.`;

  if (parsePageCount(draft.pageCount) === null)
    errors.pageCount = `Jumlah halaman harus bilangan bulat antara 1 dan ${MAX_PAGES}.`;

  const publishedAt = draft.publishedAt.trim();
  if (publishedAt && !isValidPublishedAt(publishedAt))
    errors.publishedAt = 'Tanggal terbit harus berformat YYYY-MM atau YYYY-MM-DD.';

  if (draft.mode === 'file' && !draft.documentAssetId)
    errors.mode = 'Pilih berkas yang akan diunggah.';

  if (draft.mode === 'link') {
    const href = draft.href.trim();
    if (href && !isHttpsAddress(href))
      errors.href = 'Tautan harus alamat yang diawali https:// dan berupa alamat yang valid.';

    if (draft.fileType.trim().length > FILE_TYPE_MAX)
      errors.fileType = `Format berkas maksimal ${FILE_TYPE_MAX} karakter.`;

    if (parseSizeBytes(draft) === null)
      errors.size = 'Ukuran berkas harus berupa angka lebih dari 0.';
  }
  return errors;
});

const FIELD_NAMES = [
  'category',
  'title',
  'description',
  'source',
  'pageCount',
  'publishedAt',
  'mode',
  'href',
  'fileType',
  'size',
] as const;

const errorEntries = computed<FormErrorEntry[]>(() =>
  FIELD_NAMES.map((name) => ({
    fieldId: fieldId(name),
    message: fieldErrors.value[name],
  })).filter((entry): entry is FormErrorEntry => Boolean(entry.message)),
);

/** Keys this form owns. Any other key of the stored item is not the form's and is passed through. */
const FORM_KEYS = new Set([
  'id',
  'category',
  'title',
  'description',
  'source',
  'pageCount',
  'publishedAt',
  'href',
  'documentAssetId',
  'coverAssetId',
  'coverIsAuto',
  'fileType',
  'fileSizeBytes',
  'isAvailableOnline',
]);

function buildPublication(): Record<string, unknown> {
  const original = props.publication ?? {};
  // Keys this form does not edit (added by another tool or a later version) survive the save.
  const passthrough = Object.fromEntries(
    Object.entries(original).filter(([key]) => !FORM_KEYS.has(key)),
  );
  const href = draft.mode === 'link' ? draft.href.trim() : '';
  const documentAssetId = draft.mode === 'file' ? draft.documentAssetId : null;
  const source = draft.source.trim();
  const fileType = draft.mode === 'link' ? draft.fileType.trim() : '';
  const size = draft.mode === 'link' ? parseSizeBytes(draft) : undefined;
  const pageCount = parsePageCount(draft.pageCount);
  const publishedAt = draft.publishedAt.trim();
  // A file row keeps the format and size the server derived from its asset (the server re-derives
  // them on save anyway); only while it is still the same file the row was loaded with.
  const sameFile = documentAssetId !== null && original.documentAssetId === documentAssetId;
  const derivedType = sameFile && typeof original.fileType === 'string' ? original.fileType : '';
  const derivedBytes =
    sameFile && typeof original.fileSizeBytes === 'number' ? original.fileSizeBytes : undefined;
  return {
    ...passthrough,
    ...(draft.id ? { id: draft.id } : {}),
    category: draft.category.trim(),
    title: draft.title.trim(),
    description: draft.description.trim(),
    ...(source ? { source } : {}),
    ...(typeof pageCount === 'number' ? { pageCount } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    ...(href ? { href } : {}),
    ...(documentAssetId ? { documentAssetId } : {}),
    ...(draft.coverAssetId
      ? {
          coverAssetId: draft.coverAssetId,
          // The flag only means something while the row still has the document it came from.
          ...(draft.coverIsAuto && documentAssetId ? { coverIsAuto: true } : {}),
        }
      : {}),
    ...(fileType ? { fileType } : {}),
    ...(!fileType && derivedType ? { fileType: derivedType } : {}),
    ...(typeof size === 'number' ? { fileSizeBytes: size } : {}),
    ...(typeof size !== 'number' && typeof derivedBytes === 'number'
      ? { fileSizeBytes: derivedBytes }
      : {}),
    isAvailableOnline: href !== '' || documentAssetId !== null,
  };
}

function handleSubmit(): void {
  submitted.value = true;
  if (errorEntries.value.length > 0 || props.busy || uploading.value) return;
  emit('submit', buildPublication());
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

/** A document was uploaded: remember its facts and, for a PDF, make the automatic cover. */
async function onDocumentUploaded(result: MediaUploadResult, file: File): Promise<void> {
  draft.documentLabel = describeFile(isPdf(file) ? 'PDF' : 'DOCX', result.byteSize);
  draft.coverNotice = '';
  if (!isPdf(file)) return;
  if (draft.coverAssetId && !draft.coverIsAuto) return; // a cover chosen by hand stays

  // The row still owns this upload: the editor may have swapped or removed the document, or
  // switched the source, while page 1 was rendering or the cover was uploading.
  const ownsUpload = (): boolean =>
    draft.mode === 'file' && draft.documentAssetId === result.id;

  trackBusy(true);
  try {
    const cover = await renderPdfFirstPage(file);
    if (!ownsUpload()) return;
    if (!cover) {
      draft.coverNotice = COVER_NOTICE;
      return;
    }
    try {
      const uploaded = await uploadMedia(cover, 'publikasi-cover');
      if (!ownsUpload()) return;
      // The editor may have picked a cover by hand while this one was uploading.
      if (draft.coverAssetId && !draft.coverIsAuto) return;
      draft.coverAssetId = uploaded.id;
      draft.coverIsAuto = true;
    } catch {
      if (ownsUpload()) draft.coverNotice = COVER_NOTICE;
    }
  } finally {
    trackBusy(false);
  }
}

function onDocumentChanged(value: string | null): void {
  draft.documentAssetId = value;
  if (value === null) draft.documentLabel = '';
  // An automatic cover is page 1 of the previous file, so it never outlives it: a new PDF gets a
  // fresh one right after the upload, and a DOCX or a failed render leaves the row without one.
  // A cover chosen by hand stays.
  if (draft.coverIsAuto) {
    draft.coverAssetId = null;
    draft.coverIsAuto = false;
  }
}

/** Leaving "Unggah berkas" drops the document, so an automatic cover (its page 1) goes too. */
function onModeChanged(): void {
  if (draft.mode !== 'file' && draft.coverIsAuto) {
    draft.coverAssetId = null;
    draft.coverIsAuto = false;
  }
}

function onCoverChanged(value: string | null): void {
  // Any change made through the photo field is the editor's own choice.
  draft.coverAssetId = value;
  draft.coverIsAuto = false;
  draft.coverNotice = '';
}
</script>

<template>
  <form novalidate class="space-y-5" aria-label="Isian publikasi" @submit.prevent="handleSubmit">
    <FormErrorSummary
      v-if="submitted && errorEntries.length > 0"
      :errors="errorEntries"
    />

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <FormField
        :id="fieldId('category')"
        label="Kategori"
        hint="Contoh: Statistik, Infografis."
        :error="submitted ? fieldErrors.category : undefined"
        required
        v-slot="{ describedBy, invalid }"
      >
        <input
          :id="fieldId('category')"
          v-model="draft.category"
          type="text"
          :maxlength="CATEGORY_MAX"
          :class="INPUT_CLASSES"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
        />
      </FormField>
      <FormField
        :id="fieldId('title')"
        label="Judul"
        :error="submitted ? fieldErrors.title : undefined"
        required
        v-slot="{ describedBy, invalid }"
      >
        <input
          :id="fieldId('title')"
          v-model="draft.title"
          type="text"
          :maxlength="TITLE_MAX"
          :class="INPUT_CLASSES"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
        />
      </FormField>
    </div>

    <FormField
      :id="fieldId('description')"
      label="Deskripsi"
      :error="submitted ? fieldErrors.description : undefined"
      required
      v-slot="{ describedBy, invalid }"
    >
      <textarea
        :id="fieldId('description')"
        v-model="draft.description"
        rows="3"
        :maxlength="DESC_MAX"
        :class="INPUT_CLASSES"
        :aria-describedby="describedBy"
        :aria-invalid="invalid ? 'true' : undefined"
      ></textarea>
    </FormField>

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <FormField
        :id="fieldId('pageCount')"
        label="Jumlah halaman (opsional)"
        hint="Angka bulat, 1 sampai 100000."
        :error="submitted ? fieldErrors.pageCount : undefined"
        v-slot="{ describedBy, invalid }"
      >
        <input
          :id="fieldId('pageCount')"
          v-model="draft.pageCount"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          :class="INPUT_CLASSES"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
          data-test="pub-pageCount"
        />
      </FormField>
      <FormField
        :id="fieldId('publishedAt')"
        label="Tanggal terbit (opsional)"
        hint="Contoh: 2026-03 atau 2026-03-15. Yang tampil hanya bulan dan tahun."
        :error="submitted ? fieldErrors.publishedAt : undefined"
        v-slot="{ describedBy, invalid }"
      >
        <input
          :id="fieldId('publishedAt')"
          v-model="draft.publishedAt"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          :class="INPUT_CLASSES"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
          data-test="pub-publishedAt"
        />
      </FormField>
    </div>

    <FormField
      :id="fieldId('source')"
      label="Sumber rujukan (opsional)"
      hint="Nama berkas atau dokumen asal data, agar warga bisa menelusurinya."
      :error="submitted ? fieldErrors.source : undefined"
      v-slot="{ describedBy, invalid }"
    >
      <input
        :id="fieldId('source')"
        v-model="draft.source"
        type="text"
        :maxlength="SOURCE_MAX"
        :class="INPUT_CLASSES"
        :aria-describedby="describedBy"
        :aria-invalid="invalid ? 'true' : undefined"
      />
    </FormField>

    <FormField
      :id="fieldId('mode')"
      label="Sumber unduhan"
      hint="Pilih “Segera hadir” jika berkasnya belum bisa dibuka warga."
      :error="submitted ? fieldErrors.mode : undefined"
      v-slot="{ describedBy, invalid }"
    >
      <select
        :id="fieldId('mode')"
        v-model="draft.mode"
        :class="INPUT_CLASSES"
        :aria-describedby="describedBy"
        :aria-invalid="invalid ? 'true' : undefined"
        data-test="pub-mode"
        @change="onModeChanged"
      >
        <option value="none">Segera hadir (belum ada berkas)</option>
        <option value="file">Unggah berkas (PDF atau DOCX)</option>
        <option value="link">Tautan ke situs lain (https)</option>
      </select>
    </FormField>

    <MediaDocumentField
      v-if="draft.mode === 'file'"
      :model-value="draft.documentAssetId"
      purpose="publikasi-document"
      label="publikasi ini"
      :current-label="draft.documentLabel"
      :disabled="busy"
      :input-id="fieldId('document')"
      @update:model-value="onDocumentChanged"
      @uploaded="(result, file) => onDocumentUploaded(result, file)"
      @busy="trackBusy"
    />

    <template v-if="draft.mode === 'link'">
      <FormField
        :id="fieldId('href')"
        label="Tautan unduhan"
        hint="Harus diawali https://."
        :error="submitted ? fieldErrors.href : undefined"
        v-slot="{ describedBy, invalid }"
      >
        <input
          :id="fieldId('href')"
          v-model="draft.href"
          type="text"
          inputmode="url"
          autocomplete="off"
          :class="INPUT_CLASSES"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
        />
      </FormField>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField
          :id="fieldId('fileType')"
          label="Format berkas (opsional)"
          hint="Contoh: PDF, XLSX."
          :error="submitted ? fieldErrors.fileType : undefined"
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="fieldId('fileType')"
            v-model="draft.fileType"
            type="text"
            :maxlength="FILE_TYPE_MAX"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
          />
        </FormField>

        <FormField
          :id="fieldId('size')"
          label="Ukuran berkas (opsional)"
          :error="submitted ? fieldErrors.size : undefined"
          v-slot="{ describedBy, invalid }"
        >
          <div class="flex gap-2">
            <input
              :id="fieldId('size')"
              v-model="draft.sizeValue"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              :class="INPUT_CLASSES"
              :aria-describedby="describedBy"
              :aria-invalid="invalid ? 'true' : undefined"
            />
            <select
              v-model="draft.sizeUnit"
              :class="INPUT_CLASSES"
              class="w-24 shrink-0"
              aria-label="Satuan ukuran berkas"
            >
              <option value="KB">KB</option>
              <option value="MB">MB</option>
            </select>
          </div>
        </FormField>
      </div>
    </template>

    <p class="text-text-muted text-sm" data-test="pub-status">
      Status:
      <span class="text-brand-navy font-semibold">{{
        draft.mode === 'file' && draft.documentAssetId
          ? 'Tersedia untuk diunduh'
          : draft.mode === 'link' && draft.href.trim()
            ? 'Tersedia untuk diunduh'
            : 'Segera hadir'
      }}</span>
    </p>

    <div class="border-border space-y-2 border-t pt-4" data-test="pub-cover">
      <MediaPhotoField
        :model-value="draft.coverAssetId"
        purpose="publikasi-cover"
        label="Sampul (opsional)"
        :disabled="busy"
        :input-id="fieldId('cover')"
        preview-alt="Pratinjau sampul publikasi"
        @update:model-value="onCoverChanged"
        @busy="trackBusy"
      />
      <p
        v-if="draft.coverAssetId && draft.coverIsAuto"
        class="text-text-muted text-xs"
        data-test="cover-auto-note"
      >
        Sampul ini dibuat otomatis dari halaman pertama berkas. Ganti foto untuk memakai sampul
        lain.
      </p>
      <p
        v-if="draft.coverNotice"
        class="text-status-warning text-sm"
        role="status"
        data-test="cover-notice"
      >
        {{ draft.coverNotice }}
      </p>
    </div>

    <div class="border-border flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-end">
      <BaseButton
        type="button"
        variant="secondary"
        size="md"
        class="min-h-11"
        :disabled="busy || uploading"
        data-test="item-cancel"
        @click="emit('cancel')"
      >
        Batal
      </BaseButton>
      <BaseButton
        type="submit"
        size="md"
        class="min-h-11"
        :disabled="busy || uploading"
        data-test="item-save"
      >
        {{ busy ? 'Menyimpan…' : 'Simpan publikasi' }}
      </BaseButton>
    </div>
  </form>
</template>
