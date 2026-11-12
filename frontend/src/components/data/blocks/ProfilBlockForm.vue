<script setup lang="ts">
import { computed, ref } from 'vue';
import FormField from '../../common/FormField.vue';
import BaseButton from '../../common/BaseButton.vue';
import { INPUT_CLASSES } from '../../../utils/formStyles';
import BlockFormShell from './BlockFormShell.vue';
import {
  BLOCK_FORM_DEFAULTS,
  titleBodyEntries,
  validateTitleBody,
  type BlockFormProps,
  type BlockSavePayload,
  type FormErrorEntry,
} from './blockFormShared';

/**
 * Tentang Kelurahan Manggar profile: regional figures, Lurah, boundaries and the SOTK roster.
 * Fields, validation and the saved payload are unchanged from the former all-in-one form.
 */
const props = withDefaults(defineProps<BlockFormProps>(), BLOCK_FORM_DEFAULTS);

const emit = defineEmits<{
  (e: 'submit', payload: BlockSavePayload): void;
  (e: 'cancel'): void;
  (e: 'reload'): void;
}>();

function fieldId(name: string): string {
  return `${props.idPrefix}-${name}`;
}

const title = ref(props.block.title ?? '');
const body = ref(props.block.body ?? '');
const submitted = ref(false);

const profilRtCount = ref(
  Number((props.block.metadata as Record<string, unknown> | null)?.rtCount ?? 100),
);
const profilKecamatan = ref(
  String((props.block.metadata as Record<string, unknown> | null)?.kecamatan ?? 'Balikpapan Timur'),
);
const profilKota = ref(
  String((props.block.metadata as Record<string, unknown> | null)?.kota ?? 'Kota Balikpapan'),
);
const profilLandscape = ref(
  String(
    (props.block.metadata as Record<string, unknown> | null)?.landscape ?? 'Pesisir & Dataran',
  ),
);

interface BatasDraft {
  arah: string;
  wilayah: string;
}

interface SotkDraft {
  role: string;
  officialName: string;
  duties: string;
}

const DEFAULT_BATAS: BatasDraft[] = [
  { arah: 'Sebelah Utara', wilayah: 'Kelurahan Karang Joang' },
  { arah: 'Sebelah Timur', wilayah: 'Kelurahan Manggar Baru' },
  { arah: 'Sebelah Selatan', wilayah: 'Selat Makassar' },
  { arah: 'Sebelah Barat', wilayah: 'Kelurahan Sepinggan dan Sepinggan Baru' },
];

function readBatasWilayah(meta: Record<string, unknown> | null): BatasDraft[] {
  const raw = meta?.batasWilayah;
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_BATAS.map((b) => ({ ...b }));
  return raw.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      arah: String(row.arah ?? ''),
      wilayah: String(row.wilayah ?? ''),
    };
  });
}

function readSotkMembers(meta: Record<string, unknown> | null): SotkDraft[] {
  const raw = meta?.sotkMembers;
  const initialLurah = meta?.lurahName ? String(meta.lurahName).trim() : '';
  if (!Array.isArray(raw)) {
    return [
      { role: 'Lurah', officialName: initialLurah, duties: '' },
      { role: 'Sekretaris Lurah', officialName: '', duties: '' },
      { role: 'Kasi Trantib L-H', officialName: '', duties: '' },
      { role: 'Kasi Pemerintahan dan Pelayanan Publik', officialName: '', duties: '' },
      { role: 'Kasi Pemberdayaan Masyarakat', officialName: '', duties: '' },
    ];
  }
  const members = raw.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      role: String(row.role ?? ''),
      officialName: row.officialName == null ? '' : String(row.officialName),
      duties: row.duties == null ? '' : String(row.duties),
    };
  });
  const lurahRow = members.find((m) => m.role.trim().toLowerCase() === 'lurah');
  if (lurahRow && !lurahRow.officialName && initialLurah) {
    lurahRow.officialName = initialLurah;
  }
  return members;
}

const metaRecord = props.block.metadata as Record<string, unknown> | null;
const profilBatas = ref<BatasDraft[]>(readBatasWilayah(metaRecord));
const profilSotk = ref<SotkDraft[]>(readSotkMembers(metaRecord));

// Single source of truth: Lurah name is a two-way computed lens directly on the SOTK Lurah row
const profilLurahName = computed({
  get: () => {
    const lurah = profilSotk.value.find((m) => m.role.trim().toLowerCase() === 'lurah');
    return lurah ? lurah.officialName : '';
  },
  set: (value: string) => {
    const lurah = profilSotk.value.find((m) => m.role.trim().toLowerCase() === 'lurah');
    if (lurah) {
      lurah.officialName = value;
    } else if (value.trim()) {
      profilSotk.value = [{ role: 'Lurah', officialName: value, duties: '' }, ...profilSotk.value];
    }
  },
});

const profilLurahTitle = ref(String(metaRecord?.lurahTitle ?? 'Lurah Kelurahan Manggar'));

function addBatasRow(): void {
  if (profilBatas.value.length >= 10) return;
  profilBatas.value = [...profilBatas.value, { arah: '', wilayah: '' }];
}

function removeBatasRow(index: number): void {
  profilBatas.value = profilBatas.value.filter((_, i) => i !== index);
}

function addSotkRow(): void {
  if (profilSotk.value.length >= 30) return;
  profilSotk.value = [...profilSotk.value, { role: '', officialName: '', duties: '' }];
}

function removeSotkRow(index: number): void {
  profilSotk.value = profilSotk.value.filter((_, i) => i !== index);
}
const titleBodyErrors = computed(() => validateTitleBody(title.value, body.value));

const fieldErrors = computed<Record<string, string | undefined>>(() => {
  const errors: Record<string, string | undefined> = {};
  if (
    profilRtCount.value === null ||
    profilRtCount.value === undefined ||
    Number.isNaN(Number(profilRtCount.value)) ||
    Number(profilRtCount.value) < 1 ||
    Number(profilRtCount.value) > 1000 ||
    !Number.isInteger(Number(profilRtCount.value))
  ) {
    errors.rtCount = 'Jumlah RT harus berupa bilangan bulat antara 1 dan 1000.';
  }
  if (!profilKecamatan.value.trim()) {
    errors.kecamatan = 'Kecamatan tidak boleh kosong.';
  }
  if (!profilKota.value.trim()) {
    errors.kota = 'Kota tidak boleh kosong.';
  }
  if (profilLurahName.value.length > 150) {
    errors.lurahName = 'Nama lurah maksimal 150 karakter.';
  }
  if (profilLurahTitle.value.length > 150) {
    errors.lurahTitle = 'Gelar/jabatan lurah maksimal 150 karakter.';
  }
  if (profilBatas.value.length === 0) {
    errors.batasWilayah = 'Minimal satu batas wilayah wajib diisi.';
  }
  profilBatas.value.forEach((row, index) => {
    if (!row.arah.trim()) {
      errors[`batas-arah-${index}`] = 'Arah batas wilayah wajib diisi.';
    } else if (row.arah.trim().length > 100) {
      errors[`batas-arah-${index}`] = 'Arah maksimal 100 karakter.';
    }
    if (!row.wilayah.trim()) {
      errors[`batas-wilayah-${index}`] = 'Nama wilayah batas wajib diisi.';
    } else if (row.wilayah.trim().length > 255) {
      errors[`batas-wilayah-${index}`] = 'Nama wilayah batas maksimal 255 karakter.';
    }
  });
  if (profilSotk.value.length === 0) {
    errors.sotkMembers = 'Minimal satu jabatan SOTK wajib diisi.';
  }
  profilSotk.value.forEach((row, index) => {
    if (!row.role.trim()) {
      errors[`sotk-role-${index}`] = 'Jabatan SOTK wajib diisi.';
    } else if (row.role.trim().length > 100) {
      errors[`sotk-role-${index}`] = 'Jabatan SOTK maksimal 100 karakter.';
    }
    if (row.officialName.trim().length > 150) {
      errors[`sotk-name-${index}`] = 'Nama pejabat maksimal 150 karakter.';
    }
    if (row.duties.trim().length > 1000) {
      errors[`sotk-duties-${index}`] = 'Tugas pejabat maksimal 1000 karakter.';
    }
  });
  return errors;
});

const fieldOrder = computed(() => [
  'rtCount',
  'kecamatan',
  'kota',
  'lurahName',
  'lurahTitle',
  'batasWilayah',
  'sotkMembers',
  ...profilBatas.value.flatMap((_, i) => [`batas-arah-${i}`, `batas-wilayah-${i}`]),
  ...profilSotk.value.flatMap((_, i) => [`sotk-role-${i}`, `sotk-name-${i}`, `sotk-duties-${i}`]),
]);

const errorEntries = computed<FormErrorEntry[]>(() => [
  ...titleBodyEntries(props.idPrefix, titleBodyErrors.value),
  ...fieldOrder.value
    .map((name) => ({ fieldId: fieldId(name), message: fieldErrors.value[name] }))
    .filter((entry): entry is FormErrorEntry => Boolean(entry.message)),
]);

function handleSubmit(): void {
  submitted.value = true;
  if (errorEntries.value.length > 0 || props.busy) return;

  const lurahTitle = profilLurahTitle.value.trim();
  const batasWilayah = profilBatas.value.map((row) => ({
    arah: row.arah.trim(),
    wilayah: row.wilayah.trim(),
  }));
  const sotkMembers = profilSotk.value.map((row) => ({
    role: row.role.trim(),
    officialName: row.officialName.trim() || null,
    duties: row.duties.trim() || null,
  }));
  const lurahRow = sotkMembers.find((m) => m.role.trim().toLowerCase() === 'lurah');
  const resolvedLurahName = (lurahRow?.officialName ?? '').trim();

  const metadata: Record<string, unknown> = {
    ...props.block.metadata,
    rtCount: Number(profilRtCount.value),
    kecamatan: profilKecamatan.value.trim(),
    kota: profilKota.value.trim(),
    landscape: profilLandscape.value.trim(),
    lurahName: resolvedLurahName || undefined,
    lurahTitle: lurahTitle || undefined,
    batasWilayah,
    sotkMembers,
  };

  emit('submit', {
    title: title.value.trim() || null,
    body: body.value.trim(),
    metadata,
  });
}
</script>

<template>
  <BlockFormShell
    v-model:title="title"
    v-model:body="body"
    :id-prefix="idPrefix"
    :busy="busy"
    :server-error="serverError"
    :submitted="submitted"
    :errors="errorEntries"
    :title-error="titleBodyErrors.title"
    :body-error="titleBodyErrors.body"
    :placement="placement"
    :shown-on-site="shownOnSite"
    :stale="stale"
    @submit="handleSubmit"
    @cancel="emit('cancel')"
    @reload="emit('reload')"
  >
    <!-- Profil Metadata -->
    <fieldset class="rounded-card border-border bg-surface-muted space-y-4 border p-4">
      <legend class="text-brand-navy px-1 text-sm font-semibold">Rincian Wilayah Kelurahan</legend>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          :id="fieldId('rt-count')"
          label="Jumlah Rukun Tetangga (RT)"
          v-slot="{ describedBy }"
        >
          <input
            :id="fieldId('rt-count')"
            v-model.number="profilRtCount"
            type="number"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
          />
        </FormField>

        <FormField
          :id="fieldId('landscape')"
          label="Karakteristik Wilayah"
          v-slot="{ describedBy }"
        >
          <input
            :id="fieldId('landscape')"
            v-model="profilLandscape"
            type="text"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
          />
        </FormField>

        <FormField :id="fieldId('kecamatan')" label="Kecamatan" v-slot="{ describedBy }">
          <input
            :id="fieldId('kecamatan')"
            v-model="profilKecamatan"
            type="text"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
          />
        </FormField>

        <FormField :id="fieldId('kota')" label="Kota / Kabupaten" v-slot="{ describedBy }">
          <input
            :id="fieldId('kota')"
            v-model="profilKota"
            type="text"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
          />
        </FormField>
      </div>
    </fieldset>

    <!-- Lurah -->
    <fieldset class="rounded-card border-border bg-surface-muted space-y-4 border p-4">
      <legend class="text-brand-navy px-1 text-sm font-semibold">Pimpinan (Lurah)</legend>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          :id="fieldId('lurahName')"
          label="Nama Lurah"
          :error="submitted ? fieldErrors.lurahName : undefined"
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="fieldId('lurahName')"
            v-model="profilLurahName"
            type="text"
            placeholder="Nama pejabat belum tersedia"
            maxlength="150"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
          />
        </FormField>
        <FormField
          :id="fieldId('lurahTitle')"
          label="Jabatan / Gelar Tampil"
          hint="Contoh: Lurah Kelurahan Manggar"
          :error="submitted ? fieldErrors.lurahTitle : undefined"
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="fieldId('lurahTitle')"
            v-model="profilLurahTitle"
            type="text"
            maxlength="150"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
          />
        </FormField>
      </div>
    </fieldset>

    <!-- Batas Wilayah -->
    <fieldset class="rounded-card border-border bg-surface-muted space-y-4 border p-4">
      <legend class="text-brand-navy px-1 text-sm font-semibold">Batas Wilayah</legend>
      <p v-if="submitted && fieldErrors.batasWilayah" class="text-status-error text-sm">
        {{ fieldErrors.batasWilayah }}
      </p>
      <div
        v-for="(row, index) in profilBatas"
        :key="index"
        class="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]"
      >
        <FormField
          :id="fieldId(`batas-arah-${index}`)"
          label="Arah"
          :error="submitted ? fieldErrors[`batas-arah-${index}`] : undefined"
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="fieldId(`batas-arah-${index}`)"
            v-model="row.arah"
            type="text"
            maxlength="100"
            :class="INPUT_CLASSES"
            :aria-label="`Arah batas ${index + 1}`"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
          />
        </FormField>
        <FormField
          :id="fieldId(`batas-wilayah-${index}`)"
          label="Wilayah tetangga"
          :error="submitted ? fieldErrors[`batas-wilayah-${index}`] : undefined"
          v-slot="{ describedBy, invalid }"
        >
          <input
            :id="fieldId(`batas-wilayah-${index}`)"
            v-model="row.wilayah"
            type="text"
            maxlength="255"
            :class="INPUT_CLASSES"
            :aria-label="`Wilayah batas ${index + 1}`"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
          />
        </FormField>
        <div class="flex items-end pb-1">
          <BaseButton
            type="button"
            variant="secondary"
            size="sm"
            :disabled="busy || profilBatas.length <= 1"
            @click="removeBatasRow(index)"
          >
            Hapus
          </BaseButton>
        </div>
      </div>
      <BaseButton
        type="button"
        variant="secondary"
        size="sm"
        :disabled="busy || profilBatas.length >= 10"
        @click="addBatasRow"
      >
        Tambah batas
      </BaseButton>
    </fieldset>

    <!-- SOTK -->
    <fieldset class="rounded-card border-border bg-surface-muted space-y-4 border p-4">
      <legend class="text-brand-navy px-1 text-sm font-semibold">Struktur Organisasi (SOTK)</legend>
      <p v-if="submitted && fieldErrors.sotkMembers" class="text-status-error text-sm">
        {{ fieldErrors.sotkMembers }}
      </p>
      <div
        v-for="(row, index) in profilSotk"
        :key="index"
        class="rounded-btn border-border bg-surface space-y-3 border p-3"
      >
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField
            :id="fieldId(`sotk-role-${index}`)"
            label="Jabatan"
            :error="submitted ? fieldErrors[`sotk-role-${index}`] : undefined"
            v-slot="{ describedBy, invalid }"
          >
            <input
              :id="fieldId(`sotk-role-${index}`)"
              v-model="row.role"
              type="text"
              maxlength="100"
              :class="INPUT_CLASSES"
              :aria-describedby="describedBy"
              :aria-invalid="invalid ? 'true' : undefined"
            />
          </FormField>
          <FormField
            :id="fieldId(`sotk-name-${index}`)"
            label="Nama pejabat"
            :error="submitted ? fieldErrors[`sotk-name-${index}`] : undefined"
            v-slot="{ describedBy, invalid }"
          >
            <input
              :id="fieldId(`sotk-name-${index}`)"
              v-model="row.officialName"
              type="text"
              placeholder="Nama pejabat belum tersedia"
              maxlength="150"
              :class="INPUT_CLASSES"
              :aria-describedby="describedBy"
              :aria-invalid="invalid ? 'true' : undefined"
            />
          </FormField>
        </div>
        <FormField
          :id="fieldId(`sotk-duties-${index}`)"
          label="Tugas (opsional)"
          :error="submitted ? fieldErrors[`sotk-duties-${index}`] : undefined"
          v-slot="{ describedBy, invalid }"
        >
          <textarea
            :id="fieldId(`sotk-duties-${index}`)"
            v-model="row.duties"
            rows="2"
            maxlength="1000"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
          ></textarea>
        </FormField>
        <div class="flex justify-end">
          <BaseButton
            type="button"
            variant="secondary"
            size="sm"
            :disabled="busy || profilSotk.length <= 1"
            @click="removeSotkRow(index)"
          >
            Hapus jabatan
          </BaseButton>
        </div>
      </div>
      <BaseButton
        type="button"
        variant="secondary"
        size="sm"
        :disabled="busy || profilSotk.length >= 30"
        @click="addSotkRow"
      >
        Tambah jabatan
      </BaseButton>
    </fieldset>
  </BlockFormShell>
</template>
