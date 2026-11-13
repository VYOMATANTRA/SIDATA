<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import BaseButton from '../../common/BaseButton.vue';
import BaseModal from '../../common/BaseModal.vue';
import FormField from '../../common/FormField.vue';
import { INPUT_CLASSES } from '../../../utils/formStyles';
import { hasHtmlTag, hasUnsafeCharacters } from '../../../utils/titleTextRules';
import type { PageDetailsInput } from '../../../services/ceritaAdmin.service';

/**
 * Optional editorial headline and byline of a Cerita page. All three fields may stay empty (the
 * reader then shows the page title alone); a blank field clears what was stored. An affiliation
 * needs an author. Like the name dialog, the fields keep their text when a save is refused, and
 * a "stale" refusal offers a reload that leaves the typed text in place.
 */
const props = withDefaults(
  defineProps<{
    open: boolean;
    pageTitle: string;
    headline?: string | null;
    bylineAuthor?: string | null;
    bylineAffiliation?: string | null;
    busy?: boolean;
    error?: string;
    stale?: boolean;
  }>(),
  {
    headline: null,
    bylineAuthor: null,
    bylineAffiliation: null,
    busy: false,
    error: '',
    stale: false,
  },
);

const emit = defineEmits<{
  (e: 'submit', details: PageDetailsInput): void;
  (e: 'close'): void;
  (e: 'reload'): void;
}>();

const HEADLINE_MAX = 255;
const AUTHOR_MAX = 120;
const AFFILIATION_MAX = 160;

const ids = {
  headline: 'cerita-detail-judul-utama',
  author: 'cerita-detail-penulis',
  affiliation: 'cerita-detail-afiliasi',
};

const headline = ref(props.headline ?? '');
const author = ref(props.bylineAuthor ?? '');
const affiliation = ref(props.bylineAffiliation ?? '');
const submitted = ref(false);

// Each opening starts from the stored values; an earlier draft never carries over.
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
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

const problems = computed(() => ({
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
    problems.value.headline ||
    problems.value.author ||
    problems.value.affiliation
  ) {
    return;
  }
  emit('submit', {
    headline: headline.value.trim() || null,
    bylineAuthor: author.value.trim() || null,
    bylineAffiliation: affiliation.value.trim() || null,
  });
}
</script>

<template>
  <BaseModal
    :open="open"
    title="Judul utama & penulis"
    :description="`Halaman “${pageTitle}”`"
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
      <p class="text-text-muted text-sm">
        Semua isian ini boleh dikosongkan. Isi hanya dengan kalimat dan nama penulis yang sudah
        disetujui; jika kosong, pembaca hanya melihat judul halaman.
      </p>

      <FormField
        :id="ids.headline"
        label="Judul utama (opsional)"
        hint="Tampil sebagai judul besar di halaman. Judul halaman tetap tampil di atasnya."
        :error="submitted ? problems.headline : undefined"
        v-slot="{ describedBy, invalid }"
      >
        <input
          :id="ids.headline"
          v-model="headline"
          type="text"
          data-autofocus
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

      <p
        v-if="error"
        role="alert"
        class="rounded-btn border-status-error-border bg-status-error-surface text-status-error border px-3 py-2 text-sm"
        data-test="details-error"
      >
        {{ error }}
      </p>

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
