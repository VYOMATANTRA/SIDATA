<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { onBeforeRouteLeave, useRoute } from 'vue-router';
import BaseButton from '../components/common/BaseButton.vue';
import BaseModal from '../components/common/BaseModal.vue';
import AuditRetentionSection from '../components/admin/config/AuditRetentionSection.vue';
import ConfigSection from '../components/admin/config/ConfigSection.vue';
import PortalSettingsSection from '../components/admin/config/PortalSettingsSection.vue';
import WeatherConfigSection from '../components/admin/config/WeatherConfigSection.vue';

/**
 * Admin-only system configuration (SPEC §4, §7, §8): portal identity and contact, the starting
 * map view, the weather refresh interval and how long the system log is kept. The header title
 * and subtitle come from route meta (router/index.ts), so the section headings here start at
 * <h2>. Every section saves on its own; this page only protects unsaved edits when leaving.
 */

const route = useRoute();

const SECTIONS = [
  { id: 'identitas', label: 'Identitas dan kontak portal' },
  { id: 'peta', label: 'Tampilan awal peta' },
  { id: 'cuaca', label: 'Cuaca' },
  { id: 'retensi-log', label: 'Retensi log' },
] as const;

type SectionKey = 'identity' | 'map' | 'weather' | 'retention';

const dirty = reactive<Record<SectionKey, boolean>>({
  identity: false,
  map: false,
  weather: false,
  retention: false,
});

const anyDirty = computed(() => Object.values(dirty).some(Boolean));

function jumpTo(id: string): void {
  const heading = document.getElementById(`${id}-judul`);
  const section = document.getElementById(id);
  section?.scrollIntoView({ block: 'start' });
  heading?.focus({ preventScroll: true });
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!anyDirty.value) return;
  event.preventDefault();
  event.returnValue = '';
}

const leavePromptOpen = ref(false);
const stayButton = ref<HTMLButtonElement | null>(null);
let pendingLeave: ((allow: boolean) => void) | null = null;

onBeforeRouteLeave(() => {
  if (!anyDirty.value) return true;
  leavePromptOpen.value = true;
  void nextTick(() => stayButton.value?.focus());
  return new Promise<boolean>((resolve) => {
    pendingLeave?.(false);
    pendingLeave = resolve;
  });
});

function resolveLeave(allow: boolean): void {
  leavePromptOpen.value = false;
  pendingLeave?.(allow);
  pendingLeave = null;
}

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload);
  // Old bookmarks of the retention page arrive here with a section hash.
  const hash = route.hash.slice(1);
  if (SECTIONS.some((section) => section.id === hash)) {
    void nextTick(() => jumpTo(hash));
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload);
  pendingLeave?.(false);
  pendingLeave = null;
});
</script>

<template>
  <div class="space-y-8">
    <div class="space-y-4">
      <p class="text-text-muted max-w-3xl text-sm">
        Pengaturan di sini berlaku untuk seluruh situs dan hanya dapat diubah oleh Admin. Setiap
        bagian disimpan sendiri: perubahan di satu bagian tidak ikut tersimpan atau hilang saat Anda
        menyimpan bagian lain.
      </p>

      <nav aria-label="Bagian halaman ini">
        <ul class="flex flex-wrap gap-2">
          <li v-for="section in SECTIONS" :key="section.id">
            <button
              type="button"
              class="rounded-btn border-brand-navy text-brand-navy hover:bg-brand-navy hover:text-text-inverse focus-visible:outline-focus-ring min-h-11 border bg-white px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              :data-test="`jump-${section.id}`"
              @click="jumpTo(section.id)"
            >
              {{ section.label }}
            </button>
          </li>
        </ul>
      </nav>
    </div>

    <ConfigSection
      id="identitas"
      title="Identitas dan kontak portal"
      description="Nama situs, nama kelurahan, dan kontak yang tampil untuk pengunjung."
    >
      <PortalSettingsSection part="identity" @dirty-change="dirty.identity = $event" />
    </ConfigSection>

    <ConfigSection
      id="peta"
      title="Tampilan awal peta"
      description="Bagian peta yang pertama kali dilihat pengunjung."
    >
      <PortalSettingsSection part="map" @dirty-change="dirty.map = $event" />
    </ConfigSection>

    <ConfigSection
      id="cuaca"
      title="Cuaca"
      description="Prakiraan cuaca di beranda berasal dari BMKG."
    >
      <WeatherConfigSection @dirty-change="dirty.weather = $event" />
    </ConfigSection>

    <ConfigSection
      id="retensi-log"
      title="Retensi log"
      description="Berapa lama setiap jenis catatan di Log sistem disimpan sebelum boleh dihapus."
    >
      <AuditRetentionSection @dirty-change="dirty.retention = $event" />
    </ConfigSection>

    <BaseModal
      :open="leavePromptOpen"
      title="Perubahan belum disimpan"
      description="Ada perubahan di halaman ini yang belum disimpan."
      size="md"
      @close="resolveLeave(false)"
    >
      <div class="space-y-4" data-test="leave-prompt">
        <p class="text-brand-navy text-sm">Tinggalkan halaman ini tanpa menyimpan perubahan?</p>
        <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <BaseButton
            variant="secondary"
            size="md"
            class="min-h-11"
            data-test="leave-confirm"
            @click="resolveLeave(true)"
          >
            Tinggalkan tanpa menyimpan
          </BaseButton>
          <button
            ref="stayButton"
            type="button"
            class="bg-brand-navy hover:bg-brand-navy/90 focus-visible:outline-focus-ring rounded-btn min-h-11 px-5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
            data-test="leave-stay"
            @click="resolveLeave(false)"
          >
            Tetap di sini
          </button>
        </div>
      </div>
    </BaseModal>
  </div>
</template>
