<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import BaseButton from '../components/common/BaseButton.vue';
import BaseModal from '../components/common/BaseModal.vue';
import RtLocationPicker, { type PickedLocation } from '../components/maps/RtLocationPicker.vue';
import { ApiError, apiRequestJson } from '../utils/apiClient';
import { useAuthStore } from '../stores/auth';
import { INPUT_CLASSES } from '../utils/formStyles';
import { toUserMessage } from '../utils/userMessages';

interface LeaderRow {
  rtNumber: number;
  name: string;
  phone: string;
  phoneIsWhatsapp: boolean;
  alamat: string | null;
  coordinates: { latitude: number; longitude: number; pointId: string } | null;
}

interface ImportPreview {
  rows: Array<{
    rowNumber: number;
    rtNumber: number;
    name: string;
    action: 'update' | 'unchanged';
    changedFields: string[];
  }>;
  errors: Array<{ rowNumber: number; field: string; message: string }>;
  summary: { total: number; changed: number; unchanged: number; errors: number };
}

interface AcceptedCsvPreview {
  csv: string;
  inputRevision: number;
  preview: ImportPreview;
}

interface BaselineRow {
  rtNumber: number;
  name: string;
  phone: string;
  phoneIsWhatsapp: boolean;
  alamat: string | null;
  pointId: string | null;
  latitude: number | null;
  longitude: number | null;
}

const CSV_HEADER = 'rtNumber,name,phone,phoneIsWhatsapp,alamat,latitude,longitude';
const authStore = useAuthStore();

const leaders = ref<LeaderRow[]>([]);
const isSampleRoster = ref(false);
const isLoading = ref(false);
const loadError = ref('');
const statusMessage = ref('');

const search = ref('');
const page = ref(1);
const PAGE_SIZE = 10;
const filtered = computed(() => {
  const term = search.value.trim().toLowerCase();
  if (!term) return leaders.value;
  return leaders.value.filter(
    (row) => String(row.rtNumber).includes(term) || row.name.toLowerCase().includes(term),
  );
});
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)));
const pagination = ref<HTMLElement | null>(null);
watch(totalPages, async (pages) => {
  const focused = document.activeElement;
  if (page.value > pages) page.value = pages;
  await nextTick();
  if (
    focused instanceof HTMLButtonElement &&
    focused.disabled &&
    pagination.value?.contains(focused)
  ) {
    (
      pagination.value.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? pagination.value
    ).focus();
  }
});
async function changePage(next: number) {
  const focused = document.activeElement;
  page.value = next;
  await nextTick();
  if (focused instanceof HTMLButtonElement && focused.disabled) {
    (
      pagination.value?.querySelector<HTMLButtonElement>('button:not(:disabled)') ??
      pagination.value
    )?.focus();
  }
}
const pageRows = computed(() =>
  filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
);

const editing = ref<LeaderRow | null>(null);
const baseline = ref<BaselineRow | null>(null);
const draft = ref({
  name: '',
  phone: '',
  phoneIsWhatsapp: false,
  alamat: '',
  location: null as PickedLocation | null,
});
const isSaving = ref(false);
const saveError = ref('');
const locationConflict = ref(false);

const csvText = ref('');
const inputRevision = ref(0);
const isReadingCsv = ref(false);
let previewSequence = 0;
let fileReadToken = 0;

const acceptedPreview = ref<AcceptedCsvPreview | null>(null);
const importError = ref('');
const importBusy = ref(false);
const importResult = ref('');

async function loadLeaders() {
  isLoading.value = true;
  loadError.value = '';
  try {
    const data = await apiRequestJson<{ leaders: LeaderRow[]; isSampleRoster: boolean }>(
      '/api/maps/rt-leaders?limit=100',
    );
    leaders.value = data.leaders;
    isSampleRoster.value = data.isSampleRoster === true;
  } catch (error) {
    loadError.value = toUserMessage(error, 'memuat daftar Ketua RT', 'GET').message;
  } finally {
    isLoading.value = false;
  }
}

onMounted(loadLeaders);

function openEditor(row: LeaderRow) {
  editing.value = row;
  saveError.value = '';
  locationConflict.value = false;
  baseline.value = {
    rtNumber: row.rtNumber,
    name: row.name,
    phone: row.phone,
    phoneIsWhatsapp: row.phoneIsWhatsapp,
    alamat: row.alamat,
    pointId: row.coordinates?.pointId ?? null,
    latitude: row.coordinates?.latitude ?? null,
    longitude: row.coordinates?.longitude ?? null,
  };
  draft.value = {
    name: row.name,
    phone: row.phone,
    phoneIsWhatsapp: row.phoneIsWhatsapp,
    alamat: row.alamat ?? '',
    location: row.coordinates
      ? { latitude: row.coordinates.latitude, longitude: row.coordinates.longitude }
      : null,
  };
}

function closeEditor() {
  editing.value = null;
  baseline.value = null;
  saveError.value = '';
}

async function saveLeader() {
  const base = baseline.value;
  if (!base || isSaving.value || locationConflict.value) return;

  // 1. Capture immutable submission snapshot
  const snapshot = {
    rtNumber: base.rtNumber,
    name: draft.value.name.trim(),
    phone: draft.value.phone.trim(),
    phoneIsWhatsapp: draft.value.phoneIsWhatsapp,
    alamat: draft.value.alamat.trim(),
    desiredLocation: draft.value.location ? { ...draft.value.location } : null,
    pointId: base.pointId,
    baseLatitude: base.latitude,
    baseLongitude: base.longitude,
  };

  saveError.value = '';

  // 2. Compute contact patch (only send changed fields; omit unchanged empty name on fresh slot)
  const contactPatch: Record<string, unknown> = {};
  if (snapshot.name !== base.name) contactPatch.name = snapshot.name;
  if (snapshot.phone !== base.phone) {
    contactPatch.phone = snapshot.phone;
    if (snapshot.phone === '') {
      snapshot.phoneIsWhatsapp = false;
      contactPatch.phoneIsWhatsapp = false;
    }
  }
  if (snapshot.phoneIsWhatsapp !== base.phoneIsWhatsapp) {
    contactPatch.phoneIsWhatsapp = snapshot.phone === '' ? false : snapshot.phoneIsWhatsapp;
  }
  const normalizedAlamat = snapshot.alamat === '' ? null : snapshot.alamat;
  if (normalizedAlamat !== base.alamat) {
    contactPatch.alamat = normalizedAlamat;
  }

  // 3. Compute location operation according to transition table
  const coordsChanged =
    snapshot.desiredLocation !== null &&
    (base.latitude === null ||
      base.longitude === null ||
      Math.abs(snapshot.desiredLocation.latitude - base.latitude) > 1e-7 ||
      Math.abs(snapshot.desiredLocation.longitude - base.longitude) > 1e-7);

  let locationOp: 'none' | 'create' | 'update' | 'delete' = 'none';
  if (!base.pointId && snapshot.desiredLocation) {
    locationOp = 'create';
  } else if (base.pointId && !snapshot.desiredLocation) {
    locationOp = 'delete';
  } else if (base.pointId && coordsChanged) {
    locationOp = 'update';
  }

  if (Object.keys(contactPatch).length === 0 && locationOp === 'none') {
    closeEditor();
    return;
  }

  isSaving.value = true;
  let contactSuccess = false;
  let writingLocation = false;
  try {
    // Save contact first if changed
    if (Object.keys(contactPatch).length > 0) {
      await apiRequestJson(`/api/maps/rt-leaders/${snapshot.rtNumber}`, {
        method: 'PATCH',
        body: JSON.stringify(contactPatch),
      });
      contactSuccess = true;
      base.name = snapshot.name;
      base.phone = snapshot.phone;
      base.phoneIsWhatsapp = snapshot.phoneIsWhatsapp;
      base.alamat = snapshot.alamat;
    } else {
      contactSuccess = true;
    }

    // Now execute location operation
    writingLocation = true;
    if (locationOp === 'delete' && snapshot.pointId) {
      await apiRequestJson(
        `/api/maps/points/${encodeURIComponent(snapshot.pointId)}?expectedRtNumber=${snapshot.rtNumber}`,
        {
          method: 'DELETE',
        },
      );
      base.pointId = null;
      base.latitude = null;
      base.longitude = null;
    } else if (locationOp === 'update' && snapshot.pointId && snapshot.desiredLocation) {
      await apiRequestJson(
        `/api/maps/points/${encodeURIComponent(snapshot.pointId)}?expectedRtNumber=${snapshot.rtNumber}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            latitude: snapshot.desiredLocation.latitude,
            longitude: snapshot.desiredLocation.longitude,
          }),
        },
      );
      base.latitude = snapshot.desiredLocation.latitude;
      base.longitude = snapshot.desiredLocation.longitude;
    } else if (locationOp === 'create' && snapshot.desiredLocation) {
      const created = await apiRequestJson<{ point: { id: string } }>('/api/maps/points', {
        method: 'POST',
        body: JSON.stringify({
          name: `Pos RT ${String(snapshot.rtNumber).padStart(2, '0')} Kelurahan Manggar`,
          type: 'ketua_rt',
          latitude: snapshot.desiredLocation.latitude,
          longitude: snapshot.desiredLocation.longitude,
          rts: [snapshot.rtNumber],
        }),
      });
      base.pointId = created.point?.id ?? null;
      base.latitude = snapshot.desiredLocation.latitude;
      base.longitude = snapshot.desiredLocation.longitude;
    }

    statusMessage.value = `Data RT ${snapshot.rtNumber} berhasil disimpan.`;
    closeEditor();
    await loadLeaders();
  } catch (error) {
    if (
      writingLocation &&
      (locationOp === 'update' || locationOp === 'delete') &&
      error instanceof ApiError &&
      (error.status === 409 || error.status === 404)
    ) {
      locationConflict.value = true;
      const contactNotice =
        contactSuccess && Object.keys(contactPatch).length > 0
          ? 'Data kontak berhasil disimpan. '
          : '';
      saveError.value = `${contactNotice}Lokasi telah berubah atau dihapus. Muat ulang data RT sebelum menyimpan.`;
      await loadLeaders();
    } else if (contactSuccess && Object.keys(contactPatch).length > 0 && locationOp !== 'none') {
      saveError.value = `Data kontak berhasil disimpan, namun lokasi gagal diperbarui: ${toUserMessage(error).message}`;
      void loadLeaders();
    } else {
      saveError.value = toUserMessage(error, 'menyimpan data RT').message;
    }
  } finally {
    isSaving.value = false;
  }
}

async function reloadEditor() {
  if (loadError.value) await loadLeaders();
  const row = leaders.value.find((leader) => leader.rtNumber === baseline.value?.rtNumber);
  if (row && !loadError.value) openEditor(row);
}

function onCsvTextChange() {
  fileReadToken += 1;
  isReadingCsv.value = false;
  inputRevision.value += 1;
  acceptedPreview.value = null;
  importResult.value = '';
  importError.value = '';
}

async function onCsvFile(event: Event) {
  if (importBusy.value) return;
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const token = ++fileReadToken;
  isReadingCsv.value = true;
  inputRevision.value += 1;
  acceptedPreview.value = null;
  importResult.value = '';
  importError.value = '';
  try {
    const text = await file.text();
    if (token !== fileReadToken) return;
    csvText.value = text;
    inputRevision.value += 1;
    acceptedPreview.value = null;
    importResult.value = '';
    importError.value = '';
  } catch {
    if (token === fileReadToken) {
      importError.value = 'Gagal membaca berkas CSV.';
    }
  } finally {
    if (token === fileReadToken) {
      isReadingCsv.value = false;
    }
  }
}

async function previewImport() {
  if (importBusy.value || isReadingCsv.value) return;
  const currentText = csvText.value;
  if (!currentText.trim()) {
    importError.value = 'Pilih berkas CSV atau tempel isinya terlebih dahulu.';
    return;
  }
  const currentRevision = inputRevision.value;
  const seq = ++previewSequence;

  importBusy.value = true;
  importError.value = '';
  importResult.value = '';
  acceptedPreview.value = null;

  try {
    const result = await apiRequestJson<ImportPreview>('/api/maps/rt-leaders/import/preview', {
      method: 'POST',
      body: JSON.stringify({ csv: currentText }),
    });
    if (seq === previewSequence && currentRevision === inputRevision.value) {
      acceptedPreview.value = {
        csv: currentText,
        inputRevision: currentRevision,
        preview: result,
      };
    }
  } catch (error) {
    if (seq === previewSequence && currentRevision === inputRevision.value) {
      acceptedPreview.value = null;
      importError.value = toUserMessage(error, 'memeriksa CSV').message;
    }
  } finally {
    if (seq === previewSequence) {
      importBusy.value = false;
    }
  }
}

const canApplyImport = computed(() => {
  if (importBusy.value || isReadingCsv.value) return false;
  if (!acceptedPreview.value) return false;
  if (acceptedPreview.value.inputRevision !== inputRevision.value) return false;
  if (acceptedPreview.value.csv !== csvText.value) return false;
  return acceptedPreview.value.preview.errors.length === 0;
});

async function applyImport() {
  if (!canApplyImport.value || !acceptedPreview.value) return;
  const snapshotToApply = acceptedPreview.value;

  importBusy.value = true;
  importError.value = '';
  try {
    const result = await apiRequestJson<{ summary: ImportPreview['summary'] }>(
      '/api/maps/rt-leaders/import',
      { method: 'POST', body: JSON.stringify({ csv: snapshotToApply.csv }) },
    );
    importResult.value = `${result.summary.changed} baris diperbarui, ${result.summary.unchanged} tidak berubah.`;
    acceptedPreview.value = null;
    statusMessage.value = 'Impor CSV selesai.';
    await loadLeaders();
  } catch (error) {
    acceptedPreview.value = null;
    importError.value = toUserMessage(error, 'menerapkan CSV').message;
  } finally {
    importBusy.value = false;
  }
}

function downloadTemplate() {
  const blob = new Blob([`${CSV_HEADER}\n1,Contoh Nama,08120000001,true,Jl. Contoh,,\n`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'template-ketua-rt.csv';
  link.click();
  URL.revokeObjectURL(url);
}

async function setSampleStatus(isSample: boolean) {
  importBusy.value = true;
  importError.value = '';
  try {
    const result = await apiRequestJson<{ isSampleRoster: boolean }>(
      '/api/maps/rt-leaders/sample-status',
      { method: 'PATCH', body: JSON.stringify({ isSample }) },
    );
    isSampleRoster.value = result.isSampleRoster;
    statusMessage.value = isSample
      ? 'Daftar ditandai sebagai data contoh.'
      : 'Daftar ditandai sebagai data resmi.';
  } catch (error) {
    importError.value = toUserMessage(error, 'mengubah status daftar').message;
  } finally {
    importBusy.value = false;
  }
}
</script>

<template>
  <div class="space-y-8">
    <section aria-labelledby="rt-editor-title">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="rt-editor-title" class="text-brand-navy text-lg font-bold">Daftar Ketua RT</h2>
          <p class="mt-1 text-sm text-slate-600">
            Kelola kontak dan koordinat Ketua RT melalui formulir atau impor CSV.
          </p>
        </div>
        <span
          class="rounded-full px-3 py-1 text-xs font-semibold"
          :class="
            isSampleRoster ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'
          "
        >
          {{ isSampleRoster ? 'Data contoh' : 'Data resmi' }}
        </span>
      </div>

      <p v-if="statusMessage" class="mt-3 text-sm text-emerald-800" role="status">
        {{ statusMessage }}
      </p>
      <p v-if="loadError" class="mt-3 text-sm text-rose-700" role="alert">{{ loadError }}</p>

      <div class="mt-4 flex flex-wrap items-end gap-3">
        <div class="w-full sm:w-72">
          <label for="rt-cms-search" class="block text-xs font-medium text-slate-600">
            Cari nomor RT atau nama
          </label>
          <input
            id="rt-cms-search"
            v-model="search"
            type="search"
            :class="INPUT_CLASSES"
            class="mt-1"
            @input="page = 1"
          />
        </div>
        <p class="text-sm text-slate-600">{{ filtered.length }} RT</p>
      </div>

      <div class="mt-4 overflow-x-auto rounded border border-slate-200">
        <table class="w-full text-left text-sm">
          <thead class="bg-slate-50 text-slate-700">
            <tr>
              <th scope="col" class="px-3 py-2">RT</th>
              <th scope="col" class="px-3 py-2">Nama</th>
              <th scope="col" class="px-3 py-2">Telepon</th>
              <th scope="col" class="px-3 py-2">Alamat</th>
              <th scope="col" class="px-3 py-2">Koordinat</th>
              <th scope="col" class="px-3 py-2"><span class="sr-only">Aksi</span></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="row in pageRows" :key="row.rtNumber">
              <th scope="row" class="px-3 py-2 font-semibold">{{ row.rtNumber }}</th>
              <td class="px-3 py-2">{{ row.name.trim() || 'Belum tersedia' }}</td>
              <td class="px-3 py-2">{{ row.phone.trim() || '—' }}</td>
              <td class="px-3 py-2">{{ row.alamat || '—' }}</td>
              <td class="px-3 py-2">{{ row.coordinates ? 'Ada' : 'Belum' }}</td>
              <td class="px-3 py-2 text-right">
                <BaseButton
                  variant="secondary"
                  size="sm"
                  :data-test="`rt-edit-${row.rtNumber}`"
                  @click="openEditor(row)"
                >
                  Edit
                </BaseButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="isLoading" class="mt-2 text-sm text-slate-600" role="status">Memuat data…</p>
      <div ref="pagination" tabindex="-1" class="mt-3 flex items-center justify-between text-sm">
        <BaseButton
          variant="secondary"
          size="sm"
          :disabled="page <= 1"
          @click="changePage(page - 1)"
        >
          Sebelumnya
        </BaseButton>
        <span>Halaman {{ page }} dari {{ totalPages }}</span>
        <BaseButton
          variant="secondary"
          size="sm"
          :disabled="page >= totalPages"
          @click="changePage(page + 1)"
        >
          Selanjutnya
        </BaseButton>
      </div>
    </section>

    <section aria-labelledby="rt-import-title" class="rounded border border-slate-200 p-4">
      <h2 id="rt-import-title" class="text-brand-navy text-lg font-bold">Impor CSV</h2>
      <p class="mt-1 text-sm text-slate-600">
        Kolom: <code>{{ CSV_HEADER }}</code
        >. Sel kosong mempertahankan nilai lama; RT yang tidak dicantumkan tidak dihapus.
      </p>
      <div class="mt-3 flex flex-wrap gap-3">
        <label class="text-sm font-medium text-slate-700">
          Berkas CSV
          <input
            type="file"
            accept=".csv,text/csv"
            class="mt-1 block text-sm"
            :disabled="importBusy"
            data-test="rt-csv-file"
            @change="onCsvFile"
          />
        </label>
        <BaseButton variant="secondary" size="sm" @click="downloadTemplate">
          Unduh template
        </BaseButton>
      </div>
      <label for="rt-csv-text" class="mt-3 block text-sm font-medium text-slate-700">
        atau tempel isi CSV
      </label>
      <textarea
        id="rt-csv-text"
        v-model="csvText"
        rows="5"
        :class="INPUT_CLASSES"
        class="mt-1 w-full font-mono text-xs"
        :disabled="importBusy"
        data-test="rt-csv-text"
        @input="onCsvTextChange"
      />
      <div class="mt-3 flex gap-3">
        <BaseButton
          variant="secondary"
          size="sm"
          :disabled="importBusy || isReadingCsv"
          @click="previewImport"
        >
          Periksa CSV
        </BaseButton>
        <BaseButton
          variant="primary"
          size="sm"
          :disabled="!canApplyImport"
          data-test="rt-apply-import"
          @click="applyImport"
        >
          Terapkan impor
        </BaseButton>
      </div>
      <p v-if="importError" class="mt-3 text-sm text-rose-700" role="alert">{{ importError }}</p>
      <p v-if="importResult" class="mt-3 text-sm text-emerald-800" role="status">
        {{ importResult }}
      </p>

      <div v-if="acceptedPreview" class="mt-4 space-y-2" data-test="rt-import-preview">
        <p class="text-sm text-slate-700">
          {{ acceptedPreview.preview.summary.changed }} diubah,
          {{ acceptedPreview.preview.summary.unchanged }} tetap,
          {{ acceptedPreview.preview.summary.errors }} kesalahan.
        </p>
        <ul
          v-if="acceptedPreview.preview.errors.length"
          class="list-disc space-y-1 pl-5 text-sm text-rose-700"
        >
          <li
            v-for="error in acceptedPreview.preview.errors"
            :key="`${error.rowNumber}-${error.field}`"
          >
            Baris {{ error.rowNumber }} ({{ error.field }}): {{ error.message }}
          </li>
        </ul>
        <ul v-else class="max-h-48 space-y-1 overflow-y-auto text-sm text-slate-700">
          <li v-for="row in acceptedPreview.preview.rows" :key="row.rtNumber">
            RT {{ row.rtNumber }} — {{ row.action === 'update' ? 'diubah' : 'tetap' }}
            <span v-if="row.changedFields.length">({{ row.changedFields.join(', ') }})</span>
          </li>
        </ul>
      </div>

      <div v-if="authStore.isAdmin" class="mt-5 border-t border-slate-200 pt-4">
        <p class="text-sm text-slate-700">
          Status daftar saat ini:
          <strong>{{ isSampleRoster ? 'data contoh' : 'data resmi' }}</strong>
        </p>
        <BaseButton
          variant="secondary"
          size="sm"
          :disabled="importBusy"
          @click="setSampleStatus(!isSampleRoster)"
        >
          {{ isSampleRoster ? 'Tandai sebagai data resmi' : 'Tandai sebagai data contoh' }}
        </BaseButton>
      </div>
    </section>

    <BaseModal
      :open="editing !== null"
      :title="editing ? `Edit RT ${editing.rtNumber}` : 'Edit Ketua RT'"
      description="Perubahan disimpan setelah tombol Simpan ditekan."
      size="lg"
      :busy="isSaving"
      @close="closeEditor"
    >
      <form class="space-y-4" @submit.prevent="saveLeader">
        <div>
          <label for="rt-name" class="block text-sm font-medium text-slate-700">Nama</label>
          <input
            id="rt-name"
            v-model="draft.name"
            :disabled="isSaving"
            :class="INPUT_CLASSES"
            class="mt-1 w-full"
          />
        </div>
        <div>
          <label for="rt-phone" class="block text-sm font-medium text-slate-700">Telepon</label>
          <input
            id="rt-phone"
            v-model="draft.phone"
            :disabled="isSaving"
            :class="INPUT_CLASSES"
            class="mt-1 w-full"
          />
        </div>
        <label
          class="flex items-center gap-2 text-sm text-slate-700"
          :class="{ 'cursor-not-allowed opacity-50': !draft.phone.trim() }"
        >
          <input
            v-model="draft.phoneIsWhatsapp"
            :disabled="isSaving || !draft.phone.trim()"
            type="checkbox"
          />
          Nomor ini memiliki WhatsApp
        </label>
        <div>
          <label for="rt-alamat" class="block text-sm font-medium text-slate-700">Alamat</label>
          <textarea
            id="rt-alamat"
            v-model="draft.alamat"
            :disabled="isSaving"
            rows="2"
            :class="INPUT_CLASSES"
            class="mt-1 w-full"
          />
        </div>
        <RtLocationPicker
          v-model="draft.location"
          :disabled="isSaving"
        />
        <p v-if="saveError" class="text-sm text-rose-700" role="alert">{{ saveError }}</p>
        <BaseButton
          v-if="locationConflict"
          type="button"
          variant="secondary"
          :disabled="isLoading"
          @click="reloadEditor"
          >Muat ulang data RT</BaseButton
        >
        <div class="flex justify-end gap-3">
          <BaseButton variant="secondary" size="md" :disabled="isSaving" @click="closeEditor">
            Batal
          </BaseButton>
          <BaseButton
            type="submit"
            variant="primary"
            size="md"
            :disabled="isSaving || locationConflict"
          >
            {{ isSaving ? 'Menyimpan…' : 'Simpan' }}
          </BaseButton>
        </div>
      </form>
    </BaseModal>
  </div>
</template>
