<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AlertBanner from '../../common/AlertBanner.vue';
import PublicSettingsForm from '../../data/PublicSettingsForm.vue';
import { useSettingsStore, type PublicSettings } from '../../../stores/settings.store';
import {
  PORTAL_SETTINGS_LOAD_FALLBACK_MESSAGE,
  toUserMessage,
} from '../../../utils/userMessages';

/**
 * Saves one part of the public portal settings (SPEC §4, §8): the identity and contact fields,
 * or the starting map view. Each part has its own form, its own Save and its own result, so a
 * failed map save never costs the contact edits (and vice versa). The form is shown only once
 * the stored values have actually loaded, so the built-in defaults can never be saved over them.
 */
const props = withDefaults(
  defineProps<{
    part: 'identity' | 'map';
    /** The page mounts this section twice; only one instance shows the shared load failure. */
    showLoadError?: boolean;
  }>(),
  { showLoadError: true },
);

const emit = defineEmits<{ (e: 'dirty-change', dirty: boolean): void }>();

const store = useSettingsStore();

const formKey = ref(0);
const busy = ref(false);
const serverError = ref('');
const statusMessage = ref('');
const dirty = ref(false);

const SAVED_MESSAGE: Record<'identity' | 'map', string> = {
  identity: 'Identitas dan kontak portal berhasil disimpan.',
  map: 'Tampilan awal peta berhasil disimpan.',
};

/** True from the first paint until the first load has answered (no error flash before it). */
const loading = ref(true);

async function load(): Promise<void> {
  loading.value = true;
  try {
    await store.fetchPublicSettings(true);
  } finally {
    loading.value = false;
  }
}

onMounted(() => void load());

function onDirtyChange(value: boolean): void {
  dirty.value = value;
  if (value) statusMessage.value = '';
  emit('dirty-change', value);
}

async function handleSubmit(patch: Partial<PublicSettings>): Promise<void> {
  busy.value = true;
  serverError.value = '';
  statusMessage.value = '';
  try {
    await store.updatePublicSettings(patch);
    statusMessage.value = SAVED_MESSAGE[props.part];
  } catch (error) {
    serverError.value = toUserMessage(error, 'menyimpan pengaturan portal').message;
  } finally {
    busy.value = false;
  }
}

/** "Batalkan perubahan": back to the stored values, errors cleared. */
function discard(): void {
  serverError.value = '';
  statusMessage.value = '';
  formKey.value += 1;
}
</script>

<template>
  <div>
    <p v-if="loading && !store.isLoaded" class="text-text-muted text-sm" role="status">
      Memuat pengaturan…
    </p>

    <AlertBanner
      v-else-if="!store.isLoaded && showLoadError"
      :message="store.error ?? PORTAL_SETTINGS_LOAD_FALLBACK_MESSAGE"
      :kind="store.errorKind ?? undefined"
      :busy="loading"
      data-test="portal-load-error"
      @retry="load"
    />

    <p
      v-else-if="!store.isLoaded"
      class="text-text-muted text-sm"
      data-test="portal-load-elsewhere"
    >
      Pengaturan belum dapat dimuat. Lihat keterangan di bagian Identitas dan kontak portal.
    </p>

    <template v-else>
      <div role="status" aria-live="polite">
        <p
          v-if="statusMessage"
          class="rounded-card border-status-success-border bg-status-success-surface text-status-success mb-4 border px-4 py-3 text-sm font-semibold"
          data-test="portal-saved"
        >
          {{ statusMessage }}
        </p>
      </div>
      <PublicSettingsForm
        :key="formKey"
        :settings="store.settings"
        :part="part"
        :id-prefix="part === 'identity' ? 'identitas' : 'peta'"
        :busy="busy"
        :server-error="serverError"
        cancel-label="Batalkan perubahan"
        require-changes
        @submit="handleSubmit"
        @cancel="discard"
        @dirty-change="onDirtyChange"
      />
    </template>
  </div>
</template>
