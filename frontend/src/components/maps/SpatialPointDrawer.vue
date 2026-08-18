<script setup lang="ts">
import { computed } from 'vue';
import type { SpatialPointDTO, RtLeaderDTO } from '../../types/maps';
import BaseButton from '../common/BaseButton.vue';

interface Props {
  point: SpatialPointDTO | null;
  leader?: RtLeaderDTO | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const typeBadge = computed(() => {
  if (!props.point) return { label: '', class: '' };
  switch (props.point.type) {
    case 'ketua_rt':
      return {
        label: 'Pos / Ketua RT',
        class: 'bg-brand-ubi-ungu/10 text-brand-ubi-ungu border-brand-ubi-ungu/30',
      };
    case 'bank_sampah':
      return {
        label: 'Bank Sampah Unit',
        class: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    case 'fasilitas_umum':
      return { label: 'Fasilitas Umum', class: 'bg-purple-50 text-purple-700 border-purple-200' };
    default:
      return { label: props.point.type, class: 'bg-slate-100 text-slate-700 border-slate-200' };
  }
});

const whatsappUrl = computed(() => {
  const phone = props.leader?.phone || props.point?.rtLeader?.phone;
  if (!phone) return '';
  // Normalize Indonesian mobile number: e.g. 08123456789 -> 628123456789
  const cleaned = phone.replace(/\D/g, '');
  const formatted = cleaned.startsWith('0') ? `62${cleaned.slice(1)}` : cleaned;
  const rtNum = props.leader?.rtNumber || props.point?.rts[0] || '';
  const text = encodeURIComponent(
    `Halo Bapak/Ibu Ketua RT ${rtNum} Kelurahan Manggar, saya ingin bertanya terkait data/layanan wilayah.`,
  );
  return `https://wa.me/${formatted}?text=${text}`;
});

const phoneTelUrl = computed(() => {
  const phone = props.leader?.phone || props.point?.rtLeader?.phone;
  return phone ? `tel:${phone}` : '';
});

const isWhatsapp = computed(() => {
  if (props.leader) return props.leader.phoneIsWhatsapp;
  if (props.point?.rtLeader) return props.point.rtLeader.phoneIsWhatsapp;
  return true;
});

const metadataEntries = computed(() => {
  if (!props.point?.metadata) return [];
  return Object.entries(props.point.metadata).filter(
    ([, val]) => val !== null && val !== undefined && val !== '',
  );
});
</script>

<template>
  <div
    v-if="point"
    class="w-full max-w-lg rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-xl backdrop-blur-md transition-all duration-300"
  >
    <!-- Header: Type Badge & Close Button -->
    <div class="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
      <span
        class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold"
        :class="typeBadge.class"
      >
        {{ typeBadge.label }}
      </span>

      <button
        type="button"
        class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-slate-100 text-sm text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800"
        aria-label="Tutup"
        @click="emit('close')"
      >
        ✕
      </button>
    </div>

    <!-- Title & Location -->
    <div class="mt-3">
      <h3 class="text-h3 text-brand-biru-hytam font-bold">
        {{ point.name }}
      </h3>
      <div class="mt-1 flex items-center gap-2 text-xs text-slate-500">
        <svg
          class="h-3.5 w-3.5 shrink-0 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
          />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        <span>Lat: {{ point.latitude.toFixed(6) }}, Lng: {{ point.longitude.toFixed(6) }}</span>
      </div>
    </div>

    <!-- RT Coverage Tags (Especially for multi-RT Bank Sampah) -->
    <div v-if="point.rts.length > 0" class="mt-3.5">
      <span class="text-h4 mb-1 block font-semibold tracking-wider text-slate-400 uppercase">
        Cakupan Wilayah:
      </span>
      <div class="flex flex-wrap gap-1.5">
        <span
          v-for="rtNum in point.rts"
          :key="rtNum"
          class="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
        >
          RT {{ rtNum < 10 ? `0${rtNum}` : rtNum }}
        </span>
      </div>
    </div>

    <!-- Special Ketua RT Card Details -->
    <div
      v-if="point.type === 'ketua_rt' && (leader || point.rtLeader)"
      class="mt-4 space-y-2 rounded-xl border border-slate-200/80 bg-slate-50 p-3.5"
    >
      <div class="flex items-center justify-between">
        <span class="text-brand-biru-hytam text-xs font-semibold tracking-wider uppercase">
          Kontak Ketua RT
        </span>
        <span class="text-xs font-medium text-slate-500">
          RT {{ leader?.rtNumber || point.rtLeader?.rtNumber }}
        </span>
      </div>

      <div class="text-sm font-semibold text-slate-900">
        {{ leader?.name || point.rtLeader?.name }}
      </div>

      <div v-if="leader?.alamat || point.rtLeader?.alamat" class="text-xs text-slate-600">
        {{ leader?.alamat || point.rtLeader?.alamat }}
      </div>

      <div class="font-mono text-xs text-slate-700">
        {{ leader?.phone || point.rtLeader?.phone }}
      </div>

      <!-- Action Button: WhatsApp vs Phone Call -->
      <div class="pt-2">
        <BaseButton
          v-if="isWhatsapp"
          variant="primary"
          :with-icon="true"
          :href="whatsappUrl"
          target="_blank"
          class="w-full border-transparent bg-[#25D366] text-white hover:bg-[#20bd5a]"
        >
          <template #icon>
            <!-- WhatsApp SVG Icon -->
            <svg class="h-4 w-4 fill-current" viewBox="0 0 24 24">
              <path
                d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"
              />
            </svg>
          </template>
          Chat WhatsApp
        </BaseButton>

        <BaseButton
          v-else
          variant="primary"
          :with-icon="true"
          :href="phoneTelUrl"
          class="bg-brand-biru-hytam w-full text-white"
        >
          <template #icon>
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
              />
            </svg>
          </template>
          Hubungi Telepon
        </BaseButton>
      </div>
    </div>

    <!-- Metadata Attributes -->
    <div
      v-if="metadataEntries.length > 0"
      class="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-xs"
    >
      <div
        v-for="[key, val] in metadataEntries"
        :key="key"
        class="flex items-start justify-between gap-2"
      >
        <span class="text-slate-500 capitalize">{{ key.replace(/_/g, ' ') }}:</span>
        <span class="text-right font-medium text-slate-800">{{ String(val) }}</span>
      </div>
    </div>
  </div>
</template>
