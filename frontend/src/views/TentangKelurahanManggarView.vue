<script setup lang="ts">
import { computed, onMounted } from 'vue';
import TentangPageLayout from '../components/tentang/TentangPageLayout.vue';
import TentangBreadcrumb from '../components/tentang/TentangBreadcrumb.vue';
import TentangPhotoHero from '../components/tentang/TentangPhotoHero.vue';
import TentangStatHero from '../components/tentang/TentangStatHero.vue';
import TentangPotentialCard from '../components/tentang/TentangPotentialCard.vue';
import TentangPublicationCard from '../components/tentang/TentangPublicationCard.vue';
import TentangFeatureBand from '../components/tentang/TentangFeatureBand.vue';
import TentangResourceCard from '../components/tentang/TentangResourceCard.vue';
import StatCard from '../components/common/StatCard.vue';
import { useIndicatorsStore } from '../stores/indicators.store';
import type { TentangIconName } from '../components/tentang/TentangIcon.vue';
import heroImage from '@/assets/img/background_laman_depan_kelurahan.png';
import lurahPhoto from '@/assets/img/lurah_placeholder_sample.png';

interface PotentialItem {
  title: string;
  description: string;
  icon: TentangIconName;
}

const potentials: PotentialItem[] = [
  {
    title: 'Pesisir & Pariwisata',
    description: 'Memiliki kawasan pesisir dan potensi wisata.',
    icon: 'coast',
  },
  {
    title: 'Kependudukan',
    description: 'Data kependudukan menjadi dasar dalam memahami masyarakat.',
    icon: 'people',
  },
  {
    title: 'Lingkungan',
    description: 'Pengelolaan sampah dan lingkungan menjadi bagian penting.',
    icon: 'leaf',
  },
  {
    title: 'Data & Statistik',
    description: 'Data mendukung perencanaan dan pengambilan keputusan.',
    icon: 'chart',
  },
];

interface SotkItem {
  role: string;
  officialName: string;
  duties: string;
  notes?: string;
}

const sotkMembers: SotkItem[] = [
  {
    role: 'Lurah',
    officialName: 'Munir Achmad, S.E.',
    duties:
      'Memimpin, mengatur, membina, dan mengawasi penyelenggaraan pemerintahan kelurahan serta pelaksanaan pelimpahan wewenang dari Walikota Balikpapan.',
    notes: 'Penanggung jawab utama kelurahan',
  },
  {
    role: 'Sekretaris Kelurahan',
    officialName: 'Dalam proses penetapan definitif', // TODO: Masukkan nama definitif Sekretaris Kelurahan
    duties:
      'Mengkoordinasikan perencanaan, ketatausahaan, kepegawaian, perlengkapan, keuangan, serta pelayanan administrasi internal kelurahan.',
    notes: 'Koordinator administrasi & aparatur',
  },
  {
    role: 'Seksi Pemerintahan',
    officialName: 'Dalam proses penetapan definitif', // TODO: Masukkan nama definitif Kasi Pemerintahan
    duties:
      'Menyelenggarakan urusan administrasi pemerintahan umum, kependudukan, pertanahan, serta pembinaan organisasi Rukun Tetangga (RT).',
    notes: 'Pembinaan 100 RT & kependudukan',
  },
  {
    role: 'Seksi Ketenteraman dan Ketertiban',
    officialName: 'Dalam proses penetapan definitif', // TODO: Masukkan nama definitif Kasi Trantib
    duties:
      'Memelihara ketenteraman, ketertiban umum, penegakan peraturan daerah, perlindungan masyarakat, dan koordinasi pencegahan bencana.',
    notes: 'Ketertiban umum & Linmas',
  },
  {
    role: 'Seksi Pemberdayaan Masyarakat',
    officialName: 'Dalam proses penetapan definitif', // TODO: Masukkan nama definitif Kasi PM
    duties:
      'Memfasilitasi pemberdayaan masyarakat, pembinaan kelembagaan kemasyarakatan (LPM, PKK, Karang Taruna), lingkungan hidup, dan UMKM.',
    notes: 'Pengembangan masyarakat & Bank Sampah',
  },
  {
    role: 'Seksi Kesejahteraan Sosial',
    officialName: 'Dalam proses penetapan definitif', // TODO: Masukkan nama definitif Kasi Kesos
    duties:
      'Mengelola pelayanan bantuan sosial, pemutakhiran data kemiskinan, pembinaan kesehatan, kepemudaan, dan keagamaan.',
    notes: 'Jaminan sosial & pelayanan warga',
  },
];

const POPULATION_INDICATOR_SLUG = 'jumlah-penduduk';

const indicatorsStore = useIndicatorsStore();
onMounted(() => {
  void indicatorsStore.fetchBySlug(POPULATION_INDICATOR_SLUG);
});

const populationIndicator = computed(() => {
  return indicatorsStore.findBySlug(POPULATION_INDICATOR_SLUG);
});

const formattedPopulation = computed(() => {
  const indicator = populationIndicator.value;
  if (!indicator) return null;
  const num = Number(indicator.valueCurrent);
  if (!Number.isFinite(num)) return null;
  return {
    value: new Intl.NumberFormat('id-ID').format(num),
    unit: indicator.unit ?? 'jiwa',
    caption: `Total Penduduk Kelurahan Manggar (data ${indicator.periodCurrent})`,
    subcaption: `Berdasarkan data ${indicator.periodCurrent}`,
    hedgeNote: indicator.hedgeNote,
  };
});

const wilayahStats = [
  { icon: 'house', value: '100', label: 'Rukun Tetangga terdaftar' },
  { icon: 'density', value: 'Balikpapan Timur', label: 'Kecamatan, Kota Balikpapan' },
  { icon: 'ratio', value: 'Pesisir & Dataran', label: 'Potensi pantai & pertanian' },
  { icon: 'person', value: 'Desa Cantik', label: 'Kelurahan Cinta Statistik' },
];

const batasWilayah = [
  { arah: 'Sebelah Utara', wilayah: 'Kelurahan Karang Joang' },
  { arah: 'Sebelah Timur', wilayah: 'Kelurahan Manggar Baru' },
  { arah: 'Sebelah Selatan', wilayah: 'Selat Makassar' },
  { arah: 'Sebelah Barat', wilayah: 'Kelurahan Sepinggan dan Sepinggan Baru' },
];
</script>

<template>
  <TentangPageLayout>
    <TentangBreadcrumb label="Kelurahan Manggar" />

    <TentangPhotoHero
      eyebrow="Profil Kelurahan"
      title="Manggar"
      subtitle="Data, potensi, dan cerita di balik perkembangan Kelurahan Manggar."
      :image="heroImage"
    />

    <!-- 1. Loading state: skeleton pulse to prevent layout shift & false-empty flash -->
    <section
      v-if="indicatorsStore.isLoading && !formattedPopulation"
      class="bg-white px-4 py-10 sm:px-6 sm:py-12"
      aria-label="Memuat data kependudukan"
    >
      <div class="mx-auto max-w-5xl animate-pulse">
        <div class="h-4 w-32 rounded bg-gray-200"></div>
        <div class="mt-4 h-8 w-48 rounded bg-gray-200"></div>
        <div class="mt-3 h-4 w-64 rounded bg-gray-200"></div>
      </div>
    </section>

    <!-- 2. Loaded state: Stat hero with exact period snapshot & hedge note -->
    <TentangStatHero
      v-else-if="formattedPopulation"
      label="Sekilas Manggar"
      :value="formattedPopulation.value"
      :unit="formattedPopulation.unit"
      :caption="formattedPopulation.caption"
      :subcaption="formattedPopulation.subcaption"
      :hedge-note="formattedPopulation.hedgeNote"
    />

    <!-- 3. Error / missing state: explicit data-unavailable card -->
    <section
      v-else
      class="bg-white px-4 py-10 sm:px-6 sm:py-12"
      aria-labelledby="empty-pop-title"
    >
      <div class="mx-auto max-w-5xl">
        <p id="empty-pop-title" class="text-sm font-semibold tracking-[0.25em] text-brand-navy uppercase">
          Sekilas Manggar
        </p>
        <div class="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-6 text-gray-600">
          <p class="font-medium text-gray-800">Data Belum Tersedia</p>
          <p class="mt-1 text-sm text-gray-500">
            Informasi agregat jumlah penduduk terkini belum dipublikasikan atau gagal dimuat.
          </p>
        </div>
      </div>
    </section>

    <!-- Potensi Manggar -->
    <section class="bg-white px-4 py-10 sm:px-6 sm:py-12" aria-labelledby="potensi-title">
      <div class="mx-auto max-w-5xl">
        <h2 id="potensi-title" class="text-lg font-bold text-brand-navy">Potensi Manggar</h2>
        <ul class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:auto-rows-fr">
          <li v-for="item in potentials" :key="item.title" class="flex">
            <TentangPotentialCard
              :title="item.title"
              :description="item.description"
              :icon="item.icon"
              class="w-full"
            />
          </li>
        </ul>

        <div class="mt-4">
          <TentangPublicationCard
            title="Manggar Dalam Angka"
            description="Data & informasi statistik Kelurahan Manggar."
            cta-label="Segera Hadir"
          />
        </div>
      </div>
    </section>

    <!-- Rujukan data terpadu -->
    <TentangFeatureBand heading="Jelajahi Data Kelurahan Manggar">
      <div class="mt-4 flex flex-col gap-5 sm:flex-row items-stretch">
        <TentangResourceCard
          title="Peta Spasial RT dan Bank Sampah Unit"
          icon="map"
          cta-label="Peta Geospasial"
          class="flex-1"
        >
          Plot titik koordinat rumah seluruh ketua RT dan sebaran lokasi penimbangan sampah aktif
          di Balikpapan Timur.
        </TentangResourceCard>

        <TentangResourceCard title="Sistem SIDATA" icon="system" class="flex-1">
          Platform pencarian agregat kependudukan real-time, monitoring per RT, dan sinkronisasi
          metadata secara berkala tanpa hambatan.
        </TentangResourceCard>
      </div>
    </TentangFeatureBand>

    <!-- Pimpinan Kelurahan -->
    <section
      class="bg-white px-4 py-10 sm:px-6 sm:py-12"
      aria-labelledby="lurah-section-title"
    >
      <div class="mx-auto max-w-5xl">
        <h2 id="lurah-section-title" class="text-lg font-bold text-brand-navy">
          Pimpinan Kelurahan
        </h2>
        <p class="mt-2 max-w-3xl text-base text-gray-700">
          Kepemimpinan yang berdedikasi melayani warga dan mengawal keterbukaan data terpadu di
          Kelurahan Manggar.
        </p>

        <div
          class="mt-5 flex flex-col items-center gap-6 rounded-btn border border-gray-300 bg-white p-5 sm:flex-row sm:items-start sm:p-6"
        >
          <div class="flex shrink-0 flex-col items-center text-center sm:w-56">
            <div class="h-40 w-40 overflow-hidden rounded-full bg-brand-cyan sm:h-48 sm:w-48">
              <img
                :src="lurahPhoto"
                alt="Foto resmi Lurah Kelurahan Manggar"
                class="h-40 w-40 object-cover object-top sm:h-48 sm:w-48"
              />
            </div>
            <!-- Name & Title below the photo -->
            <div class="mt-4 flex flex-col items-center text-center">
              <h3 class="text-lg font-bold text-brand-navy">Munir Achmad, S.E.</h3>
              <p class="mt-0.5 text-sm font-medium text-gray-700">Lurah Kelurahan Manggar</p>
              <p class="text-xs text-gray-500">Pemerintah Kelurahan Manggar</p>
              <span
                class="mt-2.5 inline-block rounded-[5px] bg-brand-cyan px-3 py-1 text-xs font-semibold text-brand-navy"
              >
                Kepala Kelurahan
              </span>
            </div>
          </div>

          <div class="flex-1 space-y-4 text-left">
            <div class="space-y-3 text-base leading-relaxed text-gray-800">
              <p>
                Sebagai garda terdepan pelayanan pemerintah daerah bagi masyarakat di wilayah
                Balikpapan Timur, Kelurahan Manggar senantiasa berkomitmen untuk menghadirkan
                pelayanan yang ramah, akuntabel, dan transparan.
              </p>
              <p>
                Melalui integrasi program
                <strong class="font-semibold text-brand-navy">Kelurahan Cinta Statistik (Desa Cantik)</strong> serta peluncuran portal
                <strong class="font-semibold text-brand-navy">SIDATA</strong>, kami berikhtiar membangun tata kelola berbasis data akurat
                bersama 100 Rukun Tetangga (RT). Data yang tepat menjadi kompas kami dalam
                merencanakan program sosial, penanganan lingkungan, serta pemulihan ekonomi
                masyarakat yang berkelanjutan.
              </p>
            </div>

            <div class="border-t border-gray-200 pt-3 text-sm text-gray-600">
              <p class="font-medium text-brand-navy">Masa Bakti Jabatan</p>
              <p>Periode Berjalan &mdash; Kelurahan Manggar, Balikpapan Timur</p>
              <!-- TODO: Perbarui informasi masa bakti jika telah tersedia surat keputusan resmi -->
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Gambaran Umum Wilayah -->
    <section class="bg-brand-cyan px-4 py-10 sm:px-6 sm:py-12" aria-labelledby="wilayah-title">
      <div class="mx-auto max-w-5xl">
        <h2 id="wilayah-title" class="text-lg font-bold text-brand-navy">
          Gambaran Umum Wilayah
        </h2>
        <p class="mt-2 max-w-3xl text-base text-brand-navy/90">
          Karakteristik geografis dan pembagian administratif Kelurahan Manggar.
        </p>

        <div class="mt-5">
          <StatCard :items="wilayahStats" variant="light" title="Statistik Umum Wilayah" />
        </div>

        <div class="mt-6 rounded-btn border border-brand-navy/20 bg-white p-5">
          <h3 class="text-base font-bold text-brand-navy">Batas-Batas Wilayah Administratif:</h3>
          <ul class="mt-3 flex flex-wrap gap-x-6 gap-y-3 text-base text-gray-800">
            <li
              v-for="item in batasWilayah"
              :key="item.arah"
              class="flex w-full items-center gap-2 sm:w-[calc(50%-12px)]"
            >
              <span class="font-medium text-brand-navy">{{ item.arah }}:</span>
              <span>{{ item.wilayah }}</span>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- SOTK -->
    <section class="bg-white px-4 py-10 sm:px-6 sm:py-12" aria-labelledby="sotk-title">
      <div class="mx-auto max-w-5xl">
        <h2 id="sotk-title" class="text-lg font-bold text-brand-navy">
          Struktur Organisasi dan Tata Kerja (SOTK)
        </h2>
        <p class="mt-2 max-w-3xl text-base text-gray-700">
          Bagan tugas dan fungsi perangkat Kelurahan Manggar dalam menyelenggarakan urusan
          pemerintahan dan pelayanan warga.
        </p>

        <div class="mt-5 overflow-x-auto rounded-btn border border-gray-300 bg-white">
          <table class="min-w-full divide-y divide-gray-200 text-left text-sm text-gray-800">
            <caption class="sr-only">
              Daftar Struktur Organisasi dan Tata Kerja Kelurahan Manggar beserta tugas pokok dan
              fungsi
            </caption>
            <thead class="bg-brand-navy text-xs font-semibold tracking-wider text-white uppercase">
              <tr>
                <th scope="col" class="px-4 py-3.5 sm:px-6">Jabatan / Satuan Tugas</th>
                <th scope="col" class="px-4 py-3.5 sm:px-6">Nama Pejabat / Pelaksana</th>
                <th scope="col" class="px-4 py-3.5 sm:px-6">Tugas Pokok &amp; Tanggung Jawab</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white">
              <tr v-for="(member, idx) in sotkMembers" :key="idx" class="transition-colors">
                <th scope="row" class="px-4 py-4 align-top font-semibold text-brand-navy sm:px-6">
                  <div>{{ member.role }}</div>
                  <span v-if="member.notes" class="text-xs font-normal text-gray-600">
                    {{ member.notes }}
                  </span>
                </th>
                <td class="px-4 py-4 align-top text-gray-800 sm:px-6">
                  <span class="text-sm italic text-gray-600">{{ member.officialName }}</span>
                </td>
                <td class="px-4 py-4 leading-relaxed text-gray-700 sm:px-6 align-top">
                  {{ member.duties }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="mt-3 text-sm text-gray-600">
          * Data aparatur dan penugasan diperbarui secara berkala berdasarkan keputusan mutasi dan
          penetapan resmi Pemerintah Kota Balikpapan.
        </p>
      </div>
    </section>

    <!-- Visi & Misi -->
    <section class="bg-brand-cyan px-4 py-10 sm:px-6 sm:py-12" aria-labelledby="visi-misi-title">
      <div class="mx-auto max-w-5xl">
        <h2 id="visi-misi-title" class="text-lg font-bold text-brand-navy">
          Visi dan Misi Pelayanan
        </h2>
        <p class="mt-2 max-w-3xl text-base text-brand-navy/90">
          Arah dan komitmen bersama aparatur kelurahan dalam melayani masyarakat Manggar.
        </p>

        <div class="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          <article class="rounded-btn bg-white p-5">
            <h3 class="text-lg font-bold text-brand-navy">Visi Kelurahan</h3>
            <p class="mt-3 text-base leading-relaxed text-gray-800">
              &ldquo;Terwujudnya Pelayanan Publik Kelurahan Manggar yang Profesional, Akuntabel,
              Partisipatif, dan Berbasis Data Terpadu Menuju Masyarakat yang Maju dan
              Sejahtera.&rdquo;
            </p>
            <!-- TODO: Selaraskan rumusan visi dengan dokumen Rencana Strategis definitif -->
          </article>

          <article class="rounded-btn bg-white p-5">
            <h3 class="text-lg font-bold text-brand-navy">Misi Kelurahan</h3>
            <ol class="mt-3 list-decimal space-y-2 pl-5 text-base leading-relaxed text-gray-800">
              <li>
                Meningkatkan mutu pelayanan administrasi kelurahan yang cepat, tepat, dan transparan.
              </li>
              <li>
                Memperkuat peran kelembagaan 100 Rukun Tetangga (RT) dalam pemeliharaan lingkungan
                dan ketertiban.
              </li>
              <li>Mengoptimalkan pemanfaatan data statistik melalui inisiatif Kelurahan Cinta Statistik.</li>
              <li>
                Mendukung inovasi pemberdayaan masyarakat dan pengelolaan sampah terpadu (Eco Boba
                dan Bank Sampah Unit).
              </li>
            </ol>
          </article>
        </div>
      </div>
    </section>
  </TentangPageLayout>
</template>
