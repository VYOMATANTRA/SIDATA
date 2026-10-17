<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import TentangPageLayout from '../components/tentang/TentangPageLayout.vue';
import TentangBreadcrumb from '../components/tentang/TentangBreadcrumb.vue';
import TentangHeroPanel from '../components/tentang/TentangHeroPanel.vue';
import BaseButton from '../components/common/BaseButton.vue';
import { useRtLeadersStore } from '../stores/rtLeaders.store';

const rtLeadersStore = useRtLeadersStore();

onMounted(() => {
  void rtLeadersStore.fetchRtLeaders();
});

const query = ref('');
const currentPage = ref(1);
const pageSize = ref(10);

/** Digits-only form of the query, so "007" still matches RT 7. */
const queryAsNumber = computed<number | null>(() => {
  const trimmed = query.value.trim();
  return /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : null;
});

/**
 * Filtering runs entirely client-side over the full roster (SPEC §8): no server
 * round-trip. An empty query returns every row, so the default state is the complete table.
 */
const filteredLeaders = computed(() => {
  const term = query.value.trim().toLowerCase();

  if (term === '') {
    return rtLeadersStore.rtLeaders;
  }

  return rtLeadersStore.rtLeaders.filter((leader) => {
    if (queryAsNumber.value !== null && leader.rtNumber === queryAsNumber.value) {
      return true;
    }
    if (String(leader.rtNumber).includes(term)) {
      return true;
    }
    return leader.name.toLowerCase().includes(term);
  });
});

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
 * Generates an accessible, bounded pagination item list with ellipsis windowing.
 * Never exceeds 7 items to avoid layout shift and wrapped rows.
 */
const paginationPages = computed<(number | 'ellipsis')[]>(() => {
  const total = totalPages.value;
  const current = currentPage.value;

  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
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

watch([query, pageSize], () => {
  currentPage.value = 1;
});

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
  () => !rtLeadersStore.isLoading && !rtLeadersStore.error && !hasRows.value,
);

const countSummary = computed(() => {
  const total = 100;
  const filtered = filteredLeaders.value.length;
  if (filtered === 0) {
    return `Menampilkan 0 dari ${total} RT`;
  }
  if (filtered === 1) {
    return `Menampilkan 1 dari ${total} RT`;
  }
  if (pageSize.value >= filtered && currentPage.value === 1 && !isFiltered.value) {
    return `Menampilkan ${filtered} dari ${total} RT`;
  }
  if (isFiltered.value) {
    return `Menampilkan ${startRowIndex.value}–${endRowIndex.value} dari ${filtered} RT (total ${total} RT)`;
  }
  return `Menampilkan ${startRowIndex.value}–${endRowIndex.value} dari ${total} RT`;
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
 * WhatsApp requires an international MSISDN. Survey data mixes formats — the
 * seeded roster stores local `08…` numbers — so a leading 0 is rewritten to
 * Indonesia's country code (62) before building the wa.me link.
 */
function whatsappNumber(value: string): string {
  const digits = digitsOnly(value);
  return digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
}

/**
 * Display grouping (0812 5356 695) matching the source list, so a long mobile
 * number stays readable in the table cell. Anything that is not the local
 * `08…` form is shown exactly as recorded.
 */
function formatPhone(value: string): string {
  const digits = digitsOnly(value);
  if (!digits.startsWith('0') || digits.length < 10 || digits.length > 13) {
    return value;
  }
  const head = digits.slice(0, 4);
  const middle = digits.slice(4, 8);
  const rest = digits.slice(8);
  return rest === '' ? `${head} ${middle}` : `${head} ${middle} ${rest}`;
}
</script>

<template>
  <TentangPageLayout>
    <TentangBreadcrumb label="Ketua RT" parent-label="Beranda" parent-to="/" />

    <TentangHeroPanel
      title="Ketua RT Kelurahan Manggar"
      subtitle="Direktori 100 Rukun Tetangga beserta kontak ketua RT. Cari langsung di tabel berdasarkan nomor RT atau nama."
    />

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
        <div v-else class="mt-5 rounded-btn border border-gray-300 bg-white shadow-xs">
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 text-left text-sm text-gray-800">
              <caption class="sr-only">
                <template v-if="hasAddressData">
                  Daftar Ketua RT Kelurahan Manggar beserta nomor RT, nama, kontak, dan alamat
                </template>
                <template v-else>
                  Daftar Ketua RT Kelurahan Manggar beserta nomor RT, nama, dan kontak
                </template>
              </caption>
              <thead class="bg-brand-navy text-xs font-semibold tracking-wider text-white uppercase">
                <tr>
                  <th scope="col" class="px-4 py-3.5 sm:px-6">No. RT</th>
                  <th scope="col" class="px-4 py-3.5 sm:px-6">Nama Ketua RT</th>
                  <th scope="col" class="px-4 py-3.5 sm:px-6">Kontak</th>
                  <th v-if="hasAddressData" scope="col" class="px-4 py-3.5 sm:px-6">Alamat</th>
                </tr>
              </thead>

              <!-- Loading skeleton keeps the table's shape -->
              <tbody v-if="rtLeadersStore.isLoading" class="divide-y divide-gray-200 bg-white">
                <tr v-for="row in 5" :key="`skeleton-${row}`" aria-hidden="true">
                  <td class="px-4 py-4 sm:px-6"><span class="block h-4 w-10 animate-pulse rounded bg-gray-200"></span></td>
                  <td class="px-4 py-4 sm:px-6"><span class="block h-4 w-40 animate-pulse rounded bg-gray-200"></span></td>
                  <td class="px-4 py-4 sm:px-6"><span class="block h-4 w-32 animate-pulse rounded bg-gray-200"></span></td>
                  <td class="px-4 py-4 sm:px-6"><span class="block h-4 w-48 animate-pulse rounded bg-gray-200"></span></td>
                </tr>
              </tbody>

              <tbody v-else-if="paginatedLeaders.length > 0" class="divide-y divide-gray-200 bg-white">
                <tr
                  v-for="leader in paginatedLeaders"
                  :key="leader.rtNumber"
                  class="transition-colors hover:bg-gray-50/75"
                >
                  <th scope="row" class="px-4 py-4 align-top font-semibold text-brand-navy sm:px-6">
                    {{ leader.rtNumber }}
                  </th>
                  <td class="px-4 py-4 align-top text-gray-800 sm:px-6">{{ leader.name }}</td>
                  <td class="px-4 py-4 align-top text-gray-800 sm:px-6">
                    <a
                      v-if="leader.phoneIsWhatsapp"
                      :href="`https://wa.me/${whatsappNumber(leader.phone)}`"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="font-medium text-brand-navy underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
                    >
                      {{ formatPhone(leader.phone) }}
                      <span class="sr-only">(WhatsApp, tautan eksternal, terbuka di tab baru)</span>
                    </a>
                    <a
                      v-else
                      :href="`tel:${digitsOnly(leader.phone)}`"
                      class="font-medium text-brand-navy underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
                    >
                      {{ formatPhone(leader.phone) }}
                      <span class="sr-only">(panggilan telepon)</span>
                    </a>
                  </td>
                  <td v-if="hasAddressData" class="px-4 py-4 align-top text-gray-700 sm:px-6">
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

          <!-- Pagination Bar -->
          <div
            v-if="!showEmptyResult && !showNoData && filteredLeaders.length > 0"
            class="flex flex-col gap-4 border-t border-gray-200 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6"
            data-test="rt-pagination"
          >
            <!-- Page Size Selection & Position Summary -->
            <div class="flex flex-wrap items-center gap-3 text-sm text-gray-700">
              <div class="flex items-center gap-2">
                <label for="page-size-select" class="text-xs font-medium text-gray-600 sm:text-sm">
                  Baris per halaman:
                </label>
                <select
                  id="page-size-select"
                  v-model.number="pageSize"
                  class="rounded border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-medium text-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
                  data-test="page-size-select"
                >
                  <option :value="10">10</option>
                  <option :value="25">25</option>
                  <option :value="50">50</option>
                  <option :value="100">100</option>
                </select>
              </div>

              <span class="hidden text-gray-300 sm:inline" aria-hidden="true">•</span>

              <p class="text-xs text-gray-600 sm:text-sm" data-test="pagination-summary">
                Menampilkan <span class="font-semibold text-brand-navy">{{ startRowIndex }}–{{ endRowIndex }}</span> dari <span class="font-semibold text-brand-navy">{{ filteredLeaders.length }}</span> RT
              </p>
            </div>

            <!-- Page Navigation Controls -->
            <nav
              v-if="totalPages > 1"
              aria-label="Navigasi halaman tabel Ketua RT"
              class="flex items-center gap-1 self-center sm:self-auto"
            >
              <button
                type="button"
                :disabled="currentPage === 1"
                :aria-disabled="currentPage === 1"
                aria-label="Halaman sebelumnya"
                class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-btn border border-gray-300 px-3 py-2 text-sm font-medium text-brand-navy transition-colors duration-150 motion-reduce:transform-none hover:bg-gray-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
                data-test="pagination-prev"
                @click="goToPage(currentPage - 1)"
              >
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
                <span class="hidden sm:inline">Sebelumnya</span>
              </button>

              <span class="px-2 text-xs font-medium text-gray-700 sm:hidden" aria-live="polite">
                {{ currentPage }} / {{ totalPages }}
              </span>

              <ul class="hidden items-center gap-1 sm:flex" role="list">
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
                    class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-btn text-sm font-medium transition-colors duration-150 motion-reduce:transform-none active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
                    :class="
                      currentPage === item
                        ? 'bg-brand-navy text-white font-semibold shadow-xs'
                        : 'border border-gray-300 text-brand-navy hover:bg-gray-100'
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
                :aria-disabled="currentPage === totalPages"
                aria-label="Halaman selanjutnya"
                class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-btn border border-gray-300 px-3 py-2 text-sm font-medium text-brand-navy transition-colors duration-150 motion-reduce:transform-none hover:bg-gray-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
                data-test="pagination-next"
                @click="goToPage(currentPage + 1)"
              >
                <span class="hidden sm:inline">Selanjutnya</span>
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </nav>
          </div>
        </div>

        <p class="mt-3 text-sm text-gray-600">
          <template v-if="isFiltered">
            Pencarian hanya menyaring tabel; hapus filter untuk melihat seluruh 100 RT.
          </template>
          <template v-else>
            Gunakan kolom pencarian untuk menyaring nomor RT atau nama ketua secara langsung.
          </template>
        </p>
      </div>
    </section>
  </TentangPageLayout>
</template>
