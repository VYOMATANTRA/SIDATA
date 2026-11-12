<script setup lang="ts">
/**
 * Create / edit form for one map point (SPEC §7, §8): name, type, position and RT coverage.
 *
 * Position is chosen on the shared `LocationPicker` (no coordinate fields). RT coverage comes
 * from `RtCoveragePicker`. The form enforces the same rules the server does, with plain wording:
 * a Ketua RT point covers exactly one RT, an RT has at most one Ketua RT point, and a Bank Sampah
 * or Fasilitas Umum point may cover any number of RTs. Ketua RT contact details are not edited
 * here; they stay in the Rukun Tetangga screen.
 *
 * Concurrency: for a Ketua RT point that owns exactly one RT the save carries
 * `expectedRtNumber`. When the server reports the point changed or vanished the draft is kept,
 * `refresh` asks the parent to reload the points, and saving stays off until the editor presses
 * "Muat ulang titik", which emits `reload` (the parent replaces the draft with the fresh point).
 */
import { computed, nextTick, ref, useId, watch } from 'vue';
import { RouterLink } from 'vue-router';
import BaseButton from '../../common/BaseButton.vue';
import FormErrorSummary from '../../common/FormErrorSummary.vue';
import FormField from '../../common/FormField.vue';
import LocationPicker, { type PickerLocation } from '../../maps/LocationPicker.vue';
import RtCoveragePicker from './RtCoveragePicker.vue';
import { createPoint, updatePoint, type PointWriteInput } from '../../../services/adminMaps.service';
import type { SpatialPointDTO, SpatialPointType } from '../../../types/maps';
import {
  POINT_TYPES,
  describePointSaveError,
  isStaleOrGone,
  otherKetuaRtOwner,
  ownedRtNumber,
  suggestedKetuaRtName,
  typeLabel,
  type CoverageAnalysis,
} from '../../../utils/adminMapPoints';
import { INPUT_CLASSES } from '../../../utils/formStyles';

const NAME_MAX_LENGTH = 191;
const COORDINATE_EPSILON = 1e-7;

const props = defineProps<{
  /** The point being edited, or null to create a new one. */
  point: SpatialPointDTO | null;
  analysis: CoverageAnalysis;
  /** `[lat, lon]` the location map opens on for a new point. */
  initialCenter: [number, number];
  initialZoom: number;
}>();

const emit = defineEmits<{
  (event: 'saved', point: SpatialPointDTO, created: boolean): void;
  (event: 'cancel'): void;
  (event: 'busy', value: boolean): void;
  /** The server reported a concurrent change; the parent should reload the points. */
  (event: 'refresh'): void;
  /** The editor asked to replace the draft with the latest saved version. */
  (event: 'reload'): void;
}>();

interface Draft {
  name: string;
  type: SpatialPointType;
  location: PickerLocation | null;
  rts: number[];
}

function draftFrom(point: SpatialPointDTO | null): Draft {
  return {
    name: point?.name ?? '',
    type: point?.type ?? 'ketua_rt',
    location: point ? { latitude: point.latitude, longitude: point.longitude } : null,
    rts: point ? [...point.rts].sort((a, b) => a - b) : [],
  };
}

const baseline = props.point;
const isCreate = baseline === null;
const baselineDraft = draftFrom(baseline);
const draft = ref<Draft>(draftFrom(baseline));

const isSaving = ref(false);
const submitAttempted = ref(false);
const nameTouched = ref(!isCreate);
const saveError = ref('');
const stale = ref(false);
const errorRegion = ref<HTMLElement | null>(null);

watch(isSaving, (value) => emit('busy', value));

const typeGroupName = `point-type-${useId()}`;

// Untouched name on a new point follows the chosen RT, so a Ketua RT point gets the same name
// the RT screen would give it.
watch(
  () => [draft.value.type, draft.value.rts.join(',')] as const,
  () => {
    if (!isCreate || nameTouched.value) return;
    const [rt] = draft.value.rts;
    draft.value.name =
      draft.value.type === 'ketua_rt' && draft.value.rts.length === 1 && rt !== undefined
        ? suggestedKetuaRtName(rt)
        : '';
  },
);

function sameRts(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.every((value, index) => value === right[index]);
}

function sameLocation(a: PickerLocation | null, b: PickerLocation | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    Math.abs(a.latitude - b.latitude) <= COORDINATE_EPSILON &&
    Math.abs(a.longitude - b.longitude) <= COORDINATE_EPSILON
  );
}

const typeChanged = computed(() => !isCreate && draft.value.type !== baselineDraft.type);
const coverageChanged = computed(() => !sameRts(draft.value.rts, baselineDraft.rts));
const locationChanged = computed(() => !sameLocation(draft.value.location, baselineDraft.location));
const nameChanged = computed(() => draft.value.name.trim() !== baselineDraft.name.trim());

function isDirty(): boolean {
  if (isCreate) {
    return (
      draft.value.name.trim() !== '' ||
      draft.value.location !== null ||
      draft.value.rts.length > 0 ||
      draft.value.type !== baselineDraft.type
    );
  }
  return nameChanged.value || typeChanged.value || coverageChanged.value || locationChanged.value;
}

/** RT number -> name of the other Ketua RT point that already uses it (for the picker marks). */
const takenBy = computed(() => {
  const map = new Map<number, string>();
  if (draft.value.type !== 'ketua_rt') return map;
  for (const [rt] of props.analysis.ketuaRtOwners) {
    const owner = otherKetuaRtOwner(rt, props.analysis, baseline?.id);
    if (owner) map.set(rt, owner.name);
  }
  return map;
});

/** The server only re-checks coverage when type or coverage changes; so does the form. */
const coverageRulesApply = computed(() => isCreate || typeChanged.value || coverageChanged.value);

const nameError = computed(() => {
  const name = draft.value.name.trim();
  if (name === '' && submitAttempted.value) return 'Isi nama titik.';
  if (name.length > NAME_MAX_LENGTH) return `Nama titik terlalu panjang (maksimal ${NAME_MAX_LENGTH} huruf).`;
  return '';
});

const locationError = computed(() =>
  draft.value.location === null && submitAttempted.value
    ? 'Tentukan lokasi titik di peta.'
    : '',
);

const coverageError = computed(() => {
  if (draft.value.type !== 'ketua_rt' || !coverageRulesApply.value) return '';
  const rts = draft.value.rts;
  if (rts.length > 1) {
    return 'Titik Ketua RT hanya boleh memilih satu RT. Pilih salah satu.';
  }
  if (rts.length === 0) {
    return submitAttempted.value ? 'Pilih satu RT untuk titik Ketua RT ini.' : '';
  }
  const [rt] = rts;
  const taken = rt === undefined ? undefined : takenBy.value.get(rt);
  if (taken) {
    return `RT ${rt} sudah dipakai titik Ketua RT “${taken}”. Pilih RT yang lain, atau ubah atau hapus titik tersebut terlebih dahulu.`;
  }
  return '';
});

const summaryErrors = computed(() => {
  const list: Array<{ fieldId: string; message: string }> = [];
  if (nameError.value) list.push({ fieldId: 'point-name', message: nameError.value });
  if (locationError.value) {
    list.push({ fieldId: 'point-location-focus', message: locationError.value });
  }
  if (coverageError.value) list.push({ fieldId: 'point-rt-coverage', message: coverageError.value });
  return list;
});

const showSummary = computed(() => submitAttempted.value && summaryErrors.value.length > 0);

const canSave = computed(() => !isSaving.value && !stale.value);

function buildPayload(): PointWriteInput | null {
  const location = draft.value.location;
  if (!location) return null;
  return {
    name: draft.value.name.trim(),
    type: draft.value.type,
    latitude: location.latitude,
    longitude: location.longitude,
    rts: [...draft.value.rts].sort((a, b) => a - b),
  };
}

function buildPatch(payload: PointWriteInput): Partial<PointWriteInput> {
  const patch: Partial<PointWriteInput> = {};
  if (nameChanged.value) patch.name = payload.name;
  if (typeChanged.value) patch.type = payload.type;
  if (locationChanged.value) {
    patch.latitude = payload.latitude;
    patch.longitude = payload.longitude;
  }
  if (coverageChanged.value) patch.rts = payload.rts;
  return patch;
}

async function focusErrors(): Promise<void> {
  await nextTick();
  errorRegion.value?.querySelector<HTMLElement>('[role="alert"]')?.focus();
}

async function submit(): Promise<void> {
  if (!canSave.value) return;
  submitAttempted.value = true;
  saveError.value = '';
  if (summaryErrors.value.length > 0) {
    await focusErrors();
    return;
  }
  const payload = buildPayload();
  if (!payload) return;

  if (!isCreate && !isDirty()) {
    emit('cancel');
    return;
  }

  isSaving.value = true;
  try {
    if (isCreate) {
      const created = await createPoint(payload);
      emit('saved', created, true);
    } else if (baseline) {
      const updated = await updatePoint(baseline.id, buildPatch(payload), ownedRtNumber(baseline));
      emit('saved', updated, false);
    }
  } catch (error) {
    saveError.value = describePointSaveError(error);
    if (isStaleOrGone(error)) stale.value = true;
    // Both a concurrent change and a duplicate Ketua RT claim mean the lists are out of date.
    emit('refresh');
    await focusErrors();
  } finally {
    isSaving.value = false;
  }
}

function onLocationUpdate(value: PickerLocation | null): void {
  draft.value.location = value ? { latitude: value.latitude, longitude: value.longitude } : null;
}

function onNameInput(): void {
  nameTouched.value = true;
}

defineExpose({ isDirty });
</script>

<template>
  <form class="space-y-6" novalidate data-test="point-form" @submit.prevent="submit">
    <div ref="errorRegion">
      <FormErrorSummary
        v-if="showSummary || saveError"
        :errors="showSummary ? summaryErrors : []"
        :form-error="saveError"
      />
    </div>

    <div v-if="stale" class="space-y-3" data-test="point-stale">
      <BaseButton
        variant="secondary"
        size="md"
        class="min-h-11"
        data-test="point-reload"
        @click="emit('reload')"
      >
        Muat ulang titik
      </BaseButton>
    </div>

    <FormField id="point-name" label="Nama titik" required :error="nameError">
      <template #default="{ describedBy, invalid }">
        <input
          id="point-name"
          v-model="draft.name"
          type="text"
          autocomplete="off"
          :class="INPUT_CLASSES"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
          :disabled="isSaving"
          data-autofocus
          data-test="point-name"
          @input="onNameInput"
        />
      </template>
    </FormField>

    <fieldset class="min-w-0 space-y-2 border-0 p-0" data-test="point-type">
      <legend class="text-brand-navy text-sm font-medium">Jenis titik</legend>
      <div class="grid gap-2 sm:grid-cols-3">
        <label
          v-for="type in POINT_TYPES"
          :key="type"
          class="relative block"
          :data-test="`point-type-${type}`"
        >
          <input
            v-model="draft.type"
            type="radio"
            :name="typeGroupName"
            :value="type"
            :disabled="isSaving"
            class="peer sr-only"
          />
          <span
            class="border-border-strong text-brand-navy hover:bg-surface-hover peer-checked:bg-brand-navy peer-checked:border-brand-navy peer-focus-visible:outline-focus-ring peer-disabled:bg-surface-hover peer-disabled:text-text-muted flex min-h-11 cursor-pointer items-center justify-center rounded-btn border px-3 text-center text-sm font-medium peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-disabled:cursor-not-allowed"
          >
            {{ typeLabel(type) }}
          </span>
        </label>
      </div>
      <p
        v-if="draft.type === 'ketua_rt'"
        class="text-text-muted text-sm leading-snug"
        data-test="point-rt-contact-note"
      >
        Nama, telepon, dan alamat Ketua RT diubah di halaman
        <RouterLink
          to="/admin/rukun-tetangga"
          class="text-brand-navy focus-visible:outline-focus-ring rounded-xs font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Rukun Tetangga
        </RouterLink>
        , bukan di sini.
      </p>
    </fieldset>

    <LocationPicker
      :model-value="draft.location"
      label="Lokasi titik"
      help-text="Klik atau ketuk peta untuk meletakkan pin, lalu geser pin untuk menyesuaikan."
      :error="locationError || undefined"
      id-prefix="point-location"
      test-id="point-location"
      :initial-center="initialCenter"
      :initial-zoom="initialZoom"
      :disabled="isSaving"
      @update:model-value="onLocationUpdate"
    />

    <div id="point-rt-coverage" tabindex="-1">
      <RtCoveragePicker
        v-model="draft.rts"
        :mode="draft.type === 'ketua_rt' ? 'single' : 'multiple'"
        :taken-by="takenBy"
        :disabled="isSaving"
        :error="coverageError || undefined"
      />
    </div>

    <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <BaseButton
        variant="secondary"
        size="md"
        class="min-h-11"
        :disabled="isSaving"
        data-test="point-cancel"
        @click="emit('cancel')"
      >
        Batal
      </BaseButton>
      <BaseButton
        type="submit"
        variant="primary"
        size="md"
        class="min-h-11"
        :disabled="!canSave"
        data-test="point-save"
      >
        {{ isSaving ? 'Menyimpan…' : isCreate ? 'Tambah titik' : 'Simpan perubahan' }}
      </BaseButton>
    </div>
  </form>
</template>
