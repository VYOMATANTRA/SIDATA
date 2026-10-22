<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import TentangPageLayout from '../components/tentang/TentangPageLayout.vue';
import TentangBreadcrumb from '../components/tentang/TentangBreadcrumb.vue';
import TentangHeroPanel from '../components/tentang/TentangHeroPanel.vue';
import TentangNotice from '../components/tentang/TentangNotice.vue';
import BaseButton from '../components/common/BaseButton.vue';
import { useRtLeadersStore } from '../stores/rtLeaders.store';

const rtLeadersStore = useRtLeadersStore();

onMounted(() => {
  void rtLeadersStore.fetchRtLeaders();
});

const query = ref('');

/**
 * A digits-only query names one RT, so "7", "07", and "007" all address RT 7.
 * Anything else is treated as a name search.
 */
const queryAsRtNumber = computed<number | null>(() => {
  const trimmed = query.value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
});

/**
 * Filtering runs entirely client-side over the full roster (SPEC §8): no server
 * round-trip and no pagination. An empty query returns every row, so the default
 * state is the complete table.
 */
const filteredLeaders = computed(() => {
  const term = query.value.trim().toLowerCase();

  if (term === '') {
    return rtLeadersStore.rtLeaders;
  }

  const rtNumber = queryAsRtNumber.value;
  if (rtNumber !== null) {
    return rtLeadersStore.rtLeaders.filter((leader) => leader.rtNumber === rtNumber);
  }

  return rtLeadersStore.rtLeaders.filter((leader) => leader.name.toLowerCase().includes(term));
});

const isFiltered = computed(() => query.value.trim() !== '');
const hasRows = computed(() => rtLeadersStore.rtLeaders.length > 0);
const showEmptyResult = computed(
  () => !rtLeadersStore.isLoading && hasRows.value && filteredLeaders.value.length === 0,
);
const showNoData = computed(
  () =>
    !rtLeadersStore.isLoading &&
    rtLeadersStore.hasFetched &&
    !rtLeadersStore.error &&
    !hasRows.value,
);

/**
 * One polite announcement for the whole table (SPEC §8): the number of rows on
 * screen against the roster size.
 */
const countSummary = computed(() => {
  const total = rtLeadersStore.rtLeaders.length;
  return `Menampilkan ${filteredLeaders.value.length} dari ${total} RT`;
});

/**
 * The roster source does not always carry street addresses — the survey import
 * from the kelurahan has none. Rather than fill a whole column with em dashes,
 * the column only exists when at least one leader actually has an address.
 */
const hasAddressData = computed(() =>
  rtLeadersStore.rtLeaders.some((leader) => (leader.alamat ?? '').trim() !== ''),
);

function clearFilter() {
  query.value = '';
}

function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

/**
 * A placeholder row carries no contact at all — the seeded roster stores a
 * non-dialable marker instead of a number. There is nothing to call or message
 * then, so the cell shows the value as plain text rather than a dead link.
 */
function isDialable(value: string): boolean {
  return digitsOnly(value) !== '';
}

/**
 * WhatsApp requires an international MSISDN. The roster mixes formats — local
 * `08…`, international `+62 8…`, and bare `8…` — so the number is normalised to
 * the `62…` form before building the wa.me link.
 */
function whatsappNumber(value: string): string {
  const digits = digitsOnly(value);
  if (digits === '') return '';
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
}

/**
 * Display grouping that keeps a long mobile number readable: local numbers read
 * `0812 5356 695`, international ones `+62 812 5356 695`. Anything that is not a
 * recognisable mobile number is shown exactly as recorded.
 */
function formatPhone(value: string): string {
  const digits = digitsOnly(value);

  if (digits.startsWith('62')) {
    const rest = digits.slice(2);
    if (rest.length < 9) return value;
    return `+62 ${rest.slice(0, 3)} ${rest.slice(3, 7)} ${rest.slice(7)}`;
  }

  if (digits.startsWith('0') && digits.length >= 10 && digits.length <= 13) {
    const head = digits.slice(0, 4);
    const middle = digits.slice(4, 8);
    const rest = digits.slice(8);
    return rest === '' ? `${head} ${middle}` : `${head} ${middle} ${rest}`;
  }

  return value;
}
</script>

<template>
  <TentangPageLayout>
    <TentangBreadcrumb label="Ketua RT" parent-label="Beranda" parent-to="/" />

    <TentangHeroPanel
      title="Ketua RT Kelurahan Manggar"
      subtitle="Contoh data daftar Ketua RT. Cari langsung di tabel berdasarkan nomor RT atau nama ketua."
    />

    <TentangNotice heading="Data contoh, bukan daftar resmi">
      <p>
        Isi tabel di bawah ini adalah <strong>data contoh</strong>, bukan data resmi dari
        kelurahan. Nama dan kontak yang tampil belum mewakili ketua RT yang sebenarnya.
      </p>
      <p>
        Untuk informasi kontak yang benar, hubungi kantor kelurahan.
      </p>
    </TentangNotice>

    <section class="bg-white px-4 py-10 sm:px-6 sm:py-12" aria-labelledby="daftar-rt-title">
      <div class="mx-auto max-w-5xl">
        <h2 id="daftar-rt-title" class="text-lg font-bold text-brand-navy">
          Daftar Ketua RT
        </h2>

        <!-- In-table search: single labelled input over the full 100-row set -->
        <div class="mt-5">
          <label for="rt-search" class="block text-base font-medium text-brand-navy">
            Cari nomor RT atau nama ketua
          </label>
          <input
            id="rt-search"
            v-model="query"
            type="search"
            name="rt-search"
            placeholder="Contoh: 007 atau Andi"
            autocomplete="off"
            class="mt-2 w-full max-w-md rounded-btn border border-gray-400 bg-white px-4 py-2.5 text-base text-brand-navy placeholder:text-gray-500 focus-visible:border-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
            data-test="rt-search"
          />
          <p class="mt-3 text-base text-gray-700" aria-live="polite" data-test="rt-count">
            {{ countSummary }}
          </p>
        </div>

        <!-- Error -->
        <div
          v-if="rtLeadersStore.error"
          class="mt-5 rounded-btn border border-gray-400 bg-white p-5"
          role="alert"
          data-test="rt-error"
        >
          <p class="text-base text-brand-navy">{{ rtLeadersStore.error }}</p>
          <div class="mt-3">
            <BaseButton label="Coba lagi" size="sm" @click="rtLeadersStore.fetchRtLeaders(true)" />
          </div>
        </div>

        <!-- Table -->
        <div v-else class="mt-5 overflow-hidden rounded-btn border border-gray-300 bg-white shadow-xs">
          <div class="relative overflow-x-auto">
            <table class="w-full min-w-[600px] table-fixed divide-y divide-gray-200 text-left text-sm text-gray-800">
              <caption class="sr-only">
                <template v-if="hasAddressData">
                  Daftar Ketua RT Kelurahan Manggar beserta nomor RT, nama, kontak, dan alamat
                </template>
                <template v-else>
                  Daftar Ketua RT Kelurahan Manggar beserta nomor RT, nama, dan kontak
                </template>
              </caption>
              <thead class="bg-brand-navy text-sm sm:text-base font-semibold text-white">
                <tr>
                  <th
                    scope="col"
                    class="px-4 py-3.5 sm:px-6"
                    :class="hasAddressData ? 'w-[18%] sm:w-[14%]' : 'w-[20%] sm:w-[16%]'"
                  >
                    No. RT
                  </th>
                  <th
                    scope="col"
                    class="px-4 py-3.5 sm:px-6"
                    :class="hasAddressData ? 'w-[36%] sm:w-[34%]' : 'w-[50%] sm:w-[54%]'"
                  >
                    Nama Ketua RT
                  </th>
                  <th
                    scope="col"
                    class="px-4 py-3.5 sm:px-6"
                    :class="hasAddressData ? 'w-[26%] sm:w-[24%]' : 'w-[30%] sm:w-[30%]'"
                  >
                    Kontak
                  </th>
                  <th
                    v-if="hasAddressData"
                    scope="col"
                    class="w-[20%] px-4 py-3.5 sm:w-[28%] sm:px-6"
                  >
                    Alamat
                  </th>
                </tr>
              </thead>

              <!-- Loading skeleton keeps the table's shape -->
              <tbody v-if="rtLeadersStore.isLoading" class="divide-y divide-gray-200 bg-white">
                <tr v-for="row in 5" :key="`skeleton-${row}`" aria-hidden="true">
                  <td class="px-4 py-4 sm:px-6"><span class="block h-4 w-10 animate-pulse rounded bg-gray-200"></span></td>
                  <td class="px-4 py-4 sm:px-6"><span class="block h-4 w-40 animate-pulse rounded bg-gray-200"></span></td>
                  <td class="px-4 py-4 sm:px-6"><span class="block h-4 w-32 animate-pulse rounded bg-gray-200"></span></td>
                  <td v-if="hasAddressData" class="px-4 py-4 sm:px-6"><span class="block h-4 w-48 animate-pulse rounded bg-gray-200"></span></td>
                </tr>
              </tbody>

              <tbody v-else-if="filteredLeaders.length > 0" class="divide-y divide-gray-200 bg-white">
                <tr
                  v-for="leader in filteredLeaders"
                  :key="leader.rtNumber"
                  class="transition-colors hover:bg-gray-50/75"
                >
                  <th scope="row" class="px-4 py-4 align-top font-semibold text-brand-navy whitespace-nowrap sm:px-6">
                    {{ leader.rtNumber }}
                  </th>
                  <td class="px-4 py-4 align-top text-gray-800 break-words sm:px-6">{{ leader.name }}</td>
                  <td class="px-4 py-4 align-top text-gray-800 whitespace-nowrap sm:px-6">
                    <a
                      v-if="leader.phoneIsWhatsapp && isDialable(leader.phone)"
                      :href="`https://wa.me/${whatsappNumber(leader.phone)}`"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="font-medium text-brand-navy underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
                    >
                      {{ formatPhone(leader.phone) }}
                      <span class="sr-only">(WhatsApp, tautan eksternal, terbuka di tab baru)</span>
                    </a>
                    <a
                      v-else-if="isDialable(leader.phone)"
                      :href="`tel:${digitsOnly(leader.phone)}`"
                      class="font-medium text-brand-navy underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
                    >
                      {{ formatPhone(leader.phone) }}
                      <span class="sr-only">(panggilan telepon)</span>
                    </a>
                    <span
                      v-else
                      class="text-gray-700"
                      data-test="rt-phone-placeholder"
                    >
                      {{ leader.phone }}
                    </span>
                  </td>
                  <td v-if="hasAddressData" class="px-4 py-4 align-top text-gray-700 break-words sm:px-6">
                    {{ leader.alamat ?? '—' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- No match for the current filter -->
          <div v-if="showEmptyResult" class="border-t border-gray-200 p-5" data-test="rt-empty">
            <p class="text-base text-gray-800">
              Tidak ada RT yang cocok dengan &ldquo;{{ query.trim() }}&rdquo;. Coba nomor RT atau
              nama lain.
            </p>
            <div class="mt-3">
              <BaseButton label="Hapus filter" size="sm" variant="secondary" @click="clearFilter" />
            </div>
          </div>

          <!-- Roster genuinely empty -->
          <div
            v-else-if="showNoData"
            class="border-t border-gray-200 p-5 text-base text-gray-800"
            data-test="rt-nodata"
          >
            Data Ketua RT belum tersedia. Hubungi kantor kelurahan untuk informasi terbaru.
          </div>
        </div>

        <!-- Rows the API returned that could not be rendered -->
        <p
          v-if="rtLeadersStore.rejectedCount > 0"
          class="mt-4 text-sm text-gray-700"
          data-test="rt-rejected"
        >
          {{ rtLeadersStore.rejectedCount }} baris data tidak lengkap dan tidak ditampilkan. Hubungi
          kantor kelurahan untuk pemutakhiran data.
        </p>

        <p class="mt-3 text-sm text-gray-600">
          <template v-if="isFiltered">
            Pencarian hanya menyaring tabel; hapus filter untuk melihat seluruh
            {{ rtLeadersStore.rtLeaders.length }} RT.
          </template>
          <template v-else>
            Gunakan kolom pencarian untuk menyaring nomor RT atau nama ketua secara langsung.
          </template>
        </p>
      </div>
    </section>
  </TentangPageLayout>
</template>
