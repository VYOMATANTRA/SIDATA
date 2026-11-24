<script setup lang="ts">
import { computed, ref } from 'vue';
import AlertBanner from '../../common/AlertBanner.vue';
import BaseButton from '../../common/BaseButton.vue';
import FormField from '../../common/FormField.vue';
import { INPUT_CLASSES } from '../../../utils/formStyles';
import { titleTextProblem } from '../../../utils/titleTextRules';
import type { PendingFigureKind } from '../../../composables/figureKindHint';
import type { FailureKind } from '../../../utils/userMessages';
import { ceritaIds } from './ceritaDomIds';

/**
 * "Tambah bagian baru" at the end of a chapter: a title and one of four figure kinds, shown as
 * tiles of native radio buttons. The view creates the section and opens it in the section editor
 * with the kind preselected (`figureKindHint`). The kind is optional; none chosen means no hint.
 */
defineProps<{
  busy: boolean;
  error?: string;
  errorKind?: FailureKind;
}>();

const emit = defineEmits<{
  (e: 'add', title: string, kind: PendingFigureKind | null): void;
}>();

const TILES: { kind: PendingFigureKind; label: string; description: string }[] = [
  { kind: 'photo', label: '1 gambar', description: 'Satu foto dengan keterangan' },
  { kind: 'photos-2', label: '2 gambar', description: 'Dua foto bertumpuk' },
  { kind: 'gallery', label: 'Galeri', description: '3 foto atau lebih, tampil sebagai korsel' },
  { kind: 'chart', label: 'Grafik', description: 'Dari tabel di menu Data' },
];

const title = ref('');
const kind = ref<PendingFigureKind | null>(null);
const submitted = ref(false);
const fieldId = ceritaIds.overviewAddHeading + '-judul';
const kindName = 'cerita-tambah-bagian-jenis';

const problem = computed(() => {
  switch (titleTextProblem(title.value)) {
    case 'empty':
      return 'Judul bagian wajib diisi.';
    case 'too-long':
      return 'Judul bagian maksimal 255 karakter.';
    case 'html':
      return 'Judul bagian tidak boleh memuat tag HTML.';
    case 'characters':
      return 'Judul bagian memuat karakter yang tidak diizinkan.';
    default:
      return undefined;
  }
});

function submit(): void {
  submitted.value = true;
  if (problem.value) return;
  emit('add', title.value.trim(), kind.value);
}

/** Called by the view after a successful add, so the next add starts empty. */
function reset(): void {
  title.value = '';
  kind.value = null;
  submitted.value = false;
}

defineExpose({ reset });
</script>

<template>
  <section
    :aria-labelledby="ceritaIds.overviewAddHeading"
    class="border-border-strong rounded-card space-y-4 border-2 border-dashed bg-white p-5"
    data-test="add-section-panel"
  >
    <div>
      <h3 :id="ceritaIds.overviewAddHeading" class="text-brand-navy text-base font-semibold">
        Tambah bagian baru
      </h3>
      <p class="text-text-muted mt-1 text-[13px]">
        Pilih jenis figur untuk memulai. Bisa diganti kapan saja.
      </p>
    </div>

    <form novalidate class="space-y-4" data-test="add-section-form" @submit.prevent="submit">
      <fieldset class="space-y-2" :disabled="busy">
        <legend class="text-brand-navy mb-2 text-sm font-semibold">
          Jenis gambar <span class="text-text-muted font-normal">(opsional)</span>
        </legend>
        <div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <label
            v-for="tile in TILES"
            :key="tile.kind"
            class="border-border has-[:checked]:border-brand-navy has-[:checked]:bg-brand-navy/5 has-[:focus-visible]:outline-focus-ring rounded-btn flex min-h-24 cursor-pointer flex-col gap-1 border bg-white p-3 text-left has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
          >
            <span class="flex items-center gap-2">
              <input
                v-model="kind"
                type="radio"
                :name="kindName"
                :value="tile.kind"
                class="accent-brand-navy h-4 w-4 shrink-0"
                :data-test="`tile-${tile.kind}`"
              />
              <span class="text-brand-navy text-sm font-semibold">{{ tile.label }}</span>
            </span>
            <span class="text-text-muted pl-6 text-[12px]">{{ tile.description }}</span>
          </label>
        </div>
      </fieldset>

      <FormField
        :id="fieldId"
        label="Judul bagian"
        :error="submitted ? problem : undefined"
        required
        v-slot="{ describedBy, invalid }"
      >
        <input
          :id="fieldId"
          v-model="title"
          type="text"
          :class="INPUT_CLASSES"
          :disabled="busy"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
          data-test="add-section-title"
        />
      </FormField>

      <AlertBanner v-if="error" :message="error" :kind="errorKind" data-test="add-section-error" />

      <BaseButton
        type="submit"
        size="md"
        class="min-h-11"
        :disabled="busy"
        data-test="add-section-submit"
      >
        {{ busy ? 'Menambahkan…' : 'Tambah bagian' }}
      </BaseButton>
    </form>
  </section>
</template>
