<script setup lang="ts">
import TentangPageLayout from '../components/tentang/TentangPageLayout.vue';
import TentangBreadcrumb from '../components/tentang/TentangBreadcrumb.vue';
import TentangHeroPanel from '../components/tentang/TentangHeroPanel.vue';
import TentangFigureCard from '../components/tentang/TentangFigureCard.vue';
import TentangInfoCard from '../components/tentang/TentangInfoCard.vue';
import TentangFeatureBand from '../components/tentang/TentangFeatureBand.vue';
import TentangResourceCard from '../components/tentang/TentangResourceCard.vue';
import TentangTeamCard from '../components/tentang/TentangTeamCard.vue';
import TentangLogoRow from '../components/tentang/TentangLogoRow.vue';
import heroImage from '@/assets/img/background_laman_depan_kelurahan.png';
import prokerPlaceholder from '@/assets/img/proker-placeholder.svg';
import logoVyomatantra from '@/assets/img/logo_vyomatantra.png';
import logoItk from '@/assets/img/logo_itk.png';
import logoSdgsDesa from '@/assets/img/sdgs_desa.png';
import logoSdgs17 from '@/assets/img/17_kemitraan_pembangunan_desa.png';

interface InitiativeItem {
  title: string;
  description: string;
  note: string;
}

const initiatives: InitiativeItem[] = [
  {
    title: 'Pelatihan Eco Boba untuk Pengolahan Limbah Kemasan Plastik',
    description:
      'Pada Juli 2026, 58 peserta dalam lima kelompok mencacah kemasan plastik, memasukkannya ke kantong LDPE, lalu menjahit sarung bantal. Tiap kelompok menyelesaikan satu bantal: lima produk dengan tingkat penyelesaian tugas 100%.',
    note: 'Booklet menyebut pengembangan usaha kecil dan pengurangan sampah sebagai potensi. Belum ada pemantauan terstruktur setelah pelatihan.',
  },
  {
    title: 'Pembinaan & Pemetaan Bank Sampah Unit (BSU)',
    description:
      'Peta Ketua RT dan BSU Aktif Manggar menyajikan lokasi rumah ketua RT dan BSU berdasarkan survei lapangan langsung pada Juli 2026.',
    note: 'Sumber peta mencantumkan Tim Inovasi Sosial VYOMATANTRA ITK sebagai pelaksana survei.',
  },
  {
    title: 'Sistem Informasi Data Terpadu Kelurahan (SIDATA)',
    description:
      'Portal publik untuk menyimpan dan menyajikan data Kelurahan Manggar secara terstruktur, termasuk statistik, informasi wilayah, peta, dan publikasi.',
    note: 'SIDATA menyajikan informasi; pengumpulan dan pemutakhiran data dilakukan bersama mitra.',
  },
];

const collaborationLogos = [
  { src: logoItk, alt: 'Logo Institut Teknologi Kalimantan (ITK)' },
  { src: logoVyomatantra, alt: 'Logo Tim Inovasi Sosial VYOMATANTRA' },
];

interface ProkerAct {
  kicker: string;
  title: string;
  lead: string;
  body: string;
  activities: string[];
}

const prokerIntro = {
  lead: 'Proposal kegiatan merancang satu semester perubahan: menyiapkan, melaksanakan, mengukur, lalu menyerahkan.',
  body: 'Setiap bab bergerak mengikuti siklus statistik — pengumpulan, pengolahan, analisis, hingga penyajian data — dengan fokus tematik pada sektor pariwisata sebagai salah satu potensi unggulan Manggar.',
};

const prokerActs: ProkerAct[] = [
  {
    kicker: 'Bab 01 · Persiapan',
    title: 'Merapikan rencana sebelum menyentuh data',
    lead: 'Perjalanan dimulai dari meja, bukan dari lapangan.',
    body: 'Delapan mahasiswa tim menyusun proposal kegiatan, menetapkan tujuan dan sasaran, lalu menyusun rundown. Mereka duduk bersama anggota BPS dan pengurus Kelurahan Manggar untuk menyelaraskan jadwal, sebelum turun ke lapangan melakukan survei lokasi dan mengidentifikasi sasaran peserta. Materi pembinaan statistik dan literasi digital disusun, banner, poster, dan id card dirancang lalu dicetak.',
    activities: [
      'Pembentukan tim pelaksana dan pembagian tugas',
      'Penyusunan proposal kegiatan',
      'Menentukan tujuan dan sasaran',
      'Penyusunan rundown kegiatan',
      'Koordinasi awal dengan anggota BPS dan Kelurahan Manggar',
      'Survei lokasi kegiatan dan identifikasi sasaran peserta',
      'Penyusunan materi edukasi Pembinaan Statistik dan Literasi Digital',
      'Desain serta cetak banner, poster, dan id card',
    ],
  },
  {
    kicker: 'Bab 02 · Pelaksanaan',
    title: 'Membawa pendampingan ke halaman warga',
    lead: 'Puncak perjalanan adalah pelaksanaan sosialisasi.',
    body: 'Kuesioner after kegiatan disiapkan, rundown dan kuesioner difinalisasi, lalu kegiatan dipromosikan dan peserta diundang. Koordinasi teknis akhir bersama BPS dan pengurus Kelurahan Manggar ditutup dengan pemeriksaan perlengkapan. Pembinaan statistik dan literasi digital disampaikan bersama perangkat kelurahan, ketua RT, dan warga.',
    activities: [
      'Penyusunan kuesioner after kegiatan',
      'Finalisasi rundown kegiatan dan kuesioner after kegiatan',
      'Promosi kegiatan, undangan peserta, dan koordinasi teknis akhir bersama BPS dan pengurus Kelurahan Manggar',
      'Pelaksanaan sosialisasi',
    ],
  },
  {
    kicker: 'Bab 03 · Monitoring dan evaluasi',
    title: 'Mengukur kembali, bukan menebak',
    lead: 'Kegiatan tidak ditutup begitu acara selesai.',
    body: 'Tim menilai partisipasi dan persepsi warga, lalu mengevaluasi seluruh rangkaian kegiatan untuk melihat sejauh mana pendampingan sudah berjalan.',
    activities: ['Evaluasi partisipasi dan persepsi warga serta evaluasi seluruh kegiatan'],
  },
  {
    kicker: 'Bab 04 · Pelaporan dan tindak lanjut',
    title: 'Menyerahkan karya',
    lead: 'Tahap terakhir mengembalikan semua pekerjaan kepada mitra.',
    body: 'Laporan kegiatan difinalisasi, after movie dan artikel dibuat, lalu laporan diserahkan kepada mitra dan pihak pendukung. Luaran yang dicatat dalam proposal meliputi artikel di laman ITK/LPPM, after movie pada kanal YouTube prodi, dan HKI atas source code website.',
    activities: [
      'Finalisasi laporan kegiatan',
      'Pembuatan after movie dan artikel',
      'Penyerahan laporan kepada mitra dan pihak pendukung',
    ],
  },
];

const sdgsLogos = [
  { src: logoSdgsDesa, alt: 'Logo SDGs Desa' },
  { src: logoSdgs17, alt: 'Logo SDGs 17: Kemitraan untuk Pembangunan Desa' },
];

interface TeamMember {
  title: string;
  role: string;
  meta?: string;
}

const teamMembers: TeamMember[] = [
  { title: 'Naca Kirana Badarudin', role: 'Ketua Tim' },
  { title: 'Indah Rahma Mihadha', role: 'Sekretaris' },
  { title: 'Andi Naufal Nurfadhil', role: 'Bendahara' },
  { title: 'Muhammad Aditya Putra', role: 'Teknis' },
  { title: 'Muhammad Iqbal Ferhan', role: 'Teknis' },
  { title: 'Sulthan Farizan Fawwaz', role: 'Teknis' },
  { title: 'Andi Mushawwira Muchlis', role: 'PDD' },
  { title: 'Feby Anggraini', role: 'PDD' },
];

const supervisor = {
  title: 'Riki Herliansyah, S.Si., M.Stats., Ph.D.',
  role: 'Dosen Pembimbing',
  meta: 'Institut Teknologi Kalimantan (ITK)',
};
</script>

<template>
  <TentangPageLayout>
    <TentangBreadcrumb label="Inovasi Sosial VYOMATANTRA" />

    <TentangHeroPanel
      title="Inovasi Sosial VYOMATANTRA"
      subtitle="Data Tepat, Aksi Hebat. Kolaborasi pengabdian masyarakat antara Institut Teknologi Kalimantan (ITK) dan Kelurahan Manggar untuk menggerakkan kemandirian berbasis data, teknologi tepat guna, dan ekonomi sirkular."
    >
      <template #figure>
        <TentangFigureCard
          :image="heroImage"
          caption="Kantor Kelurahan Manggar, Balikpapan Timur — lokasi koordinasi kegiatan program Desa Cantik"
          source="Tim Inovasi Sosial VYOMATANTRA"
        />
      </template>
    </TentangHeroPanel>

    <div class="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-10 sm:px-6 sm:py-12">
      <TentangInfoCard heading="Latar Belakang" icon="info">
        <p>
          <strong>VYOMATANTRA</strong> adalah tim inovasi sosial yang diinisiasi oleh mahasiswa dan
          dosen pembimbing dari Institut Teknologi Kalimantan (ITK). Bergerak dengan semangat Tri
          Dharma Perguruan Tinggi, tim hadir di Kelurahan Manggar untuk menjembatani perkembangan
          teknologi digital dengan kearifan lokal masyarakat pesisir dan permukiman.
        </p>
        <p>
          Bersama Kelurahan Manggar, ketua RT, pengurus BSU, dan BPS Kota Balikpapan, tim mendukung
          pengumpulan, pengolahan, dan penyajian data kelurahan. Salah satu hasilnya adalah peta
          lokasi ketua RT dan BSU aktif.
        </p>
      </TentangInfoCard>

      <TentangInfoCard heading="Peran" icon="chart">
        <p>
          <strong>VYOMATANTRA</strong> mendampingi survei lapangan bersama mitra, mengumpulkan data
          spasial, mengompilasi data spasial tersebut, serta memetakan lokasi rumah ketua RT dan BSU
          aktif di Kelurahan Manggar. Monografi juga mencatat pendataan partisipatif bersama
          perangkat kelurahan, ketua RT, dan pengurus BSU.
        </p>
      </TentangInfoCard>
    </div>

    <!-- Program kerja -->
    <section class="bg-white px-4 py-12 sm:px-6 sm:py-16" aria-labelledby="proker-title">
      <div class="mx-auto max-w-5xl">
        <p
          class="flex items-center justify-end gap-2 text-xs font-bold uppercase tracking-[0.2em] text-brand-navy"
        >
          <span class="h-5 w-0.5 bg-brand-cyan" aria-hidden="true"></span>
          Program Kerja
        </p>

        <h2
          id="proker-title"
          class="mt-3 text-3xl font-bold uppercase leading-[1.05] tracking-tight text-brand-navy sm:text-4xl"
        >
          Perjalanan <span class="font-normal">Program Kerja</span>
        </h2>

        <p
          class="mt-4 text-sm font-bold uppercase tracking-[0.18em] text-brand-teal-deep"
        >
          Empat bab dalam satu semester
        </p>

        <div class="mt-6 grid gap-8 lg:grid-cols-[1.7fr_1fr] lg:items-start lg:gap-12">
          <div class="space-y-4 text-base leading-relaxed text-brand-navy/90">
            <p>
              <strong class="font-bold text-brand-navy">{{ prokerIntro.lead }}</strong>
              {{ prokerIntro.body }}
            </p>
            <p>
              Setiap bab diuraikan sebagai rangkaian kerja, dari penyusunan rencana di meja hingga
              penyerahan laporan kepada mitra. Nama kegiatan diambil dari proposal, sementara catatan
              lapangan merujuk pada Monografi, peta, dan booklet pelatihan.
            </p>
          </div>

          <figure class="relative mx-auto w-52 sm:w-60">
            <span
              class="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-brand-cyan/30"
              aria-hidden="true"
            ></span>
            <div class="relative aspect-square overflow-hidden rounded-full ring-8 ring-brand-cyan/25">
              <img
                :src="heroImage"
                alt="Kantor Kelurahan Manggar, Balikpapan Timur"
                class="h-full w-full object-cover"
              />
            </div>
            <figcaption class="mt-4 text-center text-sm leading-snug text-brand-navy">
              Kantor Kelurahan Manggar, Balikpapan Timur
              <span class="block text-xs text-brand-navy/70">
                lokasi koordinasi kegiatan program Desa Cantik
              </span>
            </figcaption>
          </figure>
        </div>

        <div
          class="mt-10 flex flex-col gap-12 border-t border-brand-navy/10 pt-9"
          data-test="proker-acts"
        >
          <article
            v-for="(act, index) in prokerActs"
            :key="act.kicker"
            class="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-12"
            :class="index % 2 === 1 ? 'lg:flex-row-reverse' : ''"
          >
            <div class="flex-1">
              <p class="text-sm font-bold uppercase tracking-[0.18em] text-brand-teal-deep">
                {{ act.kicker }}
              </p>
              <h3 class="mt-2 text-lg font-bold leading-snug text-brand-navy">{{ act.title }}</h3>
              <p class="mt-3 text-base leading-relaxed text-brand-navy/90">
                <strong class="font-bold text-brand-navy">{{ act.lead }}</strong>
                {{ act.body }}
              </p>
              <ul class="mt-4 space-y-1.5">
                <li
                  v-for="activity in act.activities"
                  :key="activity"
                  class="flex gap-2.5 text-sm leading-relaxed text-brand-navy/80"
                >
                  <span class="mt-2 h-1.5 w-1.5 shrink-0 bg-brand-cyan" aria-hidden="true"></span>
                  {{ activity }}
                </li>
              </ul>
            </div>

            <figure class="w-full shrink-0 lg:w-72">
              <div class="relative">
                <span
                  class="absolute -bottom-3 -left-3 h-full w-full rounded-btn bg-brand-cyan/40"
                  aria-hidden="true"
                ></span>
                <img
                  :src="prokerPlaceholder"
                  :alt="`Placeholder foto kegiatan ${act.kicker}`"
                  class="relative aspect-[4/3] w-full rounded-btn object-cover"
                />
              </div>
              <figcaption class="mt-4 text-xs leading-relaxed text-brand-navy/70">
                Foto kegiatan pada bab ini belum tersedia.
              </figcaption>
            </figure>
          </article>
        </div>

        <p class="mt-9 border-t border-brand-navy/10 pt-5 text-sm leading-relaxed text-brand-navy/70">
          Program kerja ini disusun dalam Proposal Inovasi Sosial Desa Cantik Kelurahan Manggar
          (Februari 2026). Pelaksanaan di lapangan terdokumentasi dalam Monografi Kelurahan Manggar
          2026, Peta Ketua RT dan BSU Aktif Manggar, serta Booklet Pelatihan BSU.
        </p>
      </div>
    </section>

    <TentangFeatureBand heading="Inisiatif Unggulan di Kelurahan Manggar">
      <div class="mt-4 flex flex-col gap-5 lg:flex-row items-stretch">
        <TentangResourceCard
          v-for="item in initiatives"
          :key="item.title"
          :title="item.title"
          icon="leaf"
          class="flex-1"
        >
          <p>{{ item.description }}</p>
          <template #footer>
            <p class="text-sm text-white">
              <span class="font-bold">Catatan:</span> {{ item.note }}
            </p>
          </template>
        </TentangResourceCard>
      </div>
    </TentangFeatureBand>

    <!-- Kontribusi terhadap SDGs -->
    <section class="bg-white px-4 py-10 sm:px-6 sm:py-12" aria-labelledby="sdgs-title">
      <div class="mx-auto max-w-5xl">
        <h2 id="sdgs-title" class="text-lg font-bold text-brand-navy">
          Kontribusi Terhadap SDGs Desa
        </h2>
        <p class="mt-2 max-w-3xl text-base text-gray-700">
          Menyelaraskan kegiatan inovasi sosial dengan Tujuan Pembangunan Berkelanjutan (SDGs).
        </p>

        <div
          class="mt-5 flex flex-col items-center gap-6 rounded-btn border border-gray-300 bg-white p-5 sm:p-6 lg:flex-row lg:items-start"
        >
          <div class="flex shrink-0 items-center gap-4">
            <TentangLogoRow :logos="sdgsLogos" />
          </div>

          <div class="space-y-3 text-base leading-relaxed text-gray-800">
            <h3 class="text-lg font-bold text-brand-navy">
              SDG 17: Kemitraan untuk Mencapai Tujuan (Partnership for the Goals)
            </h3>
            <p>
              Program ini melibatkan Institut Teknologi Kalimantan (ITK), Kelurahan Manggar, BPS
              Kota Balikpapan, Kecamatan Balikpapan Timur, Ecco Walibar, Pelita Borneo 38, dan
              peserta BSU.
            </p>
            <ul class="list-disc space-y-1.5 pl-5 text-base">
              <li>
                <strong>SDG 12 (Konsumsi dan Produksi yang Bertanggung Jawab):</strong> Pelatihan
                Eco Boba mengolah kemasan plastik menjadi isian bantal.
              </li>
              <li>
                <strong>SDG 8 (Pekerjaan Layak dan Pertumbuhan Ekonomi):</strong> Booklet menyebut
                pengembangan usaha kecil dari produk Eco Boba sebagai potensi tindak lanjut.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- Dosen pembimbing -->
    <section class="bg-brand-cyan px-4 py-10 sm:px-6 sm:py-12" aria-labelledby="tim-title">
      <div class="mx-auto max-w-5xl">
        <h2 id="tim-title" class="text-lg font-bold text-brand-navy">Dosen Pembimbing</h2>
        <p class="mt-2 max-w-3xl text-base text-brand-navy/90">
          Proposal kegiatan mencantumkan dosen pembimbing tim pengusul berikut.
        </p>

        <div class="mt-5 max-w-md">
          <TentangTeamCard
            :title="supervisor.title"
            :role="supervisor.role"
            :meta="supervisor.meta"
          />
        </div>
      </div>
    </section>

    <!-- Tim Pelaksana VYOMATANTRA -->
    <section class="bg-white px-4 py-10 sm:px-6 sm:py-12" aria-labelledby="tim-pelaksana-title">
      <div class="mx-auto max-w-5xl">
        <h2 id="tim-pelaksana-title" class="text-lg font-bold text-brand-navy">
          Tim Pelaksana VYOMATANTRA
        </h2>
        <p class="mt-2 max-w-3xl text-base text-gray-700">
          Proposal kegiatan mencantumkan susunan delapan mahasiswa dan pembagian tugas tim pengusul.
          Tugas survei lapangan dan penyusunan peta dideskripsikan sebagai kerja tim bersama mitra.
        </p>

        <div class="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <TentangTeamCard
            v-for="member in teamMembers"
            :key="member.title"
            :title="member.title"
            :role="member.role"
            :meta="member.meta"
            :show-placeholder="true"
          />
        </div>

        <p class="mt-5 text-sm text-gray-600">
          Peran individu mengikuti Proposal Inovasi Sosial Desa Cantik Kelurahan Manggar (Februari
          2026). Kegiatan lapangan dan pemetaan tercatat dalam Monografi Kelurahan Manggar 2026
          serta Peta Ketua RT dan BSU Aktif Manggar.
        </p>
      </div>
    </section>

    <!-- Kolaborasi -->
    <section class="bg-white px-4 py-10 sm:px-6 sm:py-12" aria-labelledby="kolaborasi-title">
      <div class="mx-auto max-w-5xl">
        <h2 id="kolaborasi-title" class="text-lg font-bold text-brand-navy">Kolaborasi</h2>
        <div class="mt-5">
          <TentangLogoRow :logos="collaborationLogos" />
        </div>
      </div>
    </section>
  </TentangPageLayout>
</template>
