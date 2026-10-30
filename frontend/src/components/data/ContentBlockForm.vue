<script setup lang="ts">
import { ref, computed } from 'vue';
import FormField from '../common/FormField.vue';
import FormErrorSummary from '../common/FormErrorSummary.vue';
import BaseButton from '../common/BaseButton.vue';
import type { ContentBlock } from '../../stores/contentBlocks.store';
import { INPUT_CLASSES } from '../../utils/formStyles';

export interface ContentBlockFormProps {
  block: ContentBlock;
  busy?: boolean;
  serverError?: string;
  idPrefix?: string;
}

const props = withDefaults(defineProps<ContentBlockFormProps>(), {
  busy: false,
  serverError: '',
  idPrefix: 'block',
});

const emit = defineEmits<{
  (
    e: 'submit',
    payload: { title: string | null; body: string; metadata: Record<string, unknown> | null },
  ): void;
  (e: 'cancel'): void;
}>();

function fieldId(name: string): string {
  return `${props.idPrefix}-${name}`;
}

const title = ref(props.block.title ?? '');
const body = ref(props.block.body ?? '');
const submitted = ref(false);

// Specialized draft metadata state
const isHero = computed(() => props.block.slug === 'landing-hero');
const isSambutan = computed(() => props.block.slug === 'landing-sambutan-lurah');
const isProfil = computed(() => props.block.slug === 'tentang-kelurahan-profil');

const heroBadge = ref(
  String((props.block.metadata as Record<string, unknown> | null)?.badge ?? ''),
);
const heroCtaText = ref(
  String((props.block.metadata as Record<string, unknown> | null)?.ctaText ?? ''),
);
const heroCtaLink = ref(
  String((props.block.metadata as Record<string, unknown> | null)?.ctaLink ?? ''),
);

const authorName = ref(
  String((props.block.metadata as Record<string, unknown> | null)?.authorName ?? ''),
);
const authorTitle = ref(
  String((props.block.metadata as Record<string, unknown> | null)?.authorTitle ?? ''),
);
const authorPhotoUrl = ref(
  String((props.block.metadata as Record<string, unknown> | null)?.photoUrl ?? ''),
);

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
  if (!Array.isArray(raw) || raw.length === 0) {
    return [
      { role: 'Lurah', officialName: 'Munir Achmad, S.E.', duties: '' },
      { role: 'Sekretaris Lurah', officialName: 'Munjiah Puspitawaty. M, S.E', duties: '' },
      { role: 'Kasi Trantib L-H', officialName: 'Nanang Sri Ruriyanto, S.Sos.', duties: '' },
      {
        role: 'Kasi Pemerintahan dan Pelayanan Publik',
        officialName: 'Hasiba, S.A.P',
        duties: '',
      },
      { role: 'Kasi Pemberdayaan Masyarakat', officialName: 'Marthen Solly, S.ST', duties: '' },
    ];
  }
  return raw.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      role: String(row.role ?? ''),
      officialName: row.officialName == null ? '' : String(row.officialName),
      duties: row.duties == null ? '' : String(row.duties),
    };
  });
}

const metaRecord = props.block.metadata as Record<string, unknown> | null;
const profilBatas = ref<BatasDraft[]>(readBatasWilayah(metaRecord));
const profilSotk = ref<SotkDraft[]>(readSotkMembers(metaRecord));
const profilLurahName = ref(
  String(
    metaRecord?.lurahName ??
      profilSotk.value.find((m) => m.role === 'Lurah')?.officialName ??
      '',
  ),
);
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

// Raw JSON fallback for generic/custom blocks (not used for profile — dedicated fields instead)
const rawMetadataJson = ref(
  props.block.metadata ? JSON.stringify(props.block.metadata, null, 2) : '',
);

const fieldErrors = computed<Record<string, string | undefined>>(() => {
  const errors: Record<string, string | undefined> = {};

  if (!body.value.trim()) {
    errors.body = 'Isi konten wajib diisi dan tidak boleh hanya berupa spasi.';
  } else if (body.value.length > 50000) {
    errors.body = 'Isi konten maksimal 50.000 karakter.';
  }

  if (title.value && title.value.length > 255) {
    errors.title = 'Judul maksimal 255 karakter.';
  }

  if (!isHero.value && !isSambutan.value && !isProfil.value && rawMetadataJson.value.trim()) {
    try {
      JSON.parse(rawMetadataJson.value);
    } catch {
      errors.metadata = 'Format JSON metadata tidak valid.';
    }
  }

  if (isProfil.value) {
    if (
      profilRtCount.value === null ||
      profilRtCount.value === undefined ||
      Number.isNaN(Number(profilRtCount.value)) ||
      Number(profilRtCount.value) < 1 ||
      !Number.isInteger(Number(profilRtCount.value))
    ) {
      errors.rtCount = 'Jumlah RT harus berupa bilangan bulat positif (minimal 1).';
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
  }

  return errors;
});

const fieldOrder = computed(() => [
  'title',
  'body',
  'metadata',
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

const errorEntries = computed(() =>
  fieldOrder.value
    .map((name) => ({ fieldId: fieldId(name), message: fieldErrors.value[name] }))
    .filter((entry): entry is { fieldId: string; message: string } => Boolean(entry.message)),
);

const summaryErrors = computed(() => (submitted.value ? errorEntries.value : []));

function handleSubmit(): void {
  submitted.value = true;
  if (errorEntries.value.length > 0 || props.busy) return;

  let metadata: Record<string, unknown> | null = null;

  if (isHero.value) {
    metadata = {
      ...props.block.metadata,
      badge: heroBadge.value.trim() || undefined,
      ctaText: heroCtaText.value.trim() || undefined,
      ctaLink: heroCtaLink.value.trim() || undefined,
    };
  } else if (isSambutan.value) {
    metadata = {
      ...props.block.metadata,
      authorName: authorName.value.trim() || undefined,
      authorTitle: authorTitle.value.trim() || undefined,
      photoUrl: authorPhotoUrl.value.trim() || undefined,
    };
  } else if (isProfil.value) {
    const lurahName = profilLurahName.value.trim();
    const lurahTitle = profilLurahTitle.value.trim();
    const batasWilayah = profilBatas.value.map((row) => ({
      arah: row.arah.trim(),
      wilayah: row.wilayah.trim(),
    }));
    let sotkMembers = profilSotk.value.map((row) => ({
      role: row.role.trim(),
      officialName: row.officialName.trim() || null,
      duties: row.duties.trim() || null,
    }));
    // Keep the dedicated Lurah fields and the SOTK Lurah row in sync for the public page.
    const lurahIdx = sotkMembers.findIndex((m) => m.role === 'Lurah');
    if (lurahIdx >= 0) {
      sotkMembers = sotkMembers.map((m, i) =>
        i === lurahIdx ? { ...m, officialName: lurahName || m.officialName } : m,
      );
    } else if (lurahName) {
      sotkMembers = [
        { role: 'Lurah', officialName: lurahName, duties: null },
        ...sotkMembers,
      ];
    }
    metadata = {
      ...props.block.metadata,
      rtCount: Number(profilRtCount.value),
      kecamatan: profilKecamatan.value.trim(),
      kota: profilKota.value.trim(),
      landscape: profilLandscape.value.trim(),
      lurahName: lurahName || undefined,
      lurahTitle: lurahTitle || undefined,
      batasWilayah,
      sotkMembers,
    };
  } else if (rawMetadataJson.value.trim()) {
    try {
      metadata = JSON.parse(rawMetadataJson.value) as Record<string, unknown>;
    } catch {
      return;
    }
  }

  emit('submit', {
    title: title.value.trim() || null,
    body: body.value.trim(),
    metadata,
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

    <FormField
      :id="fieldId('title')"
      label="Judul Blok"
      hint="Judul utama yang ditampilkan di atas konten (opsional)."
      :error="submitted ? fieldErrors.title : undefined"
      v-slot="{ describedBy, invalid }"
    >
      <input
        :id="fieldId('title')"
        v-model="title"
        type="text"
        :class="INPUT_CLASSES"
        :aria-describedby="describedBy"
        :aria-invalid="invalid ? 'true' : undefined"
      />
    </FormField>

    <FormField
      :id="fieldId('body')"
      label="Isi Konten"
      hint="Narasi atau paragraf utama untuk blok konten ini."
      :error="submitted ? fieldErrors.body : undefined"
      required
      v-slot="{ describedBy, invalid }"
    >
      <textarea
        :id="fieldId('body')"
        v-model="body"
        rows="5"
        :class="INPUT_CLASSES"
        :aria-describedby="describedBy"
        :aria-invalid="invalid ? 'true' : undefined"
        required
      ></textarea>
    </FormField>

    <!-- Hero Metadata -->
    <fieldset v-if="isHero" class="rounded-card space-y-4 border border-slate-200 bg-slate-50 p-4">
      <legend class="px-1 text-xs font-semibold tracking-wider text-slate-700 uppercase">
        Pengaturan Hero
      </legend>

      <FormField
        :id="fieldId('hero-badge')"
        label="Teks Badge"
        hint="Teks lencana di atas judul"
        v-slot="{ describedBy }"
      >
        <input
          :id="fieldId('hero-badge')"
          v-model="heroBadge"
          type="text"
          :class="INPUT_CLASSES"
          :aria-describedby="describedBy"
        />
      </FormField>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField :id="fieldId('hero-cta-text')" label="Teks Tombol CTA" v-slot="{ describedBy }">
          <input
            :id="fieldId('hero-cta-text')"
            v-model="heroCtaText"
            type="text"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
          />
        </FormField>

        <FormField
          :id="fieldId('hero-cta-link')"
          label="Tautan CTA"
          hint="Contoh: #potensi atau /peta"
          v-slot="{ describedBy }"
        >
          <input
            :id="fieldId('hero-cta-link')"
            v-model="heroCtaLink"
            type="text"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
          />
        </FormField>
      </div>
    </fieldset>

    <!-- Sambutan Lurah Metadata -->
    <fieldset
      v-if="isSambutan"
      class="rounded-card space-y-4 border border-slate-200 bg-slate-50 p-4"
    >
      <legend class="px-1 text-xs font-semibold tracking-wider text-slate-700 uppercase">
        Informasi Pimpinan
      </legend>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField :id="fieldId('author-name')" label="Nama Pimpinan" v-slot="{ describedBy }">
          <input
            :id="fieldId('author-name')"
            v-model="authorName"
            type="text"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
          />
        </FormField>

        <FormField :id="fieldId('author-title')" label="Jabatan Resmi" v-slot="{ describedBy }">
          <input
            :id="fieldId('author-title')"
            v-model="authorTitle"
            type="text"
            :class="INPUT_CLASSES"
            :aria-describedby="describedBy"
          />
        </FormField>
      </div>

      <FormField
        :id="fieldId('author-photo')"
        label="URL Foto Pimpinan (Opsional)"
        v-slot="{ describedBy }"
      >
        <input
          :id="fieldId('author-photo')"
          v-model="authorPhotoUrl"
          type="text"
          :class="INPUT_CLASSES"
          :aria-describedby="describedBy"
        />
      </FormField>
    </fieldset>

    <!-- Profil Metadata -->
    <fieldset
      v-if="isProfil"
      class="rounded-card space-y-4 border border-slate-200 bg-slate-50 p-4"
    >
      <legend class="px-1 text-xs font-semibold tracking-wider text-slate-700 uppercase">
        Rincian Wilayah Kelurahan
      </legend>

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
    <fieldset
      v-if="isProfil"
      class="rounded-card space-y-4 border border-slate-200 bg-slate-50 p-4"
    >
      <legend class="px-1 text-xs font-semibold tracking-wider text-slate-700 uppercase">
        Pimpinan (Lurah)
      </legend>
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
    <fieldset
      v-if="isProfil"
      class="rounded-card space-y-4 border border-slate-200 bg-slate-50 p-4"
    >
      <legend class="px-1 text-xs font-semibold tracking-wider text-slate-700 uppercase">
        Batas Wilayah
      </legend>
      <p v-if="submitted && fieldErrors.batasWilayah" class="text-sm text-red-700">
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
    <fieldset
      v-if="isProfil"
      class="rounded-card space-y-4 border border-slate-200 bg-slate-50 p-4"
    >
      <legend class="px-1 text-xs font-semibold tracking-wider text-slate-700 uppercase">
        Struktur Organisasi (SOTK)
      </legend>
      <p v-if="submitted && fieldErrors.sotkMembers" class="text-sm text-red-700">
        {{ fieldErrors.sotkMembers }}
      </p>
      <div
        v-for="(row, index) in profilSotk"
        :key="index"
        class="space-y-3 rounded-md border border-slate-200 bg-white p-3"
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

    <!-- Generic Metadata JSON Editor -->
    <FormField
      v-if="!isHero && !isSambutan && !isProfil && rawMetadataJson"
      :id="fieldId('metadata')"
      label="Metadata Tambahan (JSON)"
      hint="Format objek JSON valid untuk atribut khusus blok ini."
      :error="submitted ? fieldErrors.metadata : undefined"
      v-slot="{ describedBy, invalid }"
    >
      <textarea
        :id="fieldId('metadata')"
        v-model="rawMetadataJson"
        rows="6"
        class="font-mono text-xs"
        :class="INPUT_CLASSES"
        :aria-describedby="describedBy"
        :aria-invalid="invalid ? 'true' : undefined"
      ></textarea>
    </FormField>

    <div class="flex items-center justify-end gap-3 border-t border-slate-200 pt-3">
      <BaseButton variant="secondary" size="md" :disabled="busy" @click="emit('cancel')">
        Batal
      </BaseButton>
      <BaseButton type="submit" variant="primary" size="md" :disabled="busy">
        {{ busy ? 'Menyimpan…' : 'Simpan Perubahan' }}
      </BaseButton>
    </div>
  </form>
</template>
