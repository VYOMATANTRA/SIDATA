<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import BaseButton from '../../common/BaseButton.vue';
import FormErrorSummary from '../../common/FormErrorSummary.vue';
import FormField from '../../common/FormField.vue';
import MediaPhotoField from '../../common/MediaPhotoField.vue';
import CollectionRowActions from '../../data/blocks/CollectionRowActions.vue';
import CeritaFigurePhotoRow from './CeritaFigurePhotoRow.vue';
import { useRepeatableRows } from '../../data/blocks/blockFormShared';
import { FIGURE_LIMITS } from '../../../services/ceritaFigure.service';
import { useCeritaAdminStore } from '../../../stores/ceritaAdmin.store';
import { INPUT_CLASSES } from '../../../utils/formStyles';
import {
  KIND_LABELS,
  describeFigure,
  draftFromFigure,
  draftSignature,
  emptyBar,
  emptyPhoto,
  barValueNote as barNote,
  figureIds,
  summarizeFigure,
  validateFigureDraft,
  type BarFields,
  type FigureDraft,
  type FigureKind,
  type PhotoFields,
} from '../../../utils/ceritaFigureDraft';

/**
 * Editor for the one figure a Cerita section may have: a single photo, a series of photos, or a
 * diagram (an image, bars, or both). It works on a draft: nothing is stored until "Simpan gambar",
 * and a failed save (stale, refused, offline) leaves every field as it was.
 *
 * Rules (SPEC §8): alt text is required for every photo; caption and credit are optional; photos
 * are ordered with buttons; a "stale" refusal keeps the draft and offers a reload that does not
 * replace it; deleting asks first and is blocked by the server while it cannot be done.
 */
const props = defineProps<{ sectionId: string }>();

const emit = defineEmits<{
  (e: 'busy', value: boolean): void;
  (e: 'dirty-change', value: boolean): void;
}>();

const store = useCeritaAdminStore();

const baseId = useId();
const ids = figureIds(`${baseId}-gambar`);
const kindName = `${baseId}-jenis-gambar`;

const kind = ref<FigureKind | null>(null);
const diagramTitle = ref('');
const diagramSource = ref('');
const diagramImageId = ref<string | null>(null);
const diagramImageAlt = ref('');
const barUnit = ref('');

const photoRows = useRepeatableRows<PhotoFields>([], {
  max: FIGURE_LIMITS.photosMax,
  makeEmpty: emptyPhoto,
  noun: 'foto',
  ids: {
    firstField: ids.photoFile,
    moveUp: ids.photoUp,
    moveDown: ids.photoDown,
    add: ids.addPhoto,
  },
});
const barRows = useRepeatableRows<BarFields>([], {
  max: FIGURE_LIMITS.barsMax,
  makeEmpty: emptyBar,
  noun: 'batang',
  ids: {
    firstField: ids.barLabel,
    moveUp: ids.barUp,
    moveDown: ids.barDown,
    add: ids.addBar,
  },
});

const submitted = ref(false);
const saving = ref(false);
const deleting = ref(false);
const uploadingCount = ref(0);
const serverError = ref('');
const stale = ref(false);
/** What the last successful reload found, shown until the draft is saved, reverted or replaced. */
const reloadedSummary = ref<string | null>(null);
const reloading = ref(false);
const confirmingDelete = ref(false);
const deleteError = ref('');
const statusMessage = ref('');
const summaryHost = ref<HTMLElement | null>(null);
const deleteKeepButton = ref<InstanceType<typeof BaseButton> | null>(null);

const stored = computed(() => store.figureFor(props.sectionId));
const storedNote = computed(() =>
  stored.value ? describeFigure(stored.value.figure) : 'Bagian ini belum memiliki gambar.',
);

const draft = computed<FigureDraft>(() => ({
  kind: kind.value,
  photos: photoRows.rows.value,
  diagramTitle: diagramTitle.value,
  diagramSource: diagramSource.value,
  diagramImageId: diagramImageId.value,
  diagramImageAlt: diagramImageAlt.value,
  barUnit: barUnit.value,
  bars: barRows.rows.value,
}));

const baseline = ref('none');
const dirty = computed(() => draftSignature(draft.value) !== baseline.value);
const busy = computed(() => saving.value || deleting.value);
const uploading = computed(() => uploadingCount.value > 0);

watch(busy, (value) => emit('busy', value));
// The description belongs to the image: when the image is removed (or replaced by none) it goes too.
watch(diagramImageId, (id) => {
  if (id === null) diagramImageAlt.value = '';
});
watch(dirty, (value) => emit('dirty-change', value), { immediate: true });

function applyDraft(next: FigureDraft): void {
  kind.value = next.kind;
  photoRows.setRows(next.photos);
  diagramTitle.value = next.diagramTitle;
  diagramSource.value = next.diagramSource;
  diagramImageId.value = next.diagramImageId;
  diagramImageAlt.value = next.diagramImageAlt;
  barUnit.value = next.barUnit;
  barRows.setRows(next.bars);
  baseline.value = draftSignature(next);
}

/**
 * Shows what is stored now. Unless told otherwise it also records the section token this draft is
 * based on: the first save carries that token, so someone else's save made after this point is
 * refused rather than overwritten. After the editor's own save the store has already chained the
 * token from the save's own answer, so it is left alone.
 */
function loadFromStored(captureToken = true): void {
  applyDraft(draftFromFigure(stored.value?.figure ?? null));
  if (captureToken) store.captureSectionToken(props.sectionId);
}

loadFromStored();

// A reload (or someone else's save) changes what is stored. An untouched draft follows it; a
// draft with edits is kept as it is and only its comparison point moves, so a reload never
// throws away typing.
const storedSignature = computed(() =>
  JSON.stringify([stored.value?.block.id ?? null, stored.value?.figure ?? null]),
);
// The section token the draft follows is read only once the whole reload has finished: the blocks
// can arrive before the page tree, and a token read in between would be the old one.
let followToken = false;
watch(storedSignature, () => {
  if (dirty.value) {
    baseline.value = draftSignature(draftFromFigure(stored.value?.figure ?? null));
    return;
  }
  loadFromStored(false);
  if (store.isLoading) followToken = true;
  else store.captureSectionToken(props.sectionId);
});
watch(
  () => store.isLoading,
  (loading) => {
    if (loading || !followToken) return;
    followToken = false;
    // Only a draft that still has no edits of its own follows the reloaded token.
    if (!dirty.value) store.captureSectionToken(props.sectionId);
  },
);

watch(
  () => props.sectionId,
  () => {
    submitted.value = false;
    reloadedSummary.value = null;
    serverError.value = '';
    stale.value = false;
    confirmingDelete.value = false;
    loadFromStored();
  },
);

const problems = computed(() =>
  submitted.value ? validateFigureDraft(draft.value, ids).problems : [],
);
const errorByField = computed(() => {
  const map: Record<string, string> = {};
  for (const problem of problems.value) {
    if (!(problem.fieldId in map)) map[problem.fieldId] = problem.message;
  }
  return map;
});

function announce(message: string): void {
  statusMessage.value = '';
  void nextTick(() => {
    statusMessage.value = message;
  });
}

function setKind(next: FigureKind): void {
  kind.value = next;
  const needed = next === 'photo' ? 1 : next === 'photos' ? FIGURE_LIMITS.photosMin : 0;
  if (photoRows.rows.value.length < needed) {
    const missing = Array.from({ length: needed - photoRows.rows.value.length }, emptyPhoto);
    photoRows.setRows([...photoRows.rows.value, ...missing]);
  }
}

const kindModel = computed<FigureKind | null>({
  get: () => kind.value,
  set: (value) => {
    if (value) setKind(value);
  },
});

const visiblePhotoRows = computed(() =>
  kind.value === 'photo' ? photoRows.rows.value.slice(0, 1) : photoRows.rows.value,
);
const hiddenPhotoCount = computed(() =>
  kind.value === 'photo' ? Math.max(0, photoRows.rows.value.length - 1) : 0,
);

function onUploading(value: boolean): void {
  uploadingCount.value = Math.max(0, uploadingCount.value + (value ? 1 : -1));
}

function focusSummary(): void {
  void nextTick(() => {
    summaryHost.value?.querySelector<HTMLElement>('[role="alert"]')?.focus();
  });
}

async function save(): Promise<void> {
  if (busy.value || uploading.value) return;
  submitted.value = true;
  serverError.value = '';
  stale.value = false;

  const result = validateFigureDraft(draft.value, ids);
  if (result.problems.length > 0 || !result.figure) {
    focusSummary();
    return;
  }

  // "Satu foto" stores one photo: drop the hidden rows now so they cannot resurface later.
  if (kind.value === 'photo' && photoRows.rows.value.length > 1) {
    photoRows.setRows(photoRows.rows.value.slice(0, 1));
  }

  saving.value = true;
  const outcome = await store.saveFigure(props.sectionId, result.figure);
  saving.value = false;

  if (outcome.ok) {
    submitted.value = false;
    reloadedSummary.value = null;
    if (outcome.refreshFailed) {
      // Saved, but what the screen holds is still the old figure. Keep the draft (it is what was
      // just saved) and do not show the old data over it; the reload notice offers the reload. The
      // draft now matches what is saved, so it is not "unsaved" any more.
      baseline.value = draftSignature(draft.value);
      announce('Gambar disimpan, tetapi halaman belum bisa dimuat ulang.');
      return;
    }
    loadFromStored(false);
    announce('Gambar disimpan.');
    return;
  }
  serverError.value = outcome.message;
  stale.value = outcome.stale;
  // A fresh conflict makes any earlier "reloaded" summary describe a version that is no longer current.
  if (outcome.stale) reloadedSummary.value = null;
  focusSummary();
}

async function reload(): Promise<void> {
  if (reloading.value) return;
  reloading.value = true;
  const loaded = await store.load();
  reloading.value = false;

  if (!loaded) {
    // Nothing new was seen, so the draft must not move onto a newer token: saving would replace
    // a version the editor never looked at. The notice stays and the save is still refused.
    serverError.value =
      store.loadError ?? 'Versi terbaru belum bisa dimuat. Periksa koneksi lalu coba lagi.';
    announce('Versi terbaru belum bisa dimuat. Isian Anda masih ada.');
    focusSummary();
    return;
  }

  // Only a successful explicit reload moves the draft onto the fresh token; the draft itself stays.
  store.captureSectionToken(props.sectionId);
  stale.value = false;
  serverError.value = '';
  reloadedSummary.value = summarizeFigure(stored.value?.figure ?? null, stored.value !== null);
  announce(
    `Versi terbaru dimuat: ${reloadedSummary.value}. Jika Anda menyimpan sekarang, gambar Anda menggantikan versi itu.`,
  );
}

function revert(): void {
  submitted.value = false;
  reloadedSummary.value = null;
  serverError.value = '';
  stale.value = false;
  loadFromStored();
  announce('Perubahan gambar dibatalkan.');
}

function askDelete(): void {
  deleteError.value = '';
  confirmingDelete.value = true;
  void nextTick(() => {
    const element = deleteKeepButton.value?.$el as HTMLElement | undefined;
    element?.focus();
  });
}

function cancelDelete(): void {
  confirmingDelete.value = false;
  deleteError.value = '';
}

async function confirmDelete(): Promise<void> {
  if (busy.value) return;
  deleting.value = true;
  deleteError.value = '';
  const outcome = await store.removeFigure(props.sectionId);
  deleting.value = false;
  if (outcome.ok) {
    confirmingDelete.value = false;
    submitted.value = false;
    reloadedSummary.value = null;
    serverError.value = '';
    stale.value = false;
    // The store has already dropped the figure from its data even if the reload failed, so this
    // shows the empty state; the reload notice (store.reloadNeeded) offers the reload.
    loadFromStored(false);
    announce(
      outcome.refreshFailed
        ? 'Gambar dihapus, tetapi halaman belum bisa dimuat ulang.'
        : 'Gambar dihapus dari bagian ini.',
    );
    await nextTick();
    document.getElementById(ids.kind)?.focus();
    return;
  }
  deleteError.value = outcome.message;
  stale.value = outcome.stale;
  if (outcome.stale) reloadedSummary.value = null;
}

defineExpose({ isDirty: () => dirty.value });
</script>

<template>
  <form novalidate class="space-y-5" data-test="figure-editor" @submit.prevent="save">
    <p class="sr-only" role="status" aria-live="polite">{{ statusMessage }}</p>
    <p class="sr-only" role="status" aria-live="polite">{{ photoRows.announcement.value }}</p>
    <p class="sr-only" role="status" aria-live="polite">{{ barRows.announcement.value }}</p>

    <p class="text-text-muted text-sm" data-test="figure-stored-note">{{ storedNote }}</p>

    <div ref="summaryHost">
      <FormErrorSummary :errors="problems" :form-error="serverError" />
    </div>

    <div
      v-if="stale"
      class="rounded-card border-status-warning-border bg-status-warning-surface border px-4 py-3"
      data-test="figure-stale-notice"
    >
      <p class="text-status-warning text-sm">
        Orang lain sudah mengubah gambar di bagian ini. Isian Anda masih ada di formulir ini. Memuat
        versi terbaru tidak menghapus isian Anda, tetapi jika Anda lalu menyimpan, gambar Anda
        menggantikan versi orang lain tersebut.
      </p>
      <BaseButton
        type="button"
        variant="secondary"
        size="sm"
        class="mt-3 min-h-11"
        :disabled="reloading || busy"
        data-test="figure-reload"
        @click="reload"
      >
        {{ reloading ? 'Memuat…' : 'Muat versi terbaru' }}
      </BaseButton>
    </div>

    <div
      v-if="reloadedSummary"
      class="rounded-card border-status-warning-border bg-status-warning-surface border px-4 py-3"
      data-test="figure-reloaded-notice"
    >
      <p class="text-status-warning text-sm">
        Versi terbaru dimuat: {{ reloadedSummary }}. Isian Anda tidak berubah. Jika Anda menyimpan
        sekarang, gambar Anda menggantikan versi itu.
      </p>
    </div>

    <fieldset class="space-y-2" :disabled="busy || uploading">
      <legend class="text-text-muted text-sm font-medium">Jenis gambar</legend>
      <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-5">
        <label
          v-for="option in ['photo', 'photos', 'diagram'] as FigureKind[]"
          :key="option"
          :for="ids.kindOption(option)"
          class="text-brand-navy flex min-h-11 cursor-pointer items-center gap-2 text-sm"
        >
          <input
            :id="ids.kindOption(option)"
            v-model="kindModel"
            type="radio"
            :name="kindName"
            :value="option"
            class="text-brand-navy focus-visible:outline-focus-ring h-4 w-4 focus-visible:outline-2 focus-visible:outline-offset-2"
            :data-test="`kind-${option}`"
          />
          {{ KIND_LABELS[option] }}
        </label>
      </div>
      <p v-if="kind === null" class="text-text-muted text-xs">
        Pilih jenis gambar untuk mulai menambahkan.
      </p>
    </fieldset>

    <div v-if="kind === 'photo' || kind === 'photos'" class="space-y-4" data-test="figure-photos">
      <p v-if="hiddenPhotoCount > 0" class="text-text-muted text-sm" data-test="figure-extra-note">
        Hanya foto pertama yang dipakai untuk “Satu foto”. Foto lainnya tidak ikut disimpan.
      </p>

      <CeritaFigurePhotoRow
        v-for="(row, index) in visiblePhotoRows"
        :key="row.uid"
        v-model:media-id="row.mediaId"
        v-model:alt="row.alt"
        v-model:caption="row.caption"
        v-model:credit="row.credit"
        :index="index"
        :label="kind === 'photo' ? 'Foto' : `Foto ${index + 1}`"
        :ids="ids"
        :errors="errorByField"
        :show-actions="kind === 'photos'"
        :is-first="index === 0"
        :is-last="index === visiblePhotoRows.length - 1"
        :busy="busy || uploading"
        @move-up="photoRows.move(index, -1)"
        @move-down="photoRows.move(index, 1)"
        @remove="photoRows.remove(index)"
        @uploading="onUploading"
      />

      <div v-if="kind === 'photos'" class="space-y-2">
        <BaseButton
          :id="ids.addPhoto"
          type="button"
          variant="secondary"
          size="md"
          class="min-h-11"
          :disabled="busy || uploading || photoRows.isFull()"
          data-test="add-photo"
          @click="photoRows.add()"
        >
          Tambah foto
        </BaseButton>
        <p class="text-text-muted text-xs">
          {{ photoRows.rows.value.length }} dari {{ FIGURE_LIMITS.photosMax }} foto (minimal
          {{ FIGURE_LIMITS.photosMin }}).
        </p>
        <p v-if="errorByField[ids.addPhoto]" class="text-status-error text-xs font-medium">
          {{ errorByField[ids.addPhoto] }}
        </p>
      </div>
    </div>

    <div v-else-if="kind === 'diagram'" class="space-y-5" data-test="figure-diagram">
      <FormField
        :id="ids.diagramTitle"
        label="Judul diagram"
        :error="errorByField[ids.diagramTitle]"
        required
        v-slot="{ describedBy, invalid }"
      >
        <input
          :id="ids.diagramTitle"
          v-model="diagramTitle"
          type="text"
          :class="INPUT_CLASSES"
          :disabled="busy"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
          data-test="diagram-title"
        />
      </FormField>

      <FormField
        :id="ids.diagramSource"
        label="Sumber data (opsional)"
        hint="Contoh: nama publikasi dan tahunnya."
        :error="errorByField[ids.diagramSource]"
        v-slot="{ describedBy, invalid }"
      >
        <input
          :id="ids.diagramSource"
          v-model="diagramSource"
          type="text"
          :class="INPUT_CLASSES"
          :disabled="busy"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
          data-test="diagram-source"
        />
      </FormField>

      <p class="text-text-muted text-sm">Diagram membutuhkan gambar, data batang, atau keduanya.</p>

      <fieldset class="rounded-card border-border space-y-4 border p-4">
        <legend class="text-brand-navy px-1 text-sm font-semibold">Gambar diagram</legend>
        <MediaPhotoField
          v-model="diagramImageId"
          purpose="cerita"
          label="Gambar diagram"
          :input-id="ids.diagramImage"
          :disabled="busy"
          :error="errorByField[ids.diagramImage]"
          preview-alt="Pratinjau gambar diagram"
          @busy="onUploading"
        />
        <FormField
          v-if="diagramImageId"
          :id="ids.diagramImageAlt"
          label="Teks pengganti gambar diagram"
          hint="Jelaskan isi diagram untuk pembaca yang tidak bisa melihatnya."
          :error="errorByField[ids.diagramImageAlt]"
          required
          v-slot="{ describedBy, invalid }"
        >
          <textarea
            :id="ids.diagramImageAlt"
            v-model="diagramImageAlt"
            rows="2"
            :class="INPUT_CLASSES"
            :disabled="busy"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
            data-test="diagram-image-alt"
          ></textarea>
        </FormField>
      </fieldset>

      <fieldset class="rounded-card border-border space-y-4 border p-4" :disabled="busy">
        <legend class="text-brand-navy px-1 text-sm font-semibold">Data batang</legend>

        <FormField
          :id="ids.barUnit"
          label="Satuan (opsional)"
          hint="Contoh: jiwa, KK, atau persen."
          :error="errorByField[ids.barUnit]"
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="ids.barUnit"
            v-model="barUnit"
            type="text"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
            data-test="bar-unit"
          />
        </FormField>

        <p v-if="barRows.rows.value.length === 0" class="text-text-muted text-sm">
          Belum ada data batang.
        </p>

        <div
          v-for="(bar, index) in barRows.rows.value"
          :key="bar.uid"
          class="border-border space-y-3 border-t pt-4 first:border-t-0 first:pt-0"
          data-test="bar-row"
        >
          <div class="grid gap-4 sm:grid-cols-2">
            <FormField
              :id="ids.barLabel(index)"
              :label="`Nama batang ${index + 1}`"
              :error="errorByField[ids.barLabel(index)]"
              v-slot="{ describedBy, invalid }"
            >
              <input
                :id="ids.barLabel(index)"
                v-model="bar.label"
                type="text"
                :class="INPUT_CLASSES"
                :aria-describedby="describedBy"
                :aria-invalid="invalid ? 'true' : undefined"
                data-test="bar-label"
              />
            </FormField>
            <FormField
              :id="ids.barValue(index)"
              :label="`Angka batang ${index + 1}`"
              hint="Titik untuk ribuan, koma untuk desimal. Contoh: 1.234,5."
              :error="errorByField[ids.barValue(index)]"
              v-slot="{ describedBy, invalid }"
            >
              <input
                :id="ids.barValue(index)"
                v-model="bar.value"
                type="text"
                inputmode="decimal"
                :class="INPUT_CLASSES"
                :aria-describedby="
                  [describedBy, barNote(bar.value) ? `${ids.barValue(index)}-note` : undefined]
                    .filter(Boolean)
                    .join(' ') || undefined
                "
                :aria-invalid="invalid ? 'true' : undefined"
                data-test="bar-value"
              />
              <p
                v-if="barNote(bar.value)"
                :id="`${ids.barValue(index)}-note`"
                class="text-text-muted mt-1.5 text-xs"
                data-test="bar-value-note"
              >
                {{ barNote(bar.value) }}
              </p>
            </FormField>
          </div>
          <CollectionRowActions
            :row-label="`batang ${index + 1}`"
            :is-first="index === 0"
            :is-last="index === barRows.rows.value.length - 1"
            :busy="busy"
            :move-up-id="ids.barUp(index)"
            :move-down-id="ids.barDown(index)"
            :remove-id="ids.barRemove(index)"
            @move-up="barRows.move(index, -1)"
            @move-down="barRows.move(index, 1)"
            @remove="barRows.remove(index)"
          />
        </div>

        <div class="space-y-2">
          <BaseButton
            :id="ids.addBar"
            type="button"
            variant="secondary"
            size="md"
            class="min-h-11"
            :disabled="busy || barRows.isFull()"
            data-test="add-bar"
            @click="barRows.add()"
          >
            Tambah batang
          </BaseButton>
          <p v-if="errorByField[ids.addBar]" class="text-status-error text-xs font-medium">
            {{ errorByField[ids.addBar] }}
          </p>
        </div>
      </fieldset>
    </div>

    <div class="border-border flex flex-wrap items-center gap-3 border-t pt-4">
      <BaseButton
        type="submit"
        variant="primary"
        size="md"
        class="min-h-11"
        :disabled="busy || uploading"
        data-test="figure-save"
      >
        {{ saving ? 'Menyimpan…' : uploading ? 'Menunggu unggahan…' : 'Simpan gambar' }}
      </BaseButton>
      <BaseButton
        v-if="dirty"
        type="button"
        variant="secondary"
        size="md"
        class="min-h-11"
        :disabled="busy"
        data-test="figure-revert"
        @click="revert"
      >
        Batalkan perubahan gambar
      </BaseButton>
      <BaseButton
        v-if="stored && !confirmingDelete"
        type="button"
        variant="secondary"
        size="md"
        class="min-h-11"
        :disabled="busy"
        data-test="figure-delete"
        @click="askDelete"
      >
        Hapus gambar
      </BaseButton>
    </div>

    <div
      v-if="confirmingDelete"
      role="alertdialog"
      :aria-labelledby="`${baseId}-hapus-judul`"
      class="rounded-card border-border-strong bg-surface-muted space-y-3 border p-4"
      data-test="figure-delete-confirm"
    >
      <p :id="`${baseId}-hapus-judul`" class="text-brand-navy text-sm font-semibold">
        Hapus gambar dari bagian ini?
      </p>
      <p class="text-text-muted text-sm">
        Gambar dan teks pengganti, keterangan, serta datanya dilepas dari bagian ini. Foto yang
        sudah diunggah tidak lagi dipakai dan akan dibersihkan otomatis.
      </p>
      <p
        v-if="deleteError"
        role="alert"
        class="text-status-error text-sm font-medium"
        data-test="figure-delete-error"
      >
        {{ deleteError }}
      </p>
      <div class="flex flex-wrap gap-3">
        <BaseButton
          ref="deleteKeepButton"
          type="button"
          variant="secondary"
          size="md"
          class="min-h-11"
          :disabled="deleting"
          data-test="figure-delete-cancel"
          @click="cancelDelete"
        >
          Batal
        </BaseButton>
        <BaseButton
          type="button"
          variant="primary"
          size="md"
          class="min-h-11"
          :disabled="deleting"
          data-test="figure-delete-confirm-button"
          @click="confirmDelete"
        >
          {{ deleting ? 'Menghapus…' : 'Ya, hapus gambar' }}
        </BaseButton>
      </div>
    </div>
  </form>
</template>
