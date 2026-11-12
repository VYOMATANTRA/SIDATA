<script setup lang="ts">
import { computed, ref } from 'vue';
import FormField from '../../common/FormField.vue';
import BaseButton from '../../common/BaseButton.vue';
import { INPUT_CLASSES } from '../../../utils/formStyles';
import { PUBLICATIONS } from '../../../content/publikasi';
import BlockFormShell from './BlockFormShell.vue';
import CollectionRowActions from './CollectionRowActions.vue';
import {
  BLOCK_FORM_DEFAULTS,
  titleBodyEntries,
  useRepeatableRows,
  validateTitleBody,
  type BlockFormProps,
  type BlockSavePayload,
  type FormErrorEntry,
} from './blockFormShared';

/**
 * Katalog Publikasi: one row per document. Saved as `metadata.publications[]`.
 *
 * Availability is derived, not chosen: an entry with a download link is "tersedia", one without
 * is "segera hadir". The server rejects a link on an unavailable entry and an available entry
 * with no link, so deriving one from the other makes that mismatch impossible to send.
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

interface PublicationDraft {
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

function toDraft(raw: unknown): PublicationDraft {
  const row = (raw ?? {}) as Record<string, unknown>;
  const bytes =
    typeof row.fileSizeBytes === 'number' && Number.isFinite(row.fileSizeBytes)
      ? row.fileSizeBytes
      : null;
  const size = displaySize(bytes);
  return {
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

const titleBodyErrors = computed(() => validateTitleBody(title.value, body.value));

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

    const href = row.href.trim();
    if (href && !isHttpsAddress(href))
      errors[`pub-href-${index}`] =
        `${label}: tautan harus alamat yang diawali https:// dan berupa alamat yang valid.`;

    if (row.fileType.trim().length > FILE_TYPE_MAX)
      errors[`pub-fileType-${index}`] =
        `${label}: format berkas maksimal ${FILE_TYPE_MAX} karakter.`;

    if (parseSizeBytes(row) === null)
      errors[`pub-size-${index}`] = `${label}: ukuran berkas harus berupa angka lebih dari 0.`;
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
  if (errorEntries.value.length > 0 || props.busy) return;

  const publications = rows.value.map((row) => {
    const href = row.href.trim();
    const source = row.source.trim();
    const fileType = row.fileType.trim();
    const size = parseSizeBytes(row);
    return {
      category: row.category.trim(),
      title: row.title.trim(),
      description: row.description.trim(),
      ...(source ? { source } : {}),
      ...(href ? { href } : {}),
      ...(fileType ? { fileType } : {}),
      ...(typeof size === 'number' ? { fileSizeBytes: size } : {}),
      isAvailableOnline: href !== '',
    };
  });

  emit('submit', {
    title: title.value.trim() || null,
    body: body.value.trim(),
    metadata: { publications },
  });
}
</script>

<template>
  <BlockFormShell
    v-model:title="title"
    v-model:body="body"
    :id-prefix="idPrefix"
    :busy="busy"
    :server-error="serverError"
    :submitted="submitted"
    :errors="errorEntries"
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
        Maksimal {{ MAX_ITEMS }} publikasi. Isi tautan unduhan hanya jika berkasnya sudah bisa
        dibuka warga; tanpa tautan, publikasi tampil sebagai “Segera hadir”.
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
            :id="fieldId(`pub-href-${index}`)"
            label="Tautan unduhan (opsional)"
            hint="Harus diawali https://. Kosongkan jika berkas belum tersedia."
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
          <p class="text-text-muted text-sm" data-test="pub-status">
            Status:
            <span class="text-brand-navy font-semibold">{{
              row.href.trim() ? 'Tersedia untuk diunduh' : 'Segera hadir'
            }}</span>
          </p>

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
