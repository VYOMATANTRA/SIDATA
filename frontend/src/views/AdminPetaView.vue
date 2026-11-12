<script setup lang="ts">
/**
 * `/admin/peta`: management of map points (SPEC §7, §8). Editors and Admins add, move, retitle
 * and delete Ketua RT, Bank Sampah and Fasilitas Umum points and choose which RTs each covers.
 *
 * Header title and subtitle live in route `meta` (router/index.ts), seeded by AdminLayout, so
 * this view's own headings start at <h2>.
 *
 * Boundaries kept on purpose:
 * - Ketua RT names, phones and addresses stay in `/admin/rukun-tetangga`; this screen only links
 *   there, and a point never carries a second contact field.
 * - The sample-roster flag is Admin-only and lives on the RT screen; nothing here changes it.
 * - After every write the shared maps store and the Ketua RT roster are reloaded, so the public
 *   map and the Ketua RT page show the change at once instead of after their cache expires.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import BaseButton from '../components/common/BaseButton.vue';
import BaseModal from '../components/common/BaseModal.vue';
import AdminPointList from '../components/admin/maps/AdminPointList.vue';
import PointEditorForm from '../components/admin/maps/PointEditorForm.vue';
import InteractiveMap from '../components/maps/InteractiveMap.vue';
import { useMediaQuery } from '../composables/useMediaQuery';
import { deletePoint } from '../services/adminMaps.service';
import { useMapsStore } from '../stores/maps';
import { useRtLeadersStore } from '../stores/rtLeaders.store';
import { useSettingsStore } from '../stores/settings.store';
import type { SpatialPointDTO, SpatialPointType } from '../types/maps';
import {
  POINT_TYPES,
  analyzeCoverage,
  formatRtList,
  matchesPointSearch,
  ownedRtNumber,
  typeLabel,
} from '../utils/adminMapPoints';
import { INPUT_CLASSES } from '../utils/formStyles';
import { classifyFailure, toUserMessage } from '../utils/userMessages';

/** Below this width the list and the map take turns instead of sitting side by side. */
const SPLIT_LAYOUT_QUERY = '(min-width: 1280px)';

const mapsStore = useMapsStore();
const rtStore = useRtLeadersStore();
const settingsStore = useSettingsStore();

const isSplit = useMediaQuery(SPLIT_LAYOUT_QUERY);
const narrowView = ref<'daftar' | 'peta'>('daftar');
const showMap = computed(() => isSplit.value || narrowView.value === 'peta');

const points = computed(() => mapsStore.points);
const analysis = computed(() => analyzeCoverage(points.value));
const issuePointIds = computed(() => new Set(analysis.value.issues.keys()));

const search = ref('');
const typeFilter = ref<SpatialPointType | 'all'>('all');
const onlyIssues = ref(false);

const typeOrder = new Map(POINT_TYPES.map((type, index) => [type, index]));

const sortedPoints = computed(() =>
  [...points.value].sort(
    (a, b) =>
      (typeOrder.get(a.type) ?? 99) - (typeOrder.get(b.type) ?? 99) ||
      (a.rts[0] ?? Number.POSITIVE_INFINITY) - (b.rts[0] ?? Number.POSITIVE_INFINITY) ||
      a.name.localeCompare(b.name, 'id'),
  ),
);

const filteredPoints = computed(() =>
  sortedPoints.value.filter(
    (point) =>
      (typeFilter.value === 'all' || point.type === typeFilter.value) &&
      (!onlyIssues.value || issuePointIds.value.has(point.id)) &&
      matchesPointSearch(point, search.value),
  ),
);

const hasActiveFilter = computed(
  () => search.value.trim() !== '' || typeFilter.value !== 'all' || onlyIssues.value,
);

const counts = computed(() => {
  const byType = { ketua_rt: 0, bank_sampah: 0, fasilitas_umum: 0 };
  for (const point of points.value) byType[point.type] += 1;
  return byType;
});

/** RTs (of 100) that already have a Ketua RT point. */
const rtWithPoint = computed(() => analysis.value.ketuaRtOwners.size);

const resultText = computed(() =>
  hasActiveFilter.value
    ? `Menampilkan ${filteredPoints.value.length} dari ${points.value.length} titik.`
    : `Menampilkan semua ${points.value.length} titik.`,
);

const selectedId = ref<string | null>(null);
const selectedPoint = computed(
  () => points.value.find((point) => point.id === selectedId.value) ?? null,
);
const selectedIssues = computed(() =>
  selectedPoint.value ? (analysis.value.issues.get(selectedPoint.value.id) ?? []) : [],
);

const mapCenter = computed<[number, number]>(() => [
  settingsStore.defaultCoordinates.lat,
  settingsStore.defaultCoordinates.lon,
]);
const mapZoom = computed(() => settingsStore.defaultCoordinates.zoom);

const map = ref<InstanceType<typeof InteractiveMap> | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);

const statusMessage = ref('');
const pageError = ref('');

function announce(message: string): void {
  // Clearing first makes an identical repeat message announce again.
  statusMessage.value = '';
  void nextTick(() => {
    statusMessage.value = message;
  });
}

async function refreshAll(): Promise<void> {
  await Promise.all([
    mapsStore.loadPoints(),
    mapsStore.loadSummary(),
    rtStore.fetchRtLeaders(true),
  ]);
}

onMounted(() => {
  void settingsStore.fetchPublicSettings().catch(() => undefined);
  void mapsStore.loadPoints();
});

// The "needs fixing" filter only makes sense while something needs fixing.
watch(
  () => issuePointIds.value.size,
  (size) => {
    if (size === 0) onlyIssues.value = false;
  },
);

// A point that vanished from the data (deleted elsewhere, filtered by a refresh) cannot stay selected.
watch(points, (list) => {
  if (selectedId.value && !list.some((point) => point.id === selectedId.value)) {
    selectedId.value = null;
  }
});

function selectPoint(point: SpatialPointDTO, reveal: boolean): void {
  selectedId.value = point.id;
  if (reveal) void nextTick(() => map.value?.revealPoint(point.id));
}

function onMapSelect(point: SpatialPointDTO): void {
  selectedId.value = point.id;
}

async function showOnMap(point: SpatialPointDTO): Promise<void> {
  selectedId.value = point.id;
  narrowView.value = 'peta';
  await nextTick();
  map.value?.invalidateSize();
  map.value?.revealPoint(point.id);
}

function setNarrowView(view: 'daftar' | 'peta'): void {
  narrowView.value = view;
  if (view === 'peta') {
    void nextTick(() => {
      map.value?.invalidateSize();
      if (selectedId.value) map.value?.revealPoint(selectedId.value);
    });
  }
}

function clearFilters(): void {
  search.value = '';
  typeFilter.value = 'all';
  onlyIssues.value = false;
}

// ---------------------------------------------------------------------------------------------
// Create / edit

const editorOpen = ref(false);
const editorBusy = ref(false);
const editorKey = ref(0);
const editing = ref<SpatialPointDTO | null>(null);
const discardPromptOpen = ref(false);
const editorForm = ref<InstanceType<typeof PointEditorForm> | null>(null);
const keepEditingButton = ref<HTMLButtonElement | null>(null);

function openCreate(): void {
  editing.value = null;
  editorKey.value += 1;
  editorOpen.value = true;
}

function openEdit(point: SpatialPointDTO): void {
  editing.value = point;
  editorKey.value += 1;
  editorOpen.value = true;
}

function closeEditor(): void {
  editorOpen.value = false;
  editorBusy.value = false;
  discardPromptOpen.value = false;
  editing.value = null;
}

// Cancel, Escape and the backdrop all land here. A save in flight is never interrupted, and a
// draft that differs from the saved point asks first.
function requestCloseEditor(): void {
  if (editorBusy.value) return;
  if (discardPromptOpen.value) {
    keepEditing();
    return;
  }
  if (editorForm.value?.isDirty()) {
    discardPromptOpen.value = true;
    void nextTick(() => keepEditingButton.value?.focus());
    return;
  }
  closeEditor();
}

function keepEditing(): void {
  discardPromptOpen.value = false;
}

async function handleSaved(point: SpatialPointDTO, created: boolean): Promise<void> {
  closeEditor();
  announce(
    created
      ? `Titik “${point.name}” ditambahkan.`
      : `Perubahan titik “${point.name}” disimpan.`,
  );
  pageError.value = '';
  await refreshAll();
  selectPoint(point, true);
}

function handleRefreshNeeded(): void {
  void refreshAll();
}

async function handleReload(): Promise<void> {
  const id = editing.value?.id;
  await refreshAll();
  const fresh = id ? points.value.find((point) => point.id === id) : undefined;
  if (fresh) {
    editing.value = fresh;
    editorKey.value += 1;
    return;
  }
  closeEditor();
  announce('Titik itu sudah dihapus oleh orang lain.');
}

// ---------------------------------------------------------------------------------------------
// Delete

const deleting = ref<SpatialPointDTO | null>(null);
const deleteBusy = ref(false);
const deleteError = ref('');

function openDelete(point: SpatialPointDTO): void {
  deleting.value = point;
  deleteError.value = '';
}

function closeDelete(): void {
  if (deleteBusy.value) return;
  deleting.value = null;
  deleteError.value = '';
}

const deleteExplanation = computed(() => {
  const point = deleting.value;
  if (!point) return '';
  if (point.type === 'ketua_rt') {
    return 'Titik rumah Ketua RT ini akan hilang dari peta. Nama dan telepon Ketua RT tidak ikut terhapus. Tindakan ini tidak bisa dibatalkan.';
  }
  return point.rts.length > 0
    ? `${formatRtList(point.rts)} tidak lagi terhubung ke titik ini. Tindakan ini tidak bisa dibatalkan.`
    : 'Tindakan ini tidak bisa dibatalkan.';
});

async function confirmDelete(): Promise<void> {
  const point = deleting.value;
  if (!point || deleteBusy.value) return;
  deleteBusy.value = true;
  deleteError.value = '';
  try {
    await deletePoint(point.id, ownedRtNumber(point));
    deleteBusy.value = false;
    deleting.value = null;
    if (selectedId.value === point.id) selectedId.value = null;
    pageError.value = '';
    announce(`Titik “${point.name}” dihapus.`);
    await refreshAll();
    await nextTick();
    searchInput.value?.focus();
  } catch (error) {
    deleteBusy.value = false;
    const { kind } = classifyFailure(error);
    if (kind === 'not_found') {
      // Someone else already removed it: the goal is met, so just bring the screen up to date.
      deleting.value = null;
      announce(`Titik “${point.name}” sudah tidak ada.`);
      await refreshAll();
    } else if (kind === 'stale') {
      // Ownership changed under us. The confirmation no longer describes the point, so close it,
      // reload, and let the editor open Hapus again from the fresh data.
      deleting.value = null;
      pageError.value = `Titik “${point.name}” baru saja diubah oleh orang lain, jadi belum dihapus. Periksa titik itu lagi, lalu hapus bila masih perlu.`;
      await refreshAll();
    } else {
      deleteError.value = toUserMessage(error, 'menghapus titik').message;
    }
  }
}

async function reloadAll(): Promise<void> {
  await refreshAll();
}
</script>

<template>
  <div class="space-y-6">
    <p role="status" aria-live="polite" class="sr-only" data-test="peta-status">
      {{ statusMessage }}
    </p>

    <section aria-labelledby="peta-intro-title" class="space-y-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0 space-y-1">
          <h2 id="peta-intro-title" class="text-brand-navy text-lg font-bold">Titik peta</h2>
          <p class="text-text-muted text-sm leading-snug">
            Tambah, pindahkan, atau hapus titik Ketua RT, Bank Sampah, dan Fasilitas Umum, lalu
            pilih RT yang dicakup.
          </p>
          <p class="text-text-muted text-sm leading-snug" data-test="peta-rt-link-note">
            Nama, telepon, dan alamat Ketua RT diubah di halaman
            <RouterLink
              to="/admin/rukun-tetangga"
              class="text-brand-navy focus-visible:outline-focus-ring rounded-xs font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
              data-test="peta-rt-link"
            >
              Rukun Tetangga
            </RouterLink>
            . Status “data contoh” daftar Ketua RT juga diatur di sana.
          </p>
        </div>
        <BaseButton
          variant="primary"
          size="md"
          class="min-h-11"
          data-test="peta-add"
          @click="openCreate"
        >
          Tambah titik
        </BaseButton>
      </div>

      <div
        v-if="mapsStore.error"
        role="alert"
        class="border-status-error-border bg-status-error-surface text-status-error flex flex-wrap items-center justify-between gap-3 rounded-card border px-4 py-3 text-sm"
        data-test="peta-load-error"
      >
        <p>{{ mapsStore.error }}</p>
        <BaseButton
          variant="secondary"
          size="md"
          class="min-h-11"
          :disabled="mapsStore.isLoading"
          data-test="peta-retry"
          @click="reloadAll"
        >
          Coba lagi
        </BaseButton>
      </div>

      <div
        v-if="pageError"
        role="alert"
        class="border-status-warning-border bg-status-warning-surface text-status-warning rounded-card border px-4 py-3 text-sm"
        data-test="peta-page-error"
      >
        {{ pageError }}
      </div>

      <p v-if="points.length > 0" class="text-brand-navy text-sm" data-test="peta-counts">
        {{ points.length }} titik: {{ counts.ketua_rt }} Ketua RT, {{ counts.bank_sampah }} Bank
        Sampah, {{ counts.fasilitas_umum }} Fasilitas Umum. {{ rtWithPoint }} dari 100 RT sudah
        punya titik Ketua RT.
      </p>

      <div
        v-if="issuePointIds.size > 0"
        class="border-status-warning-border bg-status-warning-surface text-status-warning rounded-card border px-4 py-3 text-sm"
        data-test="peta-issues"
      >
        <p class="font-semibold">{{ issuePointIds.size }} titik perlu diperbaiki</p>
        <p class="mt-1">
          Cakupan RT pada titik-titik ini bertentangan, dan keterangan cara memperbaikinya ada di
          tiap titik.
        </p>
        <label class="mt-2 flex min-h-11 items-center gap-2">
          <input
            v-model="onlyIssues"
            type="checkbox"
            class="border-border-strong text-brand-navy focus-visible:outline-focus-ring h-4 w-4 rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2"
            data-test="peta-only-issues"
          />
          Tampilkan hanya yang perlu diperbaiki
        </label>
      </div>
    </section>

    <section aria-labelledby="peta-filter-title" class="space-y-3">
      <h2 id="peta-filter-title" class="sr-only">Cari dan saring titik</h2>
      <div class="flex flex-wrap items-end gap-3">
        <div class="w-full sm:w-72">
          <label for="peta-search" class="text-text-muted block text-sm font-medium">
            Cari nama titik atau nomor RT
          </label>
          <input
            id="peta-search"
            ref="searchInput"
            v-model="search"
            type="search"
            autocomplete="off"
            :class="INPUT_CLASSES"
            class="mt-1.5"
            data-test="peta-search"
          />
        </div>
        <div class="w-full sm:w-56">
          <label for="peta-type-filter" class="text-text-muted block text-sm font-medium">
            Jenis titik
          </label>
          <select
            id="peta-type-filter"
            v-model="typeFilter"
            :class="INPUT_CLASSES"
            class="mt-1.5"
            data-test="peta-type-filter"
          >
            <option value="all">Semua jenis</option>
            <option v-for="type in POINT_TYPES" :key="type" :value="type">
              {{ typeLabel(type) }}
            </option>
          </select>
        </div>
        <BaseButton
          v-if="hasActiveFilter"
          variant="secondary"
          size="md"
          class="min-h-11"
          data-test="peta-clear-filters"
          @click="clearFilters"
        >
          Hapus pencarian dan saringan
        </BaseButton>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <p
          role="status"
          aria-live="polite"
          class="text-brand-navy text-sm font-medium"
          data-test="peta-result-count"
        >
          {{ resultText }}
        </p>

        <div v-if="!isSplit" role="group" aria-label="Pilih tampilan" class="flex gap-2">
          <BaseButton
            :variant="narrowView === 'daftar' ? 'primary' : 'secondary'"
            size="md"
            class="min-h-11"
            :aria-pressed="narrowView === 'daftar'"
            data-test="peta-view-list"
            @click="setNarrowView('daftar')"
          >
            Daftar
          </BaseButton>
          <BaseButton
            :variant="narrowView === 'peta' ? 'primary' : 'secondary'"
            size="md"
            class="min-h-11"
            :aria-pressed="narrowView === 'peta'"
            data-test="peta-view-map"
            @click="setNarrowView('peta')"
          >
            Peta
          </BaseButton>
        </div>
      </div>
    </section>

    <p
      v-if="mapsStore.isLoading && points.length === 0"
      class="text-text-muted text-sm"
      role="status"
      data-test="peta-loading"
    >
      Memuat titik peta…
    </p>

    <div
      v-else-if="points.length === 0 && !mapsStore.error"
      class="rounded-card border-border bg-surface-muted border p-6 text-center"
      data-test="peta-empty"
    >
      <p class="text-brand-navy text-base font-semibold">Belum ada titik peta.</p>
      <p class="text-text-muted mt-1 text-sm">Pilih Tambah titik untuk membuat yang pertama.</p>
    </div>

    <div v-else-if="points.length > 0" :class="isSplit ? 'grid grid-cols-12 items-start gap-6' : ''">
      <section
        v-show="isSplit || narrowView === 'daftar'"
        aria-labelledby="peta-list-title"
        :class="isSplit ? 'col-span-5' : ''"
        data-test="peta-list-section"
      >
        <h2 id="peta-list-title" class="text-brand-navy mb-3 text-lg font-bold">Daftar titik</h2>

        <div
          v-if="filteredPoints.length === 0"
          class="rounded-card border-border bg-surface-muted border p-6 text-center"
          data-test="peta-no-match"
        >
          <p class="text-brand-navy text-base font-semibold">Tidak ada titik yang cocok.</p>
          <p class="text-text-muted mt-1 text-sm">
            Ubah kata pencarian atau pilihan jenis, lalu coba lagi.
          </p>
        </div>
        <AdminPointList
          v-else
          :points="filteredPoints"
          :selected-id="selectedId"
          :issues="analysis.issues"
          :map-beside="isSplit"
          @select="selectPoint($event, true)"
          @show-on-map="showOnMap"
          @edit="openEdit"
          @delete="openDelete"
        />
      </section>

      <section
        v-if="showMap"
        aria-labelledby="peta-map-title"
        class="space-y-4"
        :class="isSplit ? 'col-span-7' : ''"
        data-test="peta-map-section"
      >
        <h2 id="peta-map-title" class="text-brand-navy text-lg font-bold">Peta</h2>
        <p class="text-text-muted text-sm">
          Pilih penanda di peta untuk melihat rinciannya. Semua titik juga ada di daftar.
        </p>
        <InteractiveMap
          ref="map"
          :points="filteredPoints"
          :frame-points="points"
          :selected-point-id="selectedId"
          :default-center="mapCenter"
          :default-zoom="mapZoom"
          @select-point="onMapSelect"
        />

        <div
          class="rounded-card border-border bg-surface border p-4"
          aria-live="polite"
          data-test="peta-selected"
        >
          <template v-if="selectedPoint">
            <h3 class="text-brand-navy text-base font-semibold break-words">
              {{ selectedPoint.name }}
            </h3>
            <p class="text-text-muted mt-1 text-sm">
              {{ typeLabel(selectedPoint.type) }} · {{ formatRtList(selectedPoint.rts) }}
            </p>
            <ul
              v-if="selectedIssues.length > 0"
              class="text-status-warning mt-2 list-disc space-y-1 pl-5 text-sm"
            >
              <li v-for="issue in selectedIssues" :key="issue.kind + (issue.rtNumber ?? '')">
                {{ issue.message }}
              </li>
            </ul>
            <div class="mt-3 flex flex-wrap gap-2">
              <BaseButton
                variant="secondary"
                size="md"
                class="min-h-11"
                :aria-label="`Ubah titik ${selectedPoint.name}`"
                data-test="selected-edit"
                @click="openEdit(selectedPoint)"
              >
                Ubah
              </BaseButton>
              <BaseButton
                variant="secondary"
                size="md"
                class="min-h-11"
                :aria-label="`Hapus titik ${selectedPoint.name}`"
                data-test="selected-delete"
                @click="openDelete(selectedPoint)"
              >
                Hapus
              </BaseButton>
            </div>
          </template>
          <p v-else class="text-text-muted text-sm">Belum ada titik yang dipilih.</p>
        </div>
      </section>
    </div>

    <BaseModal
      :open="editorOpen"
      :title="editing ? 'Ubah titik peta' : 'Tambah titik peta'"
      description="Perubahan disimpan setelah tombol simpan ditekan."
      size="lg"
      :busy="editorBusy"
      @close="requestCloseEditor"
    >
      <!-- v-show while the question is up: the draft must survive "Tetap di sini". -->
      <PointEditorForm
        v-if="editorOpen"
        v-show="!discardPromptOpen"
        ref="editorForm"
        :key="editorKey"
        :point="editing"
        :analysis="analysis"
        :initial-center="mapCenter"
        :initial-zoom="mapZoom"
        @saved="handleSaved"
        @cancel="requestCloseEditor"
        @busy="editorBusy = $event"
        @refresh="handleRefreshNeeded"
        @reload="handleReload"
      />

      <div
        v-if="editorOpen && discardPromptOpen"
        role="alertdialog"
        aria-labelledby="peta-buang-judul"
        aria-describedby="peta-buang-isi"
        class="space-y-4"
        data-test="discard-dialog"
      >
        <h3 id="peta-buang-judul" class="text-brand-navy text-base font-semibold">
          Perubahan belum disimpan
        </h3>
        <p id="peta-buang-isi" class="text-brand-navy text-sm">
          Tutup tanpa menyimpan perubahan?
        </p>
        <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <BaseButton
            variant="secondary"
            size="md"
            class="min-h-11"
            data-test="discard-confirm"
            @click="closeEditor"
          >
            Tutup tanpa menyimpan
          </BaseButton>
          <button
            ref="keepEditingButton"
            type="button"
            class="bg-brand-navy hover:bg-brand-navy/90 focus-visible:outline-focus-ring min-h-11 rounded-btn px-5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
            data-test="discard-keep"
            @click="keepEditing"
          >
            Tetap di sini
          </button>
        </div>
      </div>
    </BaseModal>

    <BaseModal
      :open="deleting !== null"
      title="Hapus titik?"
      size="md"
      :busy="deleteBusy"
      @close="closeDelete"
    >
      <div v-if="deleting" class="space-y-4" data-test="delete-dialog">
        <p class="text-brand-navy text-sm">
          Hapus titik “{{ deleting.name }}” ({{ typeLabel(deleting.type) }})?
        </p>
        <p class="text-text-muted text-sm">{{ deleteExplanation }}</p>

        <p
          v-if="deleteError"
          role="alert"
          class="rounded-btn border-status-error-border bg-status-error-surface text-status-error border px-3 py-2 text-sm"
          data-test="delete-error"
        >
          {{ deleteError }}
        </p>

        <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <BaseButton
            variant="secondary"
            size="md"
            class="min-h-11"
            :disabled="deleteBusy"
            data-test="delete-cancel"
            @click="closeDelete"
          >
            Batal
          </BaseButton>
          <button
            type="button"
            class="bg-status-error focus-visible:outline-focus-ring min-h-11 rounded-btn px-5 text-sm font-semibold text-white hover:bg-status-error/90 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:bg-surface-hover disabled:text-text-muted disabled:cursor-not-allowed"
            :disabled="deleteBusy"
            data-test="delete-confirm"
            @click="confirmDelete"
          >
            {{ deleteBusy ? 'Menghapus…' : `Hapus “${deleting.name}”` }}
          </button>
        </div>
      </div>
    </BaseModal>
  </div>
</template>
