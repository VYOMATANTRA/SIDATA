<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
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
const currentPage = ref(1);
const pageSize = ref(10);

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
 * round-trip. An empty query returns every row, so the default state is the
 * complete table.
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

/**
 * Pagination is client-side over the rows already loaded. The store asks the API
 * for all 100 leaders in one request (the endpoint's default page size is 10, so
 * the explicit limit is load-bearing), so paging never costs a round-trip.
 */
const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredLeaders.value.length / pageSize.value)),
);

const paginatedLeaders = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredLeaders.value.slice(start, start + pageSize.value);
});

const startRowIndex = computed(() =>
  filteredLeaders.value.length === 0 ? 0 : (currentPage.value - 1) * pageSize.value + 1,
);

const endRowIndex = computed(() =>
  Math.min(currentPage.value * pageSize.value, filteredLeaders.value.length),
);

/**
 * A bounded page list with ellipsis windowing, so the control never grows wide
 * enough to wrap onto a second line.
 */
const paginationPages = computed<(number | 'ellipsis')[]>(() => {
  const total = totalPages.value;
  const current = currentPage.value;

  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  if (current <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis', total];
  }

  if (current >= total - 3) {
    return [1, 'ellipsis', total - 4, total - 3, total - 2, total - 1, total];
  }

  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total];
});

function goToPage(page: number) {
  if (page < 1 || page > totalPages.value) return;
  currentPage.value = page;
}

// A new search or a new page size invalidates the current offset.
watch([query, pageSize], () => {
  currentPage.value = 1;
});

// Filtering down can leave the current page beyond the last one.
watch(totalPages, (newTotal) => {
  if (currentPage.value > newTotal) {
    currentPage.value = Math.max(1, newTotal);
  }
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
 * One polite announcement for the whole table (SPEC §8): how many rows match,
 * against the roster size. When the matches span several pages it reports the
 * visible slice instead, so a page change is announced too.
 */
const countSummary = computed(() => {
  const rosterTotal = rtLeadersStore.rtLeaders.length;
  const filtered = filteredLeaders.value.length;

  if (filtered === 0) {
    return `Menampilkan 0 dari ${rosterTotal} RT`;
  }

  if (filtered === 1) {
    return `Menampilkan 1 dari ${rosterTotal} RT`;
  }

  // Every match fits on the first page: report the match count.
  if (pageSize.value >= filtered && currentPage.value === 1) {
    return `Menampilkan ${filtered} dari ${rosterTotal} RT`;
  }

  if (isFiltered.value) {
    return `Menampilkan ${startRowIndex.value}–${endRowIndex.value} dari ${filtered} RT (total ${rosterTotal} RT)`;
  }

  return `Menampilkan ${startRowIndex.value}–${endRowIndex.value} dari ${rosterTotal} RT`;
});

/**
 * The roster source does not always carry street addresses — the survey import
 * from the kelurahan has none. Rather than fill a whole column with em dashes,
 * the column only exists when at least one leader actually has an address.
 */
const hasAddressData = computed(() =>
  rtLeadersStore.rtLeaders.some((leader) => (leader.alamat ?? '').trim() !== ''),
);

/** Explicit flag from the API (system_settings), not a phone/name heuristic. */
const isSampleRoster = computed(() => rtLeadersStore.isSampleRoster);

const heroSubtitle = computed(() => {
  if (isSampleRoster.value) {
    return 'Contoh data daftar Ketua RT. Cari langsung di tabel berdasarkan nomor RT atau nama ketua.';
  }
  return 'Daftar Ketua RT Kelurahan Manggar. Cari langsung di tabel berdasarkan nomor RT atau nama ketua.';
});

function clearFilter() {
  query.value = '';
}

function primaryPhone(value: string): string {
  // If the field contains multiple numbers (e.g. separated by comma, slash, semicolon), take the first
  const parts = value.split(/[/,;]/);
  return parts[0]?.trim() ?? value;
}

function digitsOnly(value: string): string {
  return primaryPhone(value).replace(/[^0-9]/g, '');
}

function telHref(value: string): string {
  const primary = primaryPhone(value);
  const prefix = primary.startsWith('+') ? '+' : '';
  return `tel:${prefix}${digitsOnly(value)}`;
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
  const primary = primaryPhone(value);
  const digits = digitsOnly(primary);

  if (digits.startsWith('62')) {
    const rest = digits.slice(2);
    if (rest.length < 9) return primary;
    return `+62 ${rest.slice(0, 3)} ${rest.slice(3, 7)} ${rest.slice(7)}`;
  }

  if (digits.startsWith('0') && digits.length >= 10 && digits.length <= 13) {
    const head = digits.slice(0, 4);
    const middle = digits.slice(4, 8);
    const rest = digits.slice(8);
    return rest === '' ? `${head} ${middle}` : `${head} ${middle} ${rest}`;
  }

  return primary;
}
</script>

<template>
  <TentangPageLayout>
    <TentangBreadcrumb label="Ketua RT" parent-label="Beranda" parent-to="/" />

    <TentangHeroPanel title="Ketua RT Kelurahan Manggar" :subtitle="heroSubtitle" />

    <TentangNotice v-if="isSampleRoster" heading="Data contoh, bukan daftar resmi">
      <p>
        Isi tabel di bawah ini adalah <strong>data contoh</strong>, bukan data resmi dari kelurahan.
        Nama dan kontak yang tampil belum mewakili ketua RT yang sebenarnya.
      </p>
      <p>Untuk informasi kontak yang benar, hubungi kantor kelurahan.</p>
    </TentangNotice>

    <section class="bg-white px-4 py-10 sm:px-6 sm:py-12" aria-labelledby="daftar-rt-title">
      <div class="mx-auto max-w-5xl">
        <h2 id="daftar-rt-title" class="text-brand-navy text-lg font-bold">Daftar Ketua RT</h2>

        <!-- In-table search: single labelled input over the full 100-row set -->
        <div class="mt-5">
          <label for="rt-search" class="text-brand-navy block text-base font-medium">
            Cari nomor RT atau nama ketua
          </label>
          <input
            id="rt-search"
            v-model="query"
            type="search"
            name="rt-search"
            placeholder="Contoh: 007 atau Andi"
            autocomplete="off"
            class="rounded-btn text-brand-navy focus-visible:border-brand-navy focus-visible:outline-brand-navy mt-2 w-full max-w-md border border-gray-400 bg-white px-4 py-2.5 text-base placeholder:text-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2"
            data-test="rt-search"
          />
          <p class="mt-3 text-base text-gray-700" aria-live="polite" data-test="rt-count">
            {{ rtLeadersStore.hasFetched && !rtLeadersStore.isLoading && !rtLeadersStore.error ? countSummary : '' }}
          </p>
        </div>

        <!-- Error: blocking empty state when nothing is loaded; banner when a refresh fails -->
        <div
          v-if="rtLeadersStore.error"
          class="rounded-btn mt-5 border border-gray-400 bg-white p-5"
          role="alert"
          data-test="rt-error"
        >
          <p class="text-brand-navy text-base">{{ rtLeadersStore.error }}</p>
          <div class="mt-3">
            <BaseButton label="Coba lagi" size="sm" @click="rtLeadersStore.fetchRtLeaders(true)" />
          </div>
        </div>

        <!-- Table stays up when a forced refresh fails so the visitor keeps the last good roster -->
        <div
          v-if="!rtLeadersStore.error || hasRows"
          class="rounded-btn mt-5 overflow-hidden border border-gray-300 bg-white shadow-xs"
        >
          <div class="relative overflow-x-auto">
            <table
              class="w-full min-w-[600px] table-fixed divide-y divide-gray-200 text-left text-sm text-gray-800"
            >
              <caption class="sr-only">
                <template v-if="hasAddressData">
                  Daftar Ketua RT Kelurahan Manggar beserta nomor RT, nama, kontak, dan alamat
                </template>
                <template v-else>
                  Daftar Ketua RT Kelurahan Manggar beserta nomor RT, nama, dan kontak
                </template>
              </caption>
              <thead class="bg-brand-navy text-sm font-semibold text-white sm:text-base">
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
                  <td class="px-4 py-4 sm:px-6">
                    <span class="block h-4 w-10 animate-pulse rounded bg-gray-200"></span>
                  </td>
                  <td class="px-4 py-4 sm:px-6">
                    <span class="block h-4 w-40 animate-pulse rounded bg-gray-200"></span>
                  </td>
                  <td class="px-4 py-4 sm:px-6">
                    <span class="block h-4 w-32 animate-pulse rounded bg-gray-200"></span>
                  </td>
                  <td v-if="hasAddressData" class="px-4 py-4 sm:px-6">
                    <span class="block h-4 w-48 animate-pulse rounded bg-gray-200"></span>
                  </td>
                </tr>
              </tbody>

              <tbody
                v-else-if="paginatedLeaders.length > 0"
                class="divide-y divide-gray-200 bg-white"
              >
                <tr
                  v-for="leader in paginatedLeaders"
                  :key="leader.rtNumber"
                  class="transition-colors hover:bg-gray-50/75"
                >
                  <th
                    scope="row"
                    class="text-brand-navy px-4 py-4 align-top font-semibold whitespace-nowrap sm:px-6"
                  >
                    {{ leader.rtNumber }}
                  </th>
                  <td class="px-4 py-4 align-top break-words text-gray-800 sm:px-6">
                    {{ leader.name }}
                  </td>
                  <td class="px-4 py-4 align-top whitespace-nowrap text-gray-800 sm:px-6">
                    <a
                      v-if="leader.phoneIsWhatsapp && isDialable(leader.phone)"
                      :href="`https://wa.me/${whatsappNumber(leader.phone)}`"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-brand-navy focus-visible:outline-brand-navy font-medium underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {{ formatPhone(leader.phone) }}
                      <span class="sr-only">(WhatsApp, tautan eksternal, terbuka di tab baru)</span>
                    </a>
                    <a
                      v-else-if="isDialable(leader.phone)"
                      :href="telHref(leader.phone)"
                      class="text-brand-navy focus-visible:outline-brand-navy font-medium underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {{ formatPhone(leader.phone) }}
                      <span class="sr-only">(panggilan telepon)</span>
                    </a>
                    <span v-else class="text-gray-700" data-test="rt-phone-placeholder">
                      {{ leader.phone.trim() || '—' }}
                    </span>
                  </td>
                  <td
                    v-if="hasAddressData"
                    class="px-4 py-4 align-top break-words text-gray-700 sm:px-6"
                  >
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

          <!-- Pagination: page size and page navigation, both client-side -->
          <div
            v-if="!showEmptyResult && !showNoData && filteredLeaders.length > 0"
            class="flex flex-col gap-4 border-t border-gray-200 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6"
            data-test="rt-pagination"
          >
            <div class="flex flex-wrap items-center gap-3 text-sm text-gray-700">
              <div class="flex items-center gap-2">
                <label for="page-size-select" class="text-xs font-medium text-gray-600 sm:text-sm">
                  Baris per halaman:
                </label>
                <select
                  id="page-size-select"
                  v-model.number="pageSize"
                  class="rounded-btn text-brand-navy focus-visible:outline-brand-navy border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
                  data-test="page-size-select"
                >
                  <option :value="10">10</option>
                  <option :value="25">25</option>
                  <option :value="50">50</option>
                  <option :value="100">100</option>
                </select>
              </div>

              <p class="text-xs text-gray-600 sm:text-sm" data-test="pagination-summary">
                Menampilkan
                <span class="text-brand-navy font-semibold"
                  >{{ startRowIndex }}–{{ endRowIndex }}</span
                >
                dari
                <span class="text-brand-navy font-semibold">{{ filteredLeaders.length }}</span>
                RT
              </p>
            </div>

            <nav
              v-if="totalPages > 1"
              aria-label="Navigasi halaman tabel Ketua RT"
              class="flex items-center gap-1 self-center sm:self-auto"
            >
              <button
                type="button"
                :disabled="currentPage === 1"
                aria-label="Halaman sebelumnya"
                class="rounded-btn text-brand-navy focus-visible:outline-brand-navy inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98] motion-reduce:transform-none disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:active:scale-100 border border-gray-300 hover:bg-gray-100 disabled:hover:bg-gray-50"
                data-test="pagination-prev"
                @click="goToPage(currentPage - 1)"
              >
                <svg
                  class="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="2"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M15.75 19.5L8.25 12l7.5-7.5"
                  />
                </svg>
                <span class="hidden sm:inline">Sebelumnya</span>
              </button>

              <span class="px-2 text-xs font-medium text-gray-700 sm:hidden">
                {{ currentPage }} / {{ totalPages }}
              </span>

              <ul class="hidden items-center gap-1 sm:flex">
                <li v-for="(item, idx) in paginationPages" :key="`page-${idx}`">
                  <span
                    v-if="item === 'ellipsis'"
                    class="flex min-h-[44px] min-w-[36px] items-center justify-center text-sm font-medium text-gray-400"
                    aria-hidden="true"
                  >
                    …
                  </span>
                  <button
                    v-else
                    type="button"
                    :aria-current="currentPage === item ? 'page' : undefined"
                    :aria-label="`Halaman ${item}`"
                    class="rounded-btn focus-visible:outline-brand-navy inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98] motion-reduce:transform-none"
                    :class="
                      currentPage === item
                        ? 'bg-brand-navy font-semibold text-white shadow-xs'
                        : 'text-brand-navy border border-gray-300 hover:bg-gray-100'
                    "
                    :data-test="`pagination-page-${item}`"
                    @click="goToPage(item)"
                  >
                    {{ item }}
                  </button>
                </li>
              </ul>

              <button
                type="button"
                :disabled="currentPage === totalPages"
                aria-label="Halaman selanjutnya"
                class="rounded-btn text-brand-navy focus-visible:outline-brand-navy inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98] motion-reduce:transform-none disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:active:scale-100 border border-gray-300 hover:bg-gray-100 disabled:hover:bg-gray-50"
                data-test="pagination-next"
                @click="goToPage(currentPage + 1)"
              >
                <span class="hidden sm:inline">Selanjutnya</span>
                <svg
                  class="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="2"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M8.25 4.5l7.5 7.5-7.5 7.5"
                  />
                </svg>
              </button>
            </nav>
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
