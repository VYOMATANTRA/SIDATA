<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import BaseButton from '../../common/BaseButton.vue';
import AlertBanner from '../../common/AlertBanner.vue';
import { CHOICE_KEPT_SUFFIX, withDraftKept } from '../../../utils/userMessages';
import { useWeatherConfigStore } from '../../../stores/weatherConfig.store';
import { useWeatherStore } from '../../../stores/weather.store';
import {
  WEATHER_REFRESH_PRESETS,
  customRefreshLabel,
  presetForCacheTtl,
} from '../../../utils/weatherRefresh';

/**
 * Weather settings (SPEC §7, §8). The area is fixed to Manggar and shown read-only. The Admin
 * picks how often the site checks for fresh forecasts from three named choices; the stored
 * millisecond value, the BMKG address and the other operational values never appear. A stored
 * value that matches no choice is shown as "Pengaturan khusus (… menit)" and is only replaced
 * when the Admin picks a named choice.
 */
const emit = defineEmits<{ (e: 'dirty-change', dirty: boolean): void }>();

const config = useWeatherConfigStore();
const weather = useWeatherStore();

const CUSTOM_ID = 'khusus';

/** Id of the choice the stored value corresponds to. */
const storedChoiceId = computed<string | null>(() => {
  if (config.cacheTtlMs === null) return null;
  return presetForCacheTtl(config.cacheTtlMs)?.id ?? CUSTOM_ID;
});

const draftChoiceId = ref<string | null>(null);
const selectedChoiceId = computed(() => draftChoiceId.value ?? storedChoiceId.value);

const isDirty = computed(
  () => draftChoiceId.value !== null && draftChoiceId.value !== storedChoiceId.value,
);

watch(isDirty, (value) => emit('dirty-change', value), { immediate: true });

const savedMessage = ref('');

/** True from the first paint until the public weather check has answered. */
const checkingStatus = ref(true);

async function checkStatus(): Promise<void> {
  checkingStatus.value = true;
  try {
    await weather.fetchWeather(true);
  } finally {
    checkingStatus.value = false;
  }
}

function load(): void {
  void config.fetchConfig();
  void checkStatus();
}

onMounted(load);

function choose(id: string): void {
  draftChoiceId.value = id;
  savedMessage.value = '';
  config.clearSaveError();
}

const selectedPreset = computed(() =>
  WEATHER_REFRESH_PRESETS.find((preset) => preset.id === selectedChoiceId.value),
);

const canSave = computed(
  () => isDirty.value && selectedPreset.value !== undefined && !config.isSaving,
);

async function save(): Promise<void> {
  const preset = selectedPreset.value;
  if (!preset || !canSave.value) return;
  savedMessage.value = '';
  const ok = await config.saveRefreshInterval(preset.cacheTtlMs);
  if (ok) {
    draftChoiceId.value = null;
    savedMessage.value = `Pengaturan cuaca berhasil disimpan. Pilihan sekarang: ${preset.label}.`;
  }
}

function discard(): void {
  draftChoiceId.value = null;
  savedMessage.value = '';
  config.clearSaveError();
}

const areaName = computed(() => weather.locationName);

const WITA_FORMAT = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Asia/Makassar',
});

const lastUpdateText = computed(() => {
  const iso = weather.fetchedAt;
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${WITA_FORMAT.format(date)} WITA`;
});

/** Plain-language service state; never a code or a technical error. */
const serviceStatus = computed<{ tone: 'ok' | 'warning' | 'error' | 'loading'; text: string }>(
  () => {
    if (checkingStatus.value) return { tone: 'loading', text: 'Memeriksa status layanan cuaca…' };
    if (!weather.isLoaded) {
      return {
        tone: 'error',
        text: weather.error ?? 'Status layanan cuaca belum dapat diperiksa.',
      };
    }
    if (weather.isStale) {
      return {
        tone: 'warning',
        text: 'Layanan cuaca BMKG sedang tidak dapat dihubungi. Situs menampilkan data terakhir yang berhasil diambil.',
      };
    }
    if (weather.error) {
      return {
        tone: 'warning',
        text: 'Pembaruan terakhir belum berhasil. Situs masih menampilkan data yang sudah ada.',
      };
    }
    return { tone: 'ok', text: 'Layanan cuaca berjalan normal.' };
  },
);

const loading = computed(() => !config.isLoaded && !config.error);
</script>

<template>
  <div class="space-y-6">
    <dl class="grid gap-4 sm:grid-cols-2">
      <div class="rounded-card border-border bg-surface-muted border p-4">
        <dt class="text-text-muted text-xs font-semibold tracking-wider uppercase">Wilayah</dt>
        <dd class="text-brand-navy mt-1 text-sm font-semibold" data-test="weather-area">
          {{ areaName }}
        </dd>
        <dd class="text-text-muted mt-1 text-xs">
          Cuaca ditampilkan khusus untuk Kelurahan Manggar dan tidak dapat diganti dari sini.
        </dd>
      </div>

      <div class="rounded-card border-border bg-surface-muted border p-4">
        <dt class="text-text-muted text-xs font-semibold tracking-wider uppercase">
          Status layanan cuaca
        </dt>
        <dd class="mt-1 text-sm" role="status" aria-live="polite" data-test="weather-status">
          <span
            class="font-semibold"
            :class="{
              'text-status-success': serviceStatus.tone === 'ok',
              'text-status-warning': serviceStatus.tone === 'warning',
              'text-status-error': serviceStatus.tone === 'error',
              'text-text-muted': serviceStatus.tone === 'loading',
            }"
          >
            {{ serviceStatus.text }}
          </span>
        </dd>
        <dd v-if="lastUpdateText" class="text-text-muted mt-1 text-xs" data-test="weather-last">
          Terakhir berhasil diperbarui: {{ lastUpdateText }}
        </dd>
        <dd v-if="!checkingStatus && !weather.isLoaded" class="mt-2">
          <BaseButton
            variant="secondary"
            size="md"
            class="min-h-11"
            data-test="weather-status-retry"
            @click="checkStatus"
          >
            Periksa lagi
          </BaseButton>
        </dd>
      </div>
    </dl>

    <p v-if="loading" class="text-text-muted text-sm" role="status">Memuat pengaturan cuaca…</p>

    <AlertBanner
      v-else-if="config.error && !config.isLoaded"
      :message="config.error"
      :kind="config.errorKind ?? undefined"
      :busy="config.isLoading"
      data-test="weather-config-error"
      @retry="load"
    />

    <form v-else-if="config.isLoaded" class="space-y-4" novalidate @submit.prevent="save">
      <fieldset class="space-y-3">
        <legend class="text-brand-navy text-sm font-semibold">
          Seberapa sering situs memeriksa pembaruan cuaca
        </legend>
        <p id="cuaca-pilihan-keterangan" class="text-text-muted max-w-3xl text-sm">
          Pilihan ini mengatur seberapa sering situs ini memeriksa kabar terbaru ke BMKG, bukan
          seberapa sering BMKG menerbitkan prakiraan cuaca. Prakiraan tetap berubah mengikuti jadwal
          BMKG.
        </p>

        <ul class="space-y-2">
          <li v-for="preset in WEATHER_REFRESH_PRESETS" :key="preset.id">
            <label
              :for="`cuaca-${preset.id}`"
              class="rounded-card border-border-strong bg-surface hover:bg-surface-muted flex min-h-11 cursor-pointer items-center gap-3 border px-4 py-2 text-sm"
            >
              <input
                :id="`cuaca-${preset.id}`"
                type="radio"
                name="cuaca-penyegaran"
                class="accent-brand-navy focus-visible:outline-focus-ring h-4 w-4 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2"
                :value="preset.id"
                :checked="selectedChoiceId === preset.id"
                :disabled="config.isSaving"
                aria-describedby="cuaca-pilihan-keterangan"
                @change="choose(preset.id)"
              />
              <span class="text-brand-navy">{{ preset.label }}</span>
            </label>
          </li>
          <li v-if="storedChoiceId === CUSTOM_ID && config.cacheTtlMs !== null">
            <label
              :for="`cuaca-${CUSTOM_ID}`"
              class="rounded-card border-border-strong bg-surface hover:bg-surface-muted flex min-h-11 cursor-pointer items-center gap-3 border px-4 py-2 text-sm"
            >
              <input
                :id="`cuaca-${CUSTOM_ID}`"
                type="radio"
                name="cuaca-penyegaran"
                class="accent-brand-navy focus-visible:outline-focus-ring h-4 w-4 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2"
                :value="CUSTOM_ID"
                :checked="selectedChoiceId === CUSTOM_ID"
                :disabled="config.isSaving"
                aria-describedby="cuaca-khusus-keterangan"
                @change="choose(CUSTOM_ID)"
              />
              <span class="text-brand-navy" data-test="weather-custom-label">
                {{ customRefreshLabel(config.cacheTtlMs) }}
              </span>
            </label>
            <p id="cuaca-khusus-keterangan" class="text-text-muted mt-1 pl-1 text-xs">
              Pengaturan ini ditetapkan sebelumnya dan tetap berlaku sampai Anda memilih salah satu
              pilihan di atas.
            </p>
          </li>
        </ul>
      </fieldset>

      <div role="status" aria-live="polite">
        <p
          v-if="savedMessage"
          class="rounded-card border-status-success-border bg-status-success-surface text-status-success border px-4 py-3 text-sm font-semibold"
          data-test="weather-saved"
        >
          {{ savedMessage }}
        </p>
      </div>

      <AlertBanner
        v-if="config.saveError"
        :message="withDraftKept(config.saveError, config.saveErrorKind, CHOICE_KEPT_SUFFIX)"
        data-test="weather-save-error"
      />

      <div class="border-border flex flex-wrap items-center justify-end gap-3 border-t pt-3">
        <BaseButton
          variant="secondary"
          size="md"
          class="min-h-11"
          :disabled="!isDirty || config.isSaving"
          data-test="weather-discard"
          @click="discard"
        >
          Batalkan perubahan
        </BaseButton>
        <BaseButton
          type="submit"
          variant="primary"
          size="md"
          class="min-h-11"
          :disabled="!canSave"
          data-test="weather-save"
        >
          {{ config.isSaving ? 'Menyimpan…' : 'Simpan perubahan' }}
        </BaseButton>
      </div>
    </form>
  </div>
</template>
