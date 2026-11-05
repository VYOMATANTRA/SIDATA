<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import BaseButton from '../components/common/BaseButton.vue';
import BaseModal from '../components/common/BaseModal.vue';
import RtLocationPicker, { type PickedLocation } from '../components/maps/RtLocationPicker.vue';
import { apiRequestJson } from '../utils/apiClient';
import { useAuthStore } from '../stores/auth';
import { INPUT_CLASSES } from '../utils/formStyles';

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
const pageRows = computed(() =>
  filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
);

const editing = ref<LeaderRow | null>(null);
const draft = ref({
  name: '',
  phone: '',
  phoneIsWhatsapp: false,
  alamat: '',
  location: null as PickedLocation | null,
});
const isSaving = ref(false);
const saveError = ref('');

const csvText = ref('');
const importPreview = ref<ImportPreview | null>(null);
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
    loadError.value = error instanceof Error ? error.message : 'Gagal memuat daftar Ketua RT.';
  } finally {
    isLoading.value = false;
  }
}

onMounted(loadLeaders);

function openEditor(row: LeaderRow) {
  editing.value = row;
  saveError.value = '';
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
  saveError.value = '';
}

async function saveLeader() {
  const target = editing.value;
  if (!target) return;
  isSaving.value = true;
  saveError.value = '';
  try {
    await apiRequestJson(`/api/maps/rt-leaders/${target.rtNumber}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: draft.value.name.trim(),
        phone: draft.value.phone.trim(),
        phoneIsWhatsapp: draft.value.phoneIsWhatsapp,
        alamat: draft.value.alamat.trim(),
      }),
    });

    if (draft.value.location) {
      const { latitude, longitude } = draft.value.location;
      if (target.coordinates) {
        await apiRequestJson(`/api/maps/points/${target.coordinates.pointId}`, {
          method: 'PATCH',
          body: JSON.stringify({ latitude, longitude }),
        });
      } else {
        await apiRequestJson('/api/maps/points', {
          method: 'POST',
          body: JSON.stringify({
            name: `Pos RT ${String(target.rtNumber).padStart(2, '0')} Kelurahan Manggar`,
            type: 'ketua_rt',
            latitude,
            longitude,
            rts: [target.rtNumber],
          }),
        });
      }
    }

    statusMessage.value = `Data RT ${target.rtNumber} disimpan.`;
    closeEditor();
    await loadLeaders();
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : 'Gagal menyimpan data.';
  } finally {
    isSaving.value = false;
  }
}

async function previewImport() {
  const csv = csvText.value.trim();
  if (!csv) {
    importError.value = 'Pilih berkas CSV atau tempel isinya terlebih dahulu.';
    return;
  }
  importBusy.value = true;
  importError.value = '';
  importResult.value = '';
  try {
    importPreview.value = await apiRequestJson<ImportPreview>(
      '/api/maps/rt-leaders/import/preview',
      {
        method: 'POST',
        body: JSON.stringify({ csv }),
      },
    );
  } catch (error) {
    importPreview.value = null;
    importError.value = error instanceof Error ? error.message : 'Gagal memeriksa CSV.';
  } finally {
    importBusy.value = false;
  }
}

async function applyImport() {
  importBusy.value = true;
  importError.value = '';
  try {
    const result = await apiRequestJson<{ summary: ImportPreview['summary'] }>(
      '/api/maps/rt-leaders/import',
      { method: 'POST', body: JSON.stringify({ csv: csvText.value }) },
    );
    importResult.value = `${result.summary.changed} baris diperbarui, ${result.summary.unchanged} tidak berubah.`;
    importPreview.value = null;
    statusMessage.value = 'Impor CSV selesai.';
    await loadLeaders();
  } catch (error) {
    importError.value = error instanceof Error ? error.message : 'Gagal menerapkan CSV.';
  } finally {
    importBusy.value = false;
  }
}

async function onCsvFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  csvText.value = await file.text();
  importPreview.value = null;
  importError.value = '';
}

function downloadTemplate() {
  const blob = new Blob(
    [`${CSV_HEADER}\n1,Sujarwo,08120000001,true,Jl. Contoh,-1.2251,116.9438\n`],
    {
      type: 'text/csv;charset=utf-8',
    },
  );
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
    importError.value = error instanceof Error ? error.message : 'Gagal mengubah status daftar.';
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
            Nama berasal dari Monografi Kelurahan Manggar. Lengkapi kontak dan koordinat melalui
            formulir atau impor CSV.
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
      <div class="mt-3 flex items-center justify-between text-sm">
        <BaseButton variant="secondary" size="sm" :disabled="page <= 1" @click="page -= 1">
          Sebelumnya
        </BaseButton>
        <span>Halaman {{ page }} dari {{ totalPages }}</span>
        <BaseButton variant="secondary" size="sm" :disabled="page >= totalPages" @click="page += 1">
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
        data-test="rt-csv-text"
      />
      <div class="mt-3 flex gap-3">
        <BaseButton variant="secondary" size="sm" :disabled="importBusy" @click="previewImport">
          Periksa CSV
        </BaseButton>
        <BaseButton
          variant="primary"
          size="sm"
          :disabled="importBusy || !importPreview || importPreview.errors.length > 0"
          @click="applyImport"
        >
          Terapkan impor
        </BaseButton>
      </div>
      <p v-if="importError" class="mt-3 text-sm text-rose-700" role="alert">{{ importError }}</p>
      <p v-if="importResult" class="mt-3 text-sm text-emerald-800" role="status">
        {{ importResult }}
      </p>

      <div v-if="importPreview" class="mt-4 space-y-2" data-test="rt-import-preview">
        <p class="text-sm text-slate-700">
          {{ importPreview.summary.changed }} diubah, {{ importPreview.summary.unchanged }} tetap,
          {{ importPreview.summary.errors }} kesalahan.
        </p>
        <ul
          v-if="importPreview.errors.length"
          class="list-disc space-y-1 pl-5 text-sm text-rose-700"
        >
          <li v-for="error in importPreview.errors" :key="`${error.rowNumber}-${error.field}`">
            Baris {{ error.rowNumber }} ({{ error.field }}): {{ error.message }}
          </li>
        </ul>
        <ul v-else class="max-h-48 space-y-1 overflow-y-auto text-sm text-slate-700">
          <li v-for="row in importPreview.rows" :key="row.rtNumber">
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
          <input id="rt-name" v-model="draft.name" :class="INPUT_CLASSES" class="mt-1 w-full" />
        </div>
        <div>
          <label for="rt-phone" class="block text-sm font-medium text-slate-700">Telepon</label>
          <input id="rt-phone" v-model="draft.phone" :class="INPUT_CLASSES" class="mt-1 w-full" />
        </div>
        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input v-model="draft.phoneIsWhatsapp" type="checkbox" />
          Nomor ini memiliki WhatsApp
        </label>
        <div>
          <label for="rt-alamat" class="block text-sm font-medium text-slate-700">Alamat</label>
          <textarea
            id="rt-alamat"
            v-model="draft.alamat"
            rows="2"
            :class="INPUT_CLASSES"
            class="mt-1 w-full"
          />
        </div>
        <RtLocationPicker v-model="draft.location" :disabled="isSaving" />
        <p v-if="saveError" class="text-sm text-rose-700" role="alert">{{ saveError }}</p>
        <div class="flex justify-end gap-3">
          <BaseButton variant="secondary" size="md" :disabled="isSaving" @click="closeEditor">
            Batal
          </BaseButton>
          <BaseButton type="submit" variant="primary" size="md" :disabled="isSaving">
            {{ isSaving ? 'Menyimpan…' : 'Simpan' }}
          </BaseButton>
        </div>
      </form>
    </BaseModal>
  </div>
</template>
