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

// Raw JSON fallback for generic/custom blocks
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
  }

  return errors;
});

const fieldOrder = ['title', 'body', 'metadata', 'rtCount', 'kecamatan', 'kota'];

const errorEntries = computed(() =>
  fieldOrder
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
    metadata = {
      ...props.block.metadata,
      rtCount: Number(profilRtCount.value),
      kecamatan: profilKecamatan.value.trim(),
      kota: profilKota.value.trim(),
      landscape: profilLandscape.value.trim(),
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
