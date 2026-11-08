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

// Initial drafts and initialView are intentionally seeded once from props.settings on mount
// with no watcher so background store refreshes don't wipe in-progress edits.
const appName = ref(props.settings.appName ?? '');
const institutionName = ref(props.settings.institutionName ?? '');
const tagline = ref(props.settings.tagline ?? '');
const administrativeArea = ref(props.settings.administrativeArea ?? '');
const contactPhone = ref(props.settings.contactPhone ?? '');
const contactWhatsapp = ref(props.settings.contactWhatsapp ?? '');
const contactEmail = ref(props.settings.contactEmail ?? '');
const contactAddress = ref(props.settings.contactAddress ?? '');

/**
 * The default map view is edited visually: the picker owns latitude, longitude and zoom, so the
 * form only ever holds one `{ latitude, longitude, zoom }` draft. It is mapped to the API's
 * `{ lat, lon, zoom }` on submit.
 */
const initialView: PickerLocation = {
  latitude: props.settings.defaultCoordinates?.lat ?? MANGGAR_MAP_ORIGIN.latitude,
  longitude: props.settings.defaultCoordinates?.lon ?? MANGGAR_MAP_ORIGIN.longitude,
  zoom: props.settings.defaultCoordinates?.zoom ?? MANGGAR_MAP_DEFAULT_ZOOM,
};
const mapView = ref<PickerLocation | null>({ ...initialView });

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

  const view = mapView.value;
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

const dirty = computed(() => {
  const saved = props.settings;
  const view = mapView.value;
  const savedView = saved.defaultCoordinates;
  // `!savedView` is defensive: the backend always supplies default coordinates.
  const viewChanged =
    view === null ||
    !savedView ||
    Math.abs(view.latitude - savedView.lat) > COORDINATE_EPSILON ||
    Math.abs(view.longitude - savedView.lon) > COORDINATE_EPSILON ||
    view.zoom !== savedView.zoom;
  return (
    viewChanged ||
    appName.value !== (saved.appName ?? '') ||
    institutionName.value !== (saved.institutionName ?? '') ||
    tagline.value !== (saved.tagline ?? '') ||
    administrativeArea.value !== (saved.administrativeArea ?? '') ||
    contactPhone.value !== (saved.contactPhone ?? '') ||
    contactWhatsapp.value !== (saved.contactWhatsapp ?? '') ||
    contactEmail.value !== (saved.contactEmail ?? '') ||
    contactAddress.value !== (saved.contactAddress ?? '')
  );
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
  const view = mapView.value;
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
        v-model="mapView"
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
