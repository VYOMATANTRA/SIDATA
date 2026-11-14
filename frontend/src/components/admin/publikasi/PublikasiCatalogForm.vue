<script setup lang="ts">
import { computed, ref } from 'vue';
import FormField from '../../common/FormField.vue';
import BaseButton from '../../common/BaseButton.vue';
import MediaDocumentField from '../../common/MediaDocumentField.vue';
import MediaPhotoField from '../../common/MediaPhotoField.vue';
import { INPUT_CLASSES } from '../../../utils/formStyles';
import { PUBLICATIONS } from '../../../content/publikasi';
import { uploadMedia, type MediaUploadResult } from '../../../services/media.service';
import { renderPdfFirstPage } from '../../../utils/pdfFirstPageCover';
import BlockFormShell from '../../data/blocks/BlockFormShell.vue';
import CollectionRowActions from '../../data/blocks/CollectionRowActions.vue';
import {
  BLOCK_FORM_DEFAULTS,
  titleBodyEntries,
  useRepeatableRows,
  validateTitleBody,
  type BlockFormProps,
  type BlockSavePayload,
  type FormErrorEntry,
} from '../../data/blocks/blockFormShared';

/**
 * Katalog Publikasi: one row per document. Saved as `metadata.publications[]`.
 *
 * Each row has one download source: an uploaded file (PDF/DOCX), an https link, or none.
 * Availability is derived from it (a source means "tersedia", none means "segera hadir"), so the
 * server's mismatch rule cannot be violated. For an uploaded file the server fills the format and
 * size from the stored asset. A PDF's first page is rendered in the browser and uploaded as the
 * cover when the row has none or an automatic one; a cover chosen by hand is never overwritten.
 * A saved empty list stays empty (SPEC §8, settled D2); defaults are only pre-filled when the
 * block has never stored a list at all.
 */
const props = withDefaults(defineProps<BlockFormProps>(), BLOCK_FORM_DEFAULTS);

const emit = defineEmits<{
  (e: 'submit', payload: BlockSavePayload): void;
  (e: 'cancel'): void;
  (e: 'reload'): void;
}>();

const MAX_ITEMS = 25;
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

function toDraft(raw: unknown): PublicationDraft {
  const row = (raw ?? {}) as Record<string, unknown>;
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
    href: typeof row.href === 'string' ? row.href : '',
    fileType: typeof row.fileType === 'string' ? row.fileType : '',
    sizeValue: size.value,
    sizeUnit: size.unit,
    originalBytes: bytes,
    initialSizeValue: size.value,
    initialSizeUnit: size.unit,
  };
}

function readPublications(meta: Record<string, unknown> | null): PublicationDraft[] {
  const raw = meta?.publications;
  // Only a block that never stored a list shows the built-in catalog; a saved [] stays empty.
  if (!Array.isArray(raw)) return PUBLICATIONS.map((item) => toDraft(item));
  return raw.map((item) => toDraft(item));
}

const uploadingCount = ref(0);
const shellBusy = computed(() => props.busy || uploadingCount.value > 0);
function trackBusy(busy: boolean): void {
  uploadingCount.value = Math.max(0, uploadingCount.value + (busy ? 1 : -1));
}

const title = ref(props.block.title ?? '');
const body = ref(props.block.body ?? '');
const submitted = ref(false);

const { rows, announcement, isFull, add, remove, move } = useRepeatableRows<PublicationDraft>(
  readPublications(props.block.metadata),
  {
    max: MAX_ITEMS,
    makeEmpty: () => toDraft({}),
    noun: 'publikasi',
    ids: {
      firstField: (i) => fieldId(`pub-category-${i}`),
      moveUp: (i) => fieldId(`pub-up-${i}`),
      moveDown: (i) => fieldId(`pub-down-${i}`),
      add: fieldId('pub-add'),
    },
  },
);

// The catalog title is required by the server (unlike other blocks), so ask for it here instead of
// letting a blank one be quietly replaced.
const titleBodyErrors = computed(() => {
  const errors = validateTitleBody(title.value, body.value);
  if (!title.value.trim()) errors.title = 'Judul katalog wajib diisi.';
  return errors;
});

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

const FIELD_NAMES = [
  'category',
  'title',
  'description',
  'source',
  'mode',
  'href',
  'fileType',
  'size',
] as const;

const fieldErrors = computed<Record<string, string>>(() => {
  const errors: Record<string, string> = {};
  rows.value.forEach((row, index) => {
    const label = `Publikasi ${index + 1}`;
    const category = row.category.trim();
    if (!category) errors[`pub-category-${index}`] = `${label}: kategori wajib diisi.`;
    else if (category.length > CATEGORY_MAX)
      errors[`pub-category-${index}`] = `${label}: kategori maksimal ${CATEGORY_MAX} karakter.`;

    const rowTitle = row.title.trim();
    if (!rowTitle) errors[`pub-title-${index}`] = `${label}: judul wajib diisi.`;
    else if (rowTitle.length > TITLE_MAX)
      errors[`pub-title-${index}`] = `${label}: judul maksimal ${TITLE_MAX} karakter.`;

    const description = row.description.trim();
    if (!description) errors[`pub-description-${index}`] = `${label}: deskripsi wajib diisi.`;
    else if (description.length > DESC_MAX)
      errors[`pub-description-${index}`] = `${label}: deskripsi maksimal ${DESC_MAX} karakter.`;

    if (row.source.trim().length > SOURCE_MAX)
      errors[`pub-source-${index}`] = `${label}: sumber maksimal ${SOURCE_MAX} karakter.`;

    if (row.mode === 'file' && !row.documentAssetId)
      errors[`pub-mode-${index}`] = `${label}: pilih berkas yang akan diunggah.`;

    if (row.mode === 'link') {
      const href = row.href.trim();
      if (href && !isHttpsAddress(href))
        errors[`pub-href-${index}`] =
          `${label}: tautan harus alamat yang diawali https:// dan berupa alamat yang valid.`;

      if (row.fileType.trim().length > FILE_TYPE_MAX)
        errors[`pub-fileType-${index}`] =
          `${label}: format berkas maksimal ${FILE_TYPE_MAX} karakter.`;

      if (parseSizeBytes(row) === null)
        errors[`pub-size-${index}`] = `${label}: ukuran berkas harus berupa angka lebih dari 0.`;
    }
  });
  return errors;
});

const errorEntries = computed<FormErrorEntry[]>(() => [
  ...titleBodyEntries(props.idPrefix, titleBodyErrors.value),
  ...rows.value.flatMap((_, i) =>
    FIELD_NAMES.map((name) => ({
      fieldId: fieldId(`pub-${name}-${i}`),
      message: fieldErrors.value[`pub-${name}-${i}`],
    })).filter((entry): entry is FormErrorEntry => Boolean(entry.message)),
  ),
]);

function handleSubmit(): void {
  submitted.value = true;
  if (errorEntries.value.length > 0 || shellBusy.value) return;

  const publications = rows.value.map((row) => {
    const href = row.mode === 'link' ? row.href.trim() : '';
    const documentAssetId = row.mode === 'file' ? row.documentAssetId : null;
    const source = row.source.trim();
    const fileType = row.mode === 'link' ? row.fileType.trim() : '';
    const size = row.mode === 'link' ? parseSizeBytes(row) : undefined;
    return {
      ...(row.id ? { id: row.id } : {}),
      category: row.category.trim(),
      title: row.title.trim(),
      description: row.description.trim(),
      ...(source ? { source } : {}),
      ...(href ? { href } : {}),
      ...(documentAssetId ? { documentAssetId } : {}),
      ...(row.coverAssetId
        ? {
            coverAssetId: row.coverAssetId,
            // The flag only means something while the row still has the document it came from.
            ...(row.coverIsAuto && documentAssetId ? { coverIsAuto: true } : {}),
          }
        : {}),
      ...(fileType ? { fileType } : {}),
      ...(typeof size === 'number' ? { fileSizeBytes: size } : {}),
      isAvailableOnline: href !== '' || documentAssetId !== null,
    };
  });

  emit('submit', {
    title: title.value.trim() || null,
    body: body.value.trim(),
    metadata: { publications },
  });
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

function findRow(uid: number) {
  return rows.value.find((r) => r.uid === uid);
}

/** A document was uploaded: remember its facts and, for a PDF, make the automatic cover. */
async function onDocumentUploaded(
  uid: number,
  result: MediaUploadResult,
  file: File,
): Promise<void> {
  const row = findRow(uid);
  if (!row) return;
  row.documentLabel = describeFile(isPdf(file) ? 'PDF' : 'DOCX', result.byteSize);
  row.coverNotice = '';
  if (!isPdf(file)) return;
  if (row.coverAssetId && !row.coverIsAuto) return; // a cover chosen by hand stays

  // The row still owns this upload: the editor may have swapped or removed the document, or
  // switched the source, while page 1 was rendering or the cover was uploading.
  const ownsUpload = (candidate: { mode: SourceMode; documentAssetId: string | null }): boolean =>
    candidate.mode === 'file' && candidate.documentAssetId === result.id;

  trackBusy(true);
  try {
    const cover = await renderPdfFirstPage(file);
    const target = findRow(uid);
    if (!target || !ownsUpload(target)) return;
    if (!cover) {
      target.coverNotice = COVER_NOTICE;
      return;
    }
    try {
      const uploaded = await uploadMedia(cover, 'publikasi-cover');
      const still = findRow(uid);
      if (!still || !ownsUpload(still)) return;
      // The editor may have picked a cover by hand while this one was uploading.
      if (still.coverAssetId && !still.coverIsAuto) return;
      still.coverAssetId = uploaded.id;
      still.coverIsAuto = true;
    } catch {
      const still = findRow(uid);
      if (still && ownsUpload(still)) still.coverNotice = COVER_NOTICE;
    }
  } finally {
    trackBusy(false);
  }
}

function onDocumentChanged(row: PublicationDraft, value: string | null): void {
  row.documentAssetId = value;
  if (value === null) row.documentLabel = '';
  // An automatic cover is page 1 of the previous file, so it never outlives it: a new PDF gets a
  // fresh one right after the upload, and a DOCX or a failed render leaves the row without one.
  // A cover chosen by hand stays.
  if (row.coverIsAuto) {
    row.coverAssetId = null;
    row.coverIsAuto = false;
  }
}

/** Leaving "Unggah berkas" drops the document, so an automatic cover (its page 1) goes too. */
function onModeChanged(row: PublicationDraft): void {
  if (row.mode !== 'file' && row.coverIsAuto) {
    row.coverAssetId = null;
    row.coverIsAuto = false;
  }
}

function onCoverChanged(row: PublicationDraft, value: string | null): void {
  // Any change made through the photo field is the editor's own choice.
  row.coverAssetId = value;
  row.coverIsAuto = false;
  row.coverNotice = '';
}
</script>

<template>
  <BlockFormShell
    v-model:title="title"
    v-model:body="body"
    :id-prefix="idPrefix"
    :busy="shellBusy"
    :server-error="serverError"
    :submitted="submitted"
    :errors="errorEntries"
    title-required
    title-hint="Judul katalog yang ditampilkan di atas daftar publikasi."
    :title-error="titleBodyErrors.title"
    :body-error="titleBodyErrors.body"
    :placement="placement"
    :shown-on-site="shownOnSite"
    :stale="stale"
    @submit="handleSubmit"
    @cancel="emit('cancel')"
    @reload="emit('reload')"
  >
    <fieldset class="rounded-card border-border bg-surface-muted space-y-4 border p-4">
      <legend class="text-brand-navy px-1 text-sm font-semibold">Daftar publikasi</legend>
      <p class="text-text-muted text-sm">
        Maksimal {{ MAX_ITEMS }} publikasi. Unggah berkas atau isi tautan hanya jika berkasnya sudah
        bisa dibuka warga; tanpa itu, publikasi tampil sebagai “Segera hadir”. Untuk berkas PDF,
        halaman pertamanya dipakai sebagai sampul, dan sampul bisa diganti.
      </p>

      <p
        v-if="rows.length === 0"
        class="rounded-btn border-border-strong bg-surface text-text-muted border border-dashed px-3 py-4 text-sm"
        data-test="publications-empty"
      >
        Belum ada publikasi. Jika disimpan seperti ini, halaman Publikasi menampilkan daftar kosong.
      </p>

      <ol class="space-y-4">
        <li
          v-for="(row, index) in rows"
          :key="row.uid"
          class="rounded-btn border-border bg-surface space-y-3 border p-3"
        >
          <p class="text-brand-navy text-sm font-semibold">
            Publikasi {{ index + 1 }}<span v-if="row.title.trim()">: {{ row.title.trim() }}</span>
          </p>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              :id="fieldId(`pub-category-${index}`)"
              label="Kategori"
              hint="Contoh: Statistik, Infografis."
              :error="submitted ? fieldErrors[`pub-category-${index}`] : undefined"
              required
              v-slot="{ describedBy, invalid }"
            >
              <input
                :id="fieldId(`pub-category-${index}`)"
                v-model="row.category"
                type="text"
                :maxlength="CATEGORY_MAX"
                :class="INPUT_CLASSES"
                :aria-describedby="describedBy"
                :aria-invalid="invalid ? 'true' : undefined"
              />
            </FormField>
            <FormField
              :id="fieldId(`pub-title-${index}`)"
              label="Judul"
              :error="submitted ? fieldErrors[`pub-title-${index}`] : undefined"
              required
              v-slot="{ describedBy, invalid }"
            >
              <input
                :id="fieldId(`pub-title-${index}`)"
                v-model="row.title"
                type="text"
                :maxlength="TITLE_MAX"
                :class="INPUT_CLASSES"
                :aria-describedby="describedBy"
                :aria-invalid="invalid ? 'true' : undefined"
              />
            </FormField>
          </div>

          <FormField
            :id="fieldId(`pub-description-${index}`)"
            label="Deskripsi"
            :error="submitted ? fieldErrors[`pub-description-${index}`] : undefined"
            required
            v-slot="{ describedBy, invalid }"
          >
            <textarea
              :id="fieldId(`pub-description-${index}`)"
              v-model="row.description"
              rows="3"
              :maxlength="DESC_MAX"
              :class="INPUT_CLASSES"
              :aria-describedby="describedBy"
              :aria-invalid="invalid ? 'true' : undefined"
            ></textarea>
          </FormField>

          <FormField
            :id="fieldId(`pub-source-${index}`)"
            label="Sumber rujukan (opsional)"
            hint="Nama berkas atau dokumen asal data, agar warga bisa menelusurinya."
            :error="submitted ? fieldErrors[`pub-source-${index}`] : undefined"
            v-slot="{ describedBy, invalid }"
          >
            <input
              :id="fieldId(`pub-source-${index}`)"
              v-model="row.source"
              type="text"
              :maxlength="SOURCE_MAX"
              :class="INPUT_CLASSES"
              :aria-describedby="describedBy"
              :aria-invalid="invalid ? 'true' : undefined"
            />
          </FormField>

          <FormField
            :id="fieldId(`pub-mode-${index}`)"
            label="Sumber unduhan"
            hint="Pilih “Segera hadir” jika berkasnya belum bisa dibuka warga."
            :error="submitted ? fieldErrors[`pub-mode-${index}`] : undefined"
            v-slot="{ describedBy, invalid }"
          >
            <select
              :id="fieldId(`pub-mode-${index}`)"
              v-model="row.mode"
              @change="onModeChanged(row)"
              :class="INPUT_CLASSES"
              :aria-describedby="describedBy"
              :aria-invalid="invalid ? 'true' : undefined"
              data-test="pub-mode"
            >
              <option value="none">Segera hadir (belum ada berkas)</option>
              <option value="file">Unggah berkas (PDF atau DOCX)</option>
              <option value="link">Tautan ke situs lain (https)</option>
            </select>
          </FormField>

          <MediaDocumentField
            v-if="row.mode === 'file'"
            :model-value="row.documentAssetId"
            purpose="publikasi-document"
            :label="`publikasi ${index + 1}`"
            :current-label="row.documentLabel"
            :disabled="busy"
            :input-id="fieldId(`pub-document-${index}`)"
            @update:model-value="onDocumentChanged(row, $event)"
            @uploaded="(result, file) => onDocumentUploaded(row.uid, result, file)"
            @busy="trackBusy"
          />

          <template v-if="row.mode === 'link'">
            <FormField
              :id="fieldId(`pub-href-${index}`)"
              label="Tautan unduhan"
              hint="Harus diawali https://."
              :error="submitted ? fieldErrors[`pub-href-${index}`] : undefined"
              v-slot="{ describedBy, invalid }"
            >
              <input
                :id="fieldId(`pub-href-${index}`)"
                v-model="row.href"
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
                :id="fieldId(`pub-fileType-${index}`)"
                label="Format berkas (opsional)"
                hint="Contoh: PDF, XLSX."
                :error="submitted ? fieldErrors[`pub-fileType-${index}`] : undefined"
                v-slot="{ describedBy, invalid }"
              >
                <input
                  :id="fieldId(`pub-fileType-${index}`)"
                  v-model="row.fileType"
                  type="text"
                  :maxlength="FILE_TYPE_MAX"
                  :class="INPUT_CLASSES"
                  :aria-describedby="describedBy"
                  :aria-invalid="invalid ? 'true' : undefined"
                />
              </FormField>

              <FormField
                :id="fieldId(`pub-size-${index}`)"
                label="Ukuran berkas (opsional)"
                :error="submitted ? fieldErrors[`pub-size-${index}`] : undefined"
                v-slot="{ describedBy, invalid }"
              >
                <div class="flex gap-2">
                  <input
                    :id="fieldId(`pub-size-${index}`)"
                    v-model="row.sizeValue"
                    type="text"
                    inputmode="decimal"
                    autocomplete="off"
                    :class="INPUT_CLASSES"
                    :aria-describedby="describedBy"
                    :aria-invalid="invalid ? 'true' : undefined"
                  />
                  <select
                    v-model="row.sizeUnit"
                    :class="INPUT_CLASSES"
                    class="w-24 shrink-0"
                    :aria-label="`Satuan ukuran berkas publikasi ${index + 1}`"
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
              row.mode === 'file' && row.documentAssetId
                ? 'Tersedia untuk diunduh'
                : row.mode === 'link' && row.href.trim()
                  ? 'Tersedia untuk diunduh'
                  : 'Segera hadir'
            }}</span>
          </p>

          <div class="border-border space-y-2 border-t pt-3" data-test="pub-cover">
            <MediaPhotoField
              :model-value="row.coverAssetId"
              purpose="publikasi-cover"
              :label="`Sampul publikasi ${index + 1} (opsional)`"
              :disabled="busy"
              :input-id="fieldId(`pub-cover-${index}`)"
              preview-alt="Pratinjau sampul publikasi"
              @update:model-value="onCoverChanged(row, $event)"
              @busy="trackBusy"
            />
            <p
              v-if="row.coverAssetId && row.coverIsAuto"
              class="text-text-muted text-xs"
              data-test="cover-auto-note"
            >
              Sampul ini dibuat otomatis dari halaman pertama berkas. Ganti foto untuk memakai
              sampul lain.
            </p>
            <p
              v-if="row.coverNotice"
              class="text-status-warning text-sm"
              role="status"
              data-test="cover-notice"
            >
              {{ row.coverNotice }}
            </p>
          </div>

          <CollectionRowActions
            :row-label="`publikasi ${index + 1}`"
            :is-first="index === 0"
            :is-last="index === rows.length - 1"
            :busy="busy"
            :move-up-id="fieldId(`pub-up-${index}`)"
            :move-down-id="fieldId(`pub-down-${index}`)"
            :remove-id="fieldId(`pub-remove-${index}`)"
            @move-up="move(index, -1)"
            @move-down="move(index, 1)"
            @remove="remove(index)"
          />
        </li>
      </ol>

      <div class="flex flex-wrap items-center gap-3">
        <BaseButton
          :id="fieldId('pub-add')"
          type="button"
          variant="secondary"
          size="sm"
          class="min-h-11"
          :disabled="busy || isFull()"
          @click="add"
        >
          Tambah publikasi
        </BaseButton>
        <p v-if="isFull()" class="text-text-muted text-sm" data-test="publications-full">
          Sudah mencapai batas {{ MAX_ITEMS }} publikasi.
        </p>
      </div>
      <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>
    </fieldset>
  </BlockFormShell>
</template>
