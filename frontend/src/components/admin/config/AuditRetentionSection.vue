<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import BaseButton from '../../common/BaseButton.vue';
import {
  MAX_RETENTION_DAYS,
  SEVERITY_LABELS,
  formatDurationLabel,
  useAuditRetentionStore,
  validateRetentionPolicy,
  type AuditRetentionPolicy,
} from '../../../stores/auditRetention.store';
import { CHECKBOX_CLASSES, INPUT_CLASSES } from '../../../utils/formStyles';

/**
 * How long the system log keeps each kind of entry (SPEC §3, §8). Keep-forever is a checkbox
 * rather than the number 0; the order rule (more important entries are kept at least as long as
 * less important ones) is checked as the Admin types. Unacknowledged critical entries are never
 * deleted, whatever is chosen here, and the page says so.
 */
const emit = defineEmits<{ (e: 'dirty-change', dirty: boolean): void }>();

const store = useAuditRetentionStore();

type Key = keyof AuditRetentionPolicy;

interface Row {
  forever: boolean;
  /** Days while a limit applies; '' while the field is empty. Kept when forever is ticked. */
  days: number | '';
}

/** Days offered when an Admin unticks "Simpan selamanya" and has not typed a number yet. */
const DEFAULT_DAYS = 365;

const KEYS: readonly Key[] = ['info', 'warning', 'critical'];

const DESCRIPTIONS: Record<Key, string> = {
  info: 'Aktivitas rutin, seperti masuk dan keluar akun.',
  warning: 'Kejadian yang perlu diperhatikan, seperti penghapusan data atau percobaan yang gagal.',
  critical:
    'Kejadian penting untuk keamanan, seperti perubahan hak akses, pengaturan ulang kata sandi, dan perubahan masa simpan ini.',
};

const rows = reactive<Record<Key, Row>>({
  info: { forever: true, days: DEFAULT_DAYS },
  warning: { forever: true, days: DEFAULT_DAYS },
  critical: { forever: true, days: DEFAULT_DAYS },
});

const isLoaded = ref(false);
/** True from the first paint until the first load has answered (no error flash before it). */
const loadingInitial = ref(true);

function syncFromStore(): void {
  for (const key of KEYS) {
    const stored = store.retention[key];
    rows[key].forever = stored === 0;
    rows[key].days = stored === 0 ? DEFAULT_DAYS : stored;
  }
}

/** The policy the rows describe; an empty or invalid day count becomes NaN and fails validation. */
const draftPolicy = computed<AuditRetentionPolicy>(() => {
  const value = (key: Key): number => {
    const row = rows[key];
    if (row.forever) return 0;
    // 0 days would silently mean "forever"; a limit must be at least one day.
    return row.days === '' || row.days < 1 ? Number.NaN : row.days;
  };
  return { info: value('info'), warning: value('warning'), critical: value('critical') };
});

const validationError = computed(() => validateRetentionPolicy(draftPolicy.value));

const isDirty = computed(
  () =>
    isLoaded.value && KEYS.some((key) => !Object.is(draftPolicy.value[key], store.retention[key])),
);

watch(isDirty, (value) => emit('dirty-change', value), { immediate: true });

const canSave = computed(
  () => isLoaded.value && isDirty.value && validationError.value === null && !store.isSaving,
);

async function load(): Promise<void> {
  loadingInitial.value = true;
  const ok = await store.fetchRetention();
  isLoaded.value = ok;
  if (ok) syncFromStore();
  loadingInitial.value = false;
}

onMounted(load);

function setForever(key: Key, forever: boolean): void {
  rows[key].forever = forever;
  store.clearMessages();
}

function setDays(key: Key, event: Event): void {
  const raw = (event.target as HTMLInputElement).value;
  rows[key].days = raw.trim() === '' ? '' : Number(raw);
  store.clearMessages();
}

async function save(): Promise<void> {
  if (!canSave.value) return;
  const ok = await store.updateRetention({ ...draftPolicy.value });
  if (ok) syncFromStore();
}

function discard(): void {
  syncFromStore();
  store.clearMessages();
}

function durationLabel(key: Key): string {
  return formatDurationLabel(draftPolicy.value[key]);
}
</script>

<template>
  <div class="space-y-4">
    <ul class="text-text-muted max-w-3xl list-disc space-y-1 pl-5 text-sm">
      <li>
        Log Kritis yang belum ditandai “Telah Dibaca” di halaman Log sistem tidak pernah dihapus,
        berapa pun masa simpan yang dipilih.
      </li>
      <li>
        Peristiwa yang lebih penting tidak boleh dihapus lebih cepat daripada yang kurang penting:
        Kritis paling sedikit selama Peringatan, dan Peringatan paling sedikit selama Info.
      </li>
      <li>
        Pengaturan ini menentukan log mana yang boleh dihapus oleh pembersihan terjadwal. Setiap
        perubahan masa simpan tercatat di Log sistem sebagai kejadian Kritis.
      </li>
    </ul>

    <p v-if="loadingInitial" class="text-text-muted text-sm" role="status">
      Memuat masa simpan log…
    </p>

    <div
      v-else-if="!isLoaded"
      role="alert"
      class="rounded-card border-status-error-border bg-status-error-surface border p-4"
      data-test="retention-load-error"
    >
      <p class="text-status-error text-sm font-semibold">
        {{ store.error ?? 'Masa simpan log belum dapat dimuat.' }}
      </p>
      <BaseButton
        variant="secondary"
        size="md"
        class="mt-3 min-h-11"
        data-test="retention-retry"
        @click="load"
      >
        Coba lagi
      </BaseButton>
    </div>

    <form v-else class="space-y-5" novalidate @submit.prevent="save">
      <fieldset
        v-for="key in KEYS"
        :key="key"
        class="rounded-card border-border bg-surface-muted space-y-3 border p-4"
        :data-test="`retention-${key}`"
      >
        <legend class="text-brand-navy px-1 text-sm font-semibold">
          Log {{ SEVERITY_LABELS[key] }}
        </legend>
        <p :id="`retensi-${key}-keterangan`" class="text-text-muted text-sm">
          {{ DESCRIPTIONS[key] }}
        </p>

        <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-6">
          <label
            :for="`retensi-${key}-selamanya`"
            class="text-brand-navy flex min-h-11 cursor-pointer items-center gap-2 text-sm"
          >
            <input
              :id="`retensi-${key}-selamanya`"
              type="checkbox"
              :class="CHECKBOX_CLASSES"
              :checked="rows[key].forever"
              :disabled="store.isSaving"
              :aria-describedby="`retensi-${key}-keterangan`"
              @change="setForever(key, ($event.target as HTMLInputElement).checked)"
            />
            Simpan selamanya
          </label>

          <div class="sm:w-56">
            <label :for="`retensi-${key}-hari`" class="text-text-muted block text-sm font-medium">
              Simpan selama (hari)
            </label>
            <input
              :id="`retensi-${key}-hari`"
              type="number"
              inputmode="numeric"
              min="1"
              :max="MAX_RETENTION_DAYS"
              step="1"
              :class="INPUT_CLASSES"
              class="mt-1"
              :value="rows[key].forever ? '' : rows[key].days"
              :placeholder="rows[key].forever ? 'Tanpa batas' : ''"
              :disabled="rows[key].forever || store.isSaving"
              :aria-describedby="`retensi-${key}-keterangan retensi-${key}-ringkasan`"
              :aria-invalid="validationError !== null && !rows[key].forever ? 'true' : undefined"
              @input="setDays(key, $event)"
            />
          </div>

          <p
            :id="`retensi-${key}-ringkasan`"
            class="text-brand-navy min-h-11 text-sm font-semibold sm:pb-2.5"
            :data-test="`retention-summary-${key}`"
          >
            {{ durationLabel(key) }}
          </p>
        </div>
      </fieldset>

      <p
        v-if="validationError"
        role="alert"
        class="rounded-card border-status-error-border bg-status-error-surface text-status-error border px-4 py-3 text-sm font-semibold"
        data-test="retention-validation"
      >
        {{ validationError }}
      </p>

      <div role="status" aria-live="polite">
        <p
          v-if="store.successMessage"
          class="rounded-card border-status-success-border bg-status-success-surface text-status-success border px-4 py-3 text-sm font-semibold"
          data-test="retention-saved"
        >
          {{ store.successMessage }}
        </p>
      </div>

      <p
        v-if="store.error"
        role="alert"
        class="rounded-card border-status-error-border bg-status-error-surface text-status-error border px-4 py-3 text-sm font-semibold"
        data-test="retention-save-error"
      >
        {{ store.error }} Isian Anda masih ada di formulir.
      </p>

      <div class="border-border flex flex-wrap items-center justify-end gap-3 border-t pt-3">
        <BaseButton
          variant="secondary"
          size="md"
          class="min-h-11"
          :disabled="!isDirty || store.isSaving"
          data-test="retention-discard"
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
          data-test="retention-save"
        >
          {{ store.isSaving ? 'Menyimpan…' : 'Simpan perubahan' }}
        </BaseButton>
      </div>
    </form>
  </div>
</template>
