<script setup lang="ts">
import { ref, computed } from 'vue';
import FormField from '../common/FormField.vue';
import FormErrorSummary from '../common/FormErrorSummary.vue';
import BaseButton from '../common/BaseButton.vue';
import type { PublicSettings } from '../../stores/settings.store';
import {
  MANGGAR_MAP_ORIGIN,
  MANGGAR_MAP_DEFAULT_ZOOM,
} from '../../constants/mapOrigin';
import { INPUT_CLASSES } from '../../utils/formStyles';

export interface PublicSettingsFormProps {
  settings: PublicSettings;
  busy?: boolean;
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

const appName = ref(props.settings.appName ?? '');
const institutionName = ref(props.settings.institutionName ?? '');
const tagline = ref(props.settings.tagline ?? '');
const administrativeArea = ref(props.settings.administrativeArea ?? '');
const contactPhone = ref(props.settings.contactPhone ?? '');
const contactWhatsapp = ref(props.settings.contactWhatsapp ?? '');
const contactEmail = ref(props.settings.contactEmail ?? '');
const contactAddress = ref(props.settings.contactAddress ?? '');

const lat = ref<number | string>(
  props.settings.defaultCoordinates?.lat ?? MANGGAR_MAP_ORIGIN.latitude,
);
const lon = ref<number | string>(
  props.settings.defaultCoordinates?.lon ?? MANGGAR_MAP_ORIGIN.longitude,
);
const zoom = ref<number | string>(
  props.settings.defaultCoordinates?.zoom ?? MANGGAR_MAP_DEFAULT_ZOOM,
);

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

  if (
    lat.value === '' ||
    lat.value === null ||
    Number.isNaN(Number(lat.value)) ||
    Number(lat.value) < -90 ||
    Number(lat.value) > 90
  ) {
    errors.lat = 'Latitude harus berupa angka antara -90 dan 90.';
  }
  if (
    lon.value === '' ||
    lon.value === null ||
    Number.isNaN(Number(lon.value)) ||
    Number(lon.value) < -180 ||
    Number(lon.value) > 180
  ) {
    errors.lon = 'Longitude harus berupa angka antara -180 dan 180.';
  }
  if (
    zoom.value === '' ||
    zoom.value === null ||
    Number.isNaN(Number(zoom.value)) ||
    Number(zoom.value) < 1 ||
    Number(zoom.value) > 20
  ) {
    errors.zoom = 'Zoom harus berupa bilangan bulat antara 1 dan 20.';
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
  'lat',
  'lon',
  'zoom',
];

const errorEntries = computed(() =>
  fieldOrder
    .map((name) => ({ fieldId: fieldId(name), message: fieldErrors.value[name] }))
    .filter((entry): entry is { fieldId: string; message: string } => Boolean(entry.message)),
);

const summaryErrors = computed(() => (submitted.value ? errorEntries.value : []));

function handleSubmit(): void {
  submitted.value = true;
  if (errorEntries.value.length > 0 || props.busy) return;

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
      lat: Number(lat.value),
      lon: Number(lon.value),
      zoom: Math.round(Number(zoom.value)),
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

    <fieldset class="rounded-card space-y-4 border border-slate-200 bg-slate-50 p-4">
      <legend class="px-1 text-xs font-semibold tracking-wider text-slate-700 uppercase">
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

    <fieldset class="rounded-card space-y-4 border border-slate-200 bg-slate-50 p-4">
      <legend class="px-1 text-xs font-semibold tracking-wider text-slate-700 uppercase">
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

    <fieldset class="rounded-card space-y-4 border border-slate-200 bg-slate-50 p-4">
      <legend class="px-1 text-xs font-semibold tracking-wider text-slate-700 uppercase">
        Koordinat Peta Default
      </legend>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField
          :id="fieldId('lat')"
          label="Latitude"
          :error="submitted ? fieldErrors.lat : undefined"
          required
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="fieldId('lat')"
            v-model.number="lat"
            type="number"
            step="any"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
            required
          />
        </FormField>

        <FormField
          :id="fieldId('lon')"
          label="Longitude"
          :error="submitted ? fieldErrors.lon : undefined"
          required
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="fieldId('lon')"
            v-model.number="lon"
            type="number"
            step="any"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
            required
          />
        </FormField>

        <FormField
          :id="fieldId('zoom')"
          label="Default Zoom"
          :error="submitted ? fieldErrors.zoom : undefined"
          required
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="fieldId('zoom')"
            v-model.number="zoom"
            type="number"
            min="1"
            max="20"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
            required
          />
        </FormField>
      </div>
    </fieldset>

    <div class="flex items-center justify-end gap-3 border-t border-slate-200 pt-3">
      <BaseButton variant="secondary" size="md" :disabled="busy" @click="emit('cancel')">
        Batal
      </BaseButton>
      <BaseButton type="submit" variant="primary" size="md" :disabled="busy">
        {{ busy ? 'Menyimpan…' : 'Simpan Pengaturan' }}
      </BaseButton>
    </div>
  </form>
</template>
