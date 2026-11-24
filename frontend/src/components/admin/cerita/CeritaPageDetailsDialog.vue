<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AlertBanner from '../../common/AlertBanner.vue';
import BaseButton from '../../common/BaseButton.vue';
import BaseModal from '../../common/BaseModal.vue';
import FormField from '../../common/FormField.vue';
import { INPUT_CLASSES } from '../../../utils/formStyles';
import { hasHtmlTag, hasUnsafeCharacters, titleTextProblem } from '../../../utils/titleTextRules';
import type { FailureKind } from '../../../utils/userMessages';
import type { PageDetailsInput } from '../../../services/ceritaAdmin.service';

/**
 * "Info cerita": the page title, then the optional editorial headline and byline. The title is
 * required (1 to 255 characters, as in the rename dialog) and is prefilled with the stored one. The
 * headline and byline may stay empty (the reader then shows the page title alone); a blank field
 * clears what was stored. An affiliation needs an author. Like the name dialog, the fields keep
 * their text when a save is refused, and a "stale" refusal offers a reload that leaves the typed
 * text in place. The parent decides what a save does with the title (it renames only a change).
 */
const props = withDefaults(
  defineProps<{
    open: boolean;
    /** The stored page title: prefills the title field and names the page in the dialog. */
    title: string;
    headline?: string | null;
    bylineAuthor?: string | null;
    bylineAffiliation?: string | null;
    busy?: boolean;
    error?: string;
    /** Failure class of `error`, for AlertBanner. */
    errorKind?: FailureKind;
    stale?: boolean;
  }>(),
  {
    headline: null,
    bylineAuthor: null,
    bylineAffiliation: null,
    busy: false,
    error: '',
    errorKind: undefined,
    stale: false,
  },
);

const emit = defineEmits<{
  (e: 'submit', details: PageDetailsInput, title: string): void;
  (e: 'close'): void;
  (e: 'reload'): void;
}>();

const HEADLINE_MAX = 255;
const AUTHOR_MAX = 120;
const AFFILIATION_MAX = 160;

const ids = {
  title: 'cerita-detail-judul',
  headline: 'cerita-detail-judul-utama',
  author: 'cerita-detail-penulis',
  affiliation: 'cerita-detail-afiliasi',
};

const pageTitleText = ref(props.title);
const headline = ref(props.headline ?? '');
const author = ref(props.bylineAuthor ?? '');
const affiliation = ref(props.bylineAffiliation ?? '');
const submitted = ref(false);

// Each opening starts from the stored values; an earlier draft never carries over.
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    pageTitleText.value = props.title;
    headline.value = props.headline ?? '';
    author.value = props.bylineAuthor ?? '';
    affiliation.value = props.bylineAffiliation ?? '';
    submitted.value = false;
  },
);

function textProblem(label: string, value: string, max: number): string | undefined {
  const text = value.trim();
  if (text === '') return undefined;
  if (text.length > max) return `${label} maksimal ${max} karakter.`;
  if (hasUnsafeCharacters(text)) return `${label} memuat karakter yang tidak diizinkan.`;
  if (hasHtmlTag(text)) return `${label} tidak boleh memuat tag HTML.`;
  return undefined;
}

function titleProblem(): string | undefined {
  switch (titleTextProblem(pageTitleText.value)) {
    case 'empty':
      return 'Judul halaman wajib diisi.';
    case 'too-long':
      return 'Judul halaman maksimal 255 karakter.';
    case 'html':
      return 'Judul halaman tidak boleh memuat tag HTML.';
    case 'characters':
      return 'Judul halaman memuat karakter yang tidak diizinkan.';
    default:
      return undefined;
  }
}

const problems = computed(() => ({
  title: titleProblem(),
  headline: textProblem('Judul utama', headline.value, HEADLINE_MAX),
  author: textProblem('Nama penulis', author.value, AUTHOR_MAX),
  affiliation:
    textProblem('Afiliasi penulis', affiliation.value, AFFILIATION_MAX) ??
    (affiliation.value.trim() && !author.value.trim()
      ? 'Isi nama penulis jika afiliasi penulis diisi.'
      : undefined),
}));

function handleSubmit(): void {
  submitted.value = true;
  if (
    props.busy ||
    problems.value.title ||
    problems.value.headline ||
    problems.value.author ||
    problems.value.affiliation
  ) {
    return;
  }
  emit(
    'submit',
    {
      headline: headline.value.trim() || null,
      bylineAuthor: author.value.trim() || null,
      bylineAffiliation: affiliation.value.trim() || null,
    },
    pageTitleText.value.trim(),
  );
}
</script>

<template>
  <BaseModal
    :open="open"
    title="Info cerita"
    :description="`Halaman “${title}”`"
    size="md"
    :busy="busy"
    @close="emit('close')"
  >
    <form
      v-if="open"
      novalidate
      class="space-y-4"
      data-test="details-dialog"
      @submit.prevent="handleSubmit"
    >
      <FormField
        :id="ids.title"
        label="Judul halaman"
        hint="Alamat halaman tidak berubah, sehingga tautan yang sudah dibagikan tetap berfungsi."
        :error="submitted ? problems.title : undefined"
        v-slot="{ describedBy, invalid }"
      >
        <input
          :id="ids.title"
          v-model="pageTitleText"
          type="text"
          data-autofocus
          :class="INPUT_CLASSES"
          :disabled="busy"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
          data-test="details-title"
        />
      </FormField>

      <p class="text-text-muted text-sm">
        Judul utama, nama penulis dan afiliasi boleh dikosongkan. Isi hanya dengan kalimat dan nama
        penulis yang sudah disetujui; jika kosong, pembaca hanya melihat judul halaman.
      </p>

      <FormField
        :id="ids.headline"
        label="Judul utama (opsional)"
        hint="Tampil sebagai judul besar di halaman. Judul halaman tampil sebagai label kecil di atasnya."
        :error="submitted ? problems.headline : undefined"
        v-slot="{ describedBy, invalid }"
      >
        <input
          :id="ids.headline"
          v-model="headline"
          type="text"
          :class="INPUT_CLASSES"
          :disabled="busy"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
          data-test="details-headline"
        />
      </FormField>

      <FormField
        :id="ids.author"
        label="Nama penulis (opsional)"
        :error="submitted ? problems.author : undefined"
        v-slot="{ describedBy, invalid }"
      >
        <input
          :id="ids.author"
          v-model="author"
          type="text"
          :class="INPUT_CLASSES"
          :disabled="busy"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
          data-test="details-author"
        />
      </FormField>

      <FormField
        :id="ids.affiliation"
        label="Afiliasi penulis (opsional)"
        hint="Contoh: nama lembaga. Hanya bisa diisi bersama nama penulis."
        :error="submitted ? problems.affiliation : undefined"
        v-slot="{ describedBy, invalid }"
      >
        <input
          :id="ids.affiliation"
          v-model="affiliation"
          type="text"
          :class="INPUT_CLASSES"
          :disabled="busy"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
          data-test="details-affiliation"
        />
      </FormField>

      <AlertBanner v-if="error" :message="error" :kind="errorKind" data-test="details-error" />

      <div
        v-if="stale"
        class="rounded-card border-status-warning-border bg-status-warning-surface border px-4 py-3"
        data-test="details-stale"
      >
        <p class="text-status-warning text-sm">
          Isian Anda masih ada di sini. Memuat versi terbaru tidak menghapus isian Anda.
        </p>
        <BaseButton
          type="button"
          variant="secondary"
          size="sm"
          class="mt-3 min-h-11"
          :disabled="busy"
          data-test="details-reload"
          @click="emit('reload')"
        >
          Muat versi terbaru
        </BaseButton>
      </div>

      <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <BaseButton
          type="button"
          variant="secondary"
          size="md"
          class="min-h-11"
          :disabled="busy"
          data-test="details-cancel"
          @click="emit('close')"
        >
          Batal
        </BaseButton>
        <BaseButton
          type="submit"
          size="md"
          class="min-h-11"
          :disabled="busy"
          data-test="details-submit"
        >
          {{ busy ? 'Menyimpan…' : 'Simpan' }}
        </BaseButton>
      </div>
    </form>
  </BaseModal>
</template>
