<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue';
import FormField from '../common/FormField.vue';
import FormErrorSummary from '../common/FormErrorSummary.vue';
import BaseButton from '../common/BaseButton.vue';
import LocationPicker, { type PickerLocation } from '../maps/LocationPicker.vue';
import type { PublicSettings } from '../../stores/settings.store';
import { MANGGAR_MAP_ORIGIN, MANGGAR_MAP_DEFAULT_ZOOM } from '../../constants/mapOrigin';
import { INPUT_CLASSES } from '../../utils/formStyles';
import { COORDINATE_EPSILON } from '../../utils/geoPicker';

/** Same bounds the API enforces for `defaultCoordinates` (backend `coordinatesSchema`). */
const MIN_ZOOM = 1;
const MAX_ZOOM = 20;

export interface PublicSettingsFormProps {
  settings: PublicSettings;
  /** A save is in flight: the form is locked and a second submit is ignored. */
  busy?: boolean;
  /** Plain-Indonesian failure text for the last save (the parent maps API errors with `toUserMessage`). */
  serverError?: string;
  idPrefix?: string;
}

const props = withDefaults(defineProps<PublicSettingsFormProps>(), {
  busy: false,
  serverError: '',
  idPrefix: 'settings',
});

const emit = defineEmits<{
  (e: 'submit', patch: Partial<PublicSettings>): void;
  (e: 'cancel'): void;
}>();

function fieldId(name: string): string {
  return `${props.idPrefix}-${name}`;
}

type FormFieldKey =
  | 'appName'
  | 'institutionName'
  | 'tagline'
  | 'administrativeArea'
  | 'contactPhone'
  | 'contactWhatsapp'
  | 'contactEmail'
  | 'contactAddress';

interface FormDraft {
  appName: string;
  institutionName: string;
  tagline: string;
  administrativeArea: string;
  contactPhone: string;
  contactWhatsapp: string;
  contactEmail: string;
  contactAddress: string;
}

const draft = ref<Partial<FormDraft>>({});
const mapViewOverride = ref<PickerLocation | null>(null);

const baseline = computed<FormDraft>(() => ({
  appName: props.settings.appName ?? '',
  institutionName: props.settings.institutionName ?? '',
  tagline: props.settings.tagline ?? '',
  administrativeArea: props.settings.administrativeArea ?? '',
  contactPhone: props.settings.contactPhone ?? '',
  contactWhatsapp: props.settings.contactWhatsapp ?? '',
  contactEmail: props.settings.contactEmail ?? '',
  contactAddress: props.settings.contactAddress ?? '',
}));

const baselineView = computed<PickerLocation>(() => ({
  latitude: props.settings.defaultCoordinates?.lat ?? MANGGAR_MAP_ORIGIN.latitude,
  longitude: props.settings.defaultCoordinates?.lon ?? MANGGAR_MAP_ORIGIN.longitude,
  zoom: props.settings.defaultCoordinates?.zoom ?? MANGGAR_MAP_DEFAULT_ZOOM,
}));

function createFieldModel(key: FormFieldKey) {
  return computed({
    get: () => draft.value[key] ?? baseline.value[key],
    set: (val: string) => {
      draft.value[key] = val;
    },
  });
}

const appName = createFieldModel('appName');
const institutionName = createFieldModel('institutionName');
const tagline = createFieldModel('tagline');
const administrativeArea = createFieldModel('administrativeArea');
const contactPhone = createFieldModel('contactPhone');
const contactWhatsapp = createFieldModel('contactWhatsapp');
const contactEmail = createFieldModel('contactEmail');
const contactAddress = createFieldModel('contactAddress');

/**
 * The default map view is edited visually: the picker owns latitude, longitude and zoom.
 * In the form, mapView derives from baselineView until the user interacts with the picker.
 */
const mapViewModel = computed<PickerLocation | null>({
  get: () => mapViewOverride.value ?? baselineView.value,
  set: (val: PickerLocation | null) => {
    mapViewOverride.value = val;
  },
});

const submitted = ref(false);

const fieldErrors = computed<Record<string, string | undefined>>(() => {
  const errors: Record<string, string | undefined> = {};

  if (!appName.value.trim()) {
    errors.appName = 'Nama aplikasi tidak boleh kosong.';
  }
  if (!institutionName.value.trim()) {
    errors.institutionName = 'Nama institusi tidak boleh kosong.';
  }
  if (!contactEmail.value.trim()) {
    errors.contactEmail = 'Email kontak tidak boleh kosong.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.value.trim())) {
    errors.contactEmail = 'Format email tidak valid.';
  }

  const view = mapViewModel.value;
  // Defensive: the picker only emits normalised, clamped views, so this branch is a safety net
  // for a malformed value from a future caller rather than a state an editor can reach.
  if (
    view === null ||
    !Number.isFinite(view.latitude) ||
    !Number.isFinite(view.longitude) ||
    Math.abs(view.latitude) > 90 ||
    Math.abs(view.longitude) > 180 ||
    typeof view.zoom !== 'number' ||
    !Number.isInteger(view.zoom) ||
    view.zoom < MIN_ZOOM ||
    view.zoom > MAX_ZOOM
  ) {
    errors.mapView = 'Tampilan peta belum valid. Geser atau perbesar peta untuk memilihnya lagi.';
  }

  return errors;
});

const fieldOrder = [
  'appName',
  'institutionName',
  'tagline',
  'administrativeArea',
  'contactPhone',
  'contactWhatsapp',
  'contactEmail',
  'contactAddress',
  'mapView',
];

/** The picker's map region carries this id so the error summary can focus it. */
function errorTargetId(name: string): string {
  return name === 'mapView' ? `${fieldId('mapView')}-focus` : fieldId(name);
}

const errorEntries = computed(() =>
  fieldOrder
    .map((name) => ({ fieldId: errorTargetId(name), message: fieldErrors.value[name] }))
    .filter((entry): entry is { fieldId: string; message: string } => Boolean(entry.message)),
);

const summaryErrors = computed(() => (submitted.value ? errorEntries.value : []));

function sameMapView(a: PickerLocation | null, b: PickerLocation | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return (
    Math.abs(a.latitude - b.latitude) <= COORDINATE_EPSILON &&
    Math.abs(a.longitude - b.longitude) <= COORDINATE_EPSILON &&
    a.zoom === b.zoom
  );
}

const dirty = computed(() => {
  const fields: FormFieldKey[] = [
    'appName',
    'institutionName',
    'tagline',
    'administrativeArea',
    'contactPhone',
    'contactWhatsapp',
    'contactEmail',
    'contactAddress',
  ];

  const anyFieldDirty = fields.some((key) => {
    const override = draft.value[key];
    return override !== undefined && override !== baseline.value[key];
  });

  const viewDirty =
    mapViewOverride.value !== null && !sameMapView(mapViewOverride.value, baselineView.value);

  return anyFieldDirty || viewDirty;
});

/** Lets the dialog ask "is there unsaved work?" before it closes. */
defineExpose({ isDirty: dirty });

/** Always says what is true: saved, unsaved, saving, or a failed save with the draft kept. */
const saveStateText = computed(() => {
  if (props.busy) return 'Menyimpan perubahan…';
  if (props.serverError) return 'Perubahan belum tersimpan. Isian Anda masih ada di formulir.';
  if (dirty.value) return 'Ada perubahan yang belum disimpan.';
  return 'Belum ada perubahan.';
});

// The parent flips `busy` right after it receives `submit`, but a second click can land before
// that re-render. This guard closes the gap until the parent has had its turn.
let submitGuard = false;

watch(
  () => props.busy,
  (isBusy) => {
    if (!isBusy) submitGuard = false;
  },
);

function handleSubmit(): void {
  submitted.value = true;
  if (props.busy || submitGuard) return;
  const view = mapViewModel.value;
  if (errorEntries.value.length > 0 || view === null) return;

  submitGuard = true;
  void nextTick(() => {
    // A parent that never reports busy must not lock the form for good.
    if (!props.busy) submitGuard = false;
  });
  emit('submit', {
    appName: appName.value.trim(),
    institutionName: institutionName.value.trim(),
    tagline: tagline.value.trim(),
    administrativeArea: administrativeArea.value.trim(),
    contactPhone: contactPhone.value.trim(),
    contactWhatsapp: contactWhatsapp.value.trim(),
    contactEmail: contactEmail.value.trim(),
    contactAddress: contactAddress.value.trim(),
    defaultCoordinates: {
      lat: view.latitude,
      lon: view.longitude,
      zoom: view.zoom ?? MANGGAR_MAP_DEFAULT_ZOOM,
    },
  });
}
</script>

<template>
  <form novalidate class="space-y-5" @submit.prevent="handleSubmit">
    <FormErrorSummary
      v-if="summaryErrors.length > 0 || serverError"
      :errors="summaryErrors"
      :form-error="serverError"
    />

    <fieldset class="rounded-card border-border bg-surface-muted space-y-4 border p-4">
      <legend class="text-brand-navy px-1 text-xs font-semibold tracking-wider uppercase">
        Identitas Portal
      </legend>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          :id="fieldId('appName')"
          label="Nama Aplikasi"
          :error="submitted ? fieldErrors.appName : undefined"
          required
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="fieldId('appName')"
            v-model="appName"
            type="text"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
            required
          />
        </FormField>

        <FormField
          :id="fieldId('institutionName')"
          label="Nama Institusi / Kelurahan"
          :error="submitted ? fieldErrors.institutionName : undefined"
          required
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="fieldId('institutionName')"
            v-model="institutionName"
            type="text"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
            required
          />
        </FormField>
      </div>

      <FormField :id="fieldId('tagline')" label="Tagline / Slogan" v-slot="{ describedBy }">
        <input
          :id="fieldId('tagline')"
          v-model="tagline"
          type="text"
          :class="INPUT_CLASSES"
          :aria-describedby="describedBy"
        />
      </FormField>

      <FormField
        :id="fieldId('administrativeArea')"
        label="Wilayah Administratif"
        v-slot="{ describedBy }"
      >
        <input
          :id="fieldId('administrativeArea')"
          v-model="administrativeArea"
          type="text"
          :class="INPUT_CLASSES"
          :aria-describedby="describedBy"
        />
      </FormField>
    </fieldset>

    <fieldset class="rounded-card border-border bg-surface-muted space-y-4 border p-4">
      <legend class="text-brand-navy px-1 text-xs font-semibold tracking-wider uppercase">
        Kontak &amp; Pelayanan
      </legend>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField :id="fieldId('contactPhone')" label="Nomor Telepon" v-slot="{ describedBy }">
          <input
            :id="fieldId('contactPhone')"
            v-model="contactPhone"
            type="text"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
          />
        </FormField>

        <FormField :id="fieldId('contactWhatsapp')" label="Nomor WhatsApp" v-slot="{ describedBy }">
          <input
            :id="fieldId('contactWhatsapp')"
            v-model="contactWhatsapp"
            type="text"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
          />
        </FormField>

        <FormField
          :id="fieldId('contactEmail')"
          label="Email Layanan"
          :error="submitted ? fieldErrors.contactEmail : undefined"
          required
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="fieldId('contactEmail')"
            v-model="contactEmail"
            type="email"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
            required
          />
        </FormField>
      </div>

      <FormField
        :id="fieldId('contactAddress')"
        label="Alamat Kantor Kelurahan"
        v-slot="{ describedBy }"
      >
        <textarea
          :id="fieldId('contactAddress')"
          v-model="contactAddress"
          rows="2"
          :class="INPUT_CLASSES"
          :aria-describedby="describedBy"
        ></textarea>
      </FormField>
    </fieldset>

    <div class="rounded-card border-border bg-surface-muted border p-4">
      <LocationPicker
        v-model="mapViewModel"
        :id-prefix="fieldId('mapView')"
        test-id="settings-map-view"
        label="Atur tampilan peta"
        help-text="Geser dan perbesar peta sampai bagian yang ingin ditampilkan berada tepat di tanda silang. Titik tengah dan tingkat perbesaran saat ini akan menjadi tampilan awal peta untuk pengunjung."
        :error="submitted ? fieldErrors.mapView : undefined"
        :initial-center="[MANGGAR_MAP_ORIGIN.latitude, MANGGAR_MAP_ORIGIN.longitude]"
        :initial-zoom="MANGGAR_MAP_DEFAULT_ZOOM"
        :min-zoom="MIN_ZOOM"
        :max-zoom="MAX_ZOOM"
        :disabled="busy"
        include-zoom
      />
    </div>

    <div class="border-border space-y-3 border-t pt-3">
      <p
        role="status"
        aria-live="polite"
        class="text-text-muted text-sm"
        data-test="settings-save-state"
      >
        {{ saveStateText }}
      </p>
      <div class="flex items-center justify-end gap-3">
        <BaseButton
          variant="secondary"
          size="md"
          class="min-h-11"
          :disabled="busy"
          @click="emit('cancel')"
        >
          Batal
        </BaseButton>
        <BaseButton type="submit" variant="primary" size="md" class="min-h-11" :disabled="busy">
          {{ busy ? 'Menyimpan…' : 'Simpan perubahan' }}
        </BaseButton>
      </div>
    </div>
  </form>
</template>
