<script setup lang="ts">
import { computed } from 'vue';
import { getActivePinia } from 'pinia';
import TentangPageLayout from '../components/tentang/TentangPageLayout.vue';
import TentangBreadcrumb from '../components/tentang/TentangBreadcrumb.vue';
import TentangHeroPanel from '../components/tentang/TentangHeroPanel.vue';
import TentangNotice from '../components/tentang/TentangNotice.vue';
import TentangFeatureBand from '../components/tentang/TentangFeatureBand.vue';
import { useSettingsStore, DEFAULT_PUBLIC_SETTINGS } from '../stores/settings.store';

/**
 * Seluruh informasi administratif dan kebijakan operasional yang tidak dapat
 * dipastikan dari kode sumber dikumpulkan pada satu konstanta ini agar mudah
 * dilengkapi oleh pengelola sebelum atau sesudah rilis.
 */
const PRIVACY_POLICY_TODOS = {
  effectiveDate: '[TODO: tanggal berlaku efektif]',
  lastUpdatedDate: '[TODO: tanggal terakhir diperbarui]',
  dataController: '[TODO: nama pengendali data]',
  dataProtectionOfficer: '[TODO: nama atau jabatan petugas pelindungan data pribadi]',
  contactEmail: '[TODO: alamat email resmi kontak privasi]',
  inactiveAccountRetention:
    '[TODO: masa penyimpanan data akun yang dinonaktifkan dan prosedur penghapusan permanen]',
  auditLogRetention: '[TODO: masa penyimpanan catatan aktivitas keamanan (log audit)]',
  serverAccessLogPolicy:
    '[TODO: kebijakan pencatatan dan masa penyimpanan log akses server atau layanan hosting]',
  subjectRightsResponseTime:
    '[TODO: jangka waktu tanggapan atas permohonan pelaksanaan hak subjek data pribadi]',
} as const;

const settingsStore = getActivePinia() ? useSettingsStore() : null;

const institutionName = computed(
  () => settingsStore?.institutionName || DEFAULT_PUBLIC_SETTINGS.institutionName,
);
const contactAddress = computed(
  () => settingsStore?.contactAddress || DEFAULT_PUBLIC_SETTINGS.contactAddress,
);
const contactPhone = computed(
  () => settingsStore?.contactPhone || DEFAULT_PUBLIC_SETTINGS.contactPhone,
);

const tocItems = [
  { id: 'data-dikumpulkan', number: '1', label: 'Data yang Dikumpulkan' },
  { id: 'penggunaan-data', number: '2', label: 'Penggunaan Data' },
  { id: 'pihak-ketiga', number: '3', label: 'Pihak Ketiga' },
  { id: 'pihak-melihat-data', number: '4', label: 'Pihak yang Dapat Melihat Data' },
  { id: 'penyimpanan-keamanan', number: '5', label: 'Penyimpanan dan Keamanan' },
  { id: 'hak-pengguna', number: '6', label: 'Hak Pengguna dan Penghapusan Data' },
  { id: 'perubahan-kebijakan', number: '7', label: 'Perubahan Kebijakan' },
  { id: 'kontak', number: '8', label: 'Kontak' },
] as const;

const legalBases = [
  {
    title: 'Persetujuan yang sah secara eksplisit dari Subjek Data Pribadi',
    description:
      'Digunakan saat Anda mendaftarkan akun pengguna pada portal atau ketika Anda secara sukarela menekan tombol pengaktifan lokasi pada halaman Peta untuk menghitung jarak ke titik fasilitas maupun Ketua RT.',
  },
  {
    title:
      'Pelaksanaan tugas dalam rangka kepentingan umum, pelayanan publik, atau pelaksanaan kewenangan Pengendali Data Pribadi berdasarkan peraturan perundang-undangan',
    description:
      'Digunakan untuk menyajikan informasi pejabat kelurahan, direktori kontak pelayanan Ketua RT, serta informasi pengelola Bank Sampah Unit (BSU) guna mendukung keterbukaan informasi dan pelayanan warga di lingkungan kelurahan.',
  },
  {
    title:
      'Pemenuhan kewajiban hukum dan pemenuhan kepentingan yang sah lainnya dengan memperhatikan keseimbangan hak Subjek Data Pribadi',
    description:
      'Digunakan untuk menjaga keamanan sistem informasi, mencegah akses tidak sah maupun penyalahgunaan otomatis, serta mencatat riwayat perubahan konten oleh pengelola.',
  },
] as const;

const thirdPartyServices = [
  {
    name: 'Google (Layanan Masuk dengan Akun Google)',
    purpose: 'Autentikasi akun pengguna yang memilih masuk menggunakan akun Google.',
    dataProcessed:
      'Alamat email terverifikasi dan pengenal akun Google yang diteruskan saat proses masuk berlangsung.',
  },
  {
    name: 'Cloudflare Turnstile',
    purpose:
      'Perlindungan keamanan pada formulir pendaftaran, masuk, verifikasi kode sekali pakai (OTP), dan penyiapan kata sandi awal agar terhindar dari penyalahgunaan program otomatis.',
    dataProcessed:
      'Token pemeriksaan keamanan beserta alamat IP perangkat pengunjung saat formulir dikirimkan.',
  },
  {
    name: 'Resend',
    purpose:
      'Pengiriman pesan email otomatis yang berisi kode verifikasi 6 digit (OTP) saat pendaftaran akun baru.',
    dataProcessed:
      'Alamat email tujuan yang didaftarkan oleh pengguna beserta isi pesan verifikasi.',
  },
  {
    name: 'OpenStreetMap',
    purpose: 'Penyediaan gambar peta dasar pada halaman Peta interaktif dan pemilih titik lokasi.',
    dataProcessed:
      'Saat peta dimuat, peramban pengunjung mengambil gambar peta langsung dari server OpenStreetMap sehingga alamat IP dan permintaan peramban pengunjung terlihat oleh layanan OpenStreetMap.',
  },
  {
    name: 'Badan Meteorologi, Klimatologi, dan Geofisika (BMKG)',
    purpose: 'Penyediaan informasi prakiraan cuaca wilayah Kelurahan Manggar pada halaman Beranda.',
    dataProcessed:
      'Data cuaca diambil secara berkala oleh server SIDATA dari layanan terbuka BMKG tanpa mengirimkan data pribadi pengunjung kepada BMKG.',
  },
] as const;

const subjectRights = [
  {
    title: 'Hak atas Informasi, Akses, dan Salinan Data',
    description:
      'Anda berhak memperoleh kejelasan mengenai identitas pengelola, tujuan pemrosesan, serta meminta akses dan salinan atas data pribadi Anda yang tersimpan di dalam SIDATA.',
  },
  {
    title: 'Hak atas Perbaikan dan Pembaruan Data',
    description:
      'Anda berhak meminta perbaikan, pelengkapan, atau pembaruan apabila terdapat data pribadi yang tidak akurat atau sudah berubah. Pemilik akun juga dapat memperbarui kata sandi secara mandiri melalui menu profil setelah masuk.',
  },
  {
    title: 'Hak Menarik Kembali Persetujuan dan Mengakhiri Pemrosesan',
    description:
      'Anda berhak menarik kembali persetujuan pemrosesan data pribadi dan meminta pengakhiran pemrosesan. Untuk izin lokasi pada halaman Peta, Anda dapat mencabut izin kapan saja melalui pengaturan peramban atau menekan pilihan kembali ke pusat kelurahan.',
  },
  {
    title: 'Hak atas Penghapusan Data dan Pengajuan Keberatan',
    description:
      'Anda berhak meminta penonaktifan akun atau penghapusan data pribadi Anda yang tidak lagi diperlukan untuk tujuan pengumpulannya, serta mengajukan keberatan atas pemrosesan data pribadi sesuai ketentuan peraturan perundang-undangan.',
  },
] as const;
</script>

<template>
  <TentangPageLayout>
    <TentangBreadcrumb label="Kebijakan Privasi" parent-label="Beranda" parent-to="/" />

    <TentangHeroPanel
      title="Kebijakan Privasi"
      subtitle="Penjelasan mengenai pengumpulan, penggunaan, penyimpanan, dan pelindungan data pribadi pada portal Sistem Informasi Data Terpadu Kelurahan (SIDATA)."
    />

    <TentangNotice heading="Komitmen Pelindungan Data Pribadi">
      <p>
        Portal <strong>SIDATA</strong> merupakan portal profil dan informasi statistik terbuka untuk
        <strong>{{ institutionName }}</strong
        >, bukan sistem layanan administrasi kependudukan yang memungut berkas permohonan warga.
        Pengelolaan data pribadi di dalam portal ini disusun dengan merujuk pada
        <strong
          >Undang-Undang Republik Indonesia Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU
          PDP)</strong
        >.
      </p>
    </TentangNotice>

    <!-- Identitas Pengelola, Tanggal Berlaku, Dasar Pemrosesan & Navigasi Cepat -->
    <section
      class="bg-white px-4 py-10 sm:px-6 sm:py-12"
      aria-labelledby="identitas-pengelola-title"
    >
      <div class="mx-auto max-w-5xl space-y-8">
        <div>
          <h2 id="identitas-pengelola-title" class="text-brand-navy text-lg font-bold">
            Informasi Dokumen &amp; Identitas Pengelola Data
          </h2>
          <p class="text-text-muted mt-2 max-w-3xl text-base">
            Keterangan waktu pemberlakuan kebijakan serta pihak yang bertanggung jawab atas
            pemrosesan data pribadi di portal SIDATA.
          </p>

          <dl
            class="rounded-btn divide-border border-border mt-5 grid grid-cols-1 divide-y border bg-white sm:grid-cols-2 sm:divide-y-0"
          >
            <div class="sm:border-border p-5 sm:border-r sm:border-b">
              <dt class="text-text-muted text-xs font-semibold tracking-wider uppercase">
                Tanggal Berlaku Efektif
              </dt>
              <dd class="text-brand-navy mt-1 text-base font-semibold">
                {{ PRIVACY_POLICY_TODOS.effectiveDate }}
              </dd>
            </div>
            <div class="sm:border-border p-5 sm:border-b">
              <dt class="text-text-muted text-xs font-semibold tracking-wider uppercase">
                Terakhir Diperbarui
              </dt>
              <dd class="text-brand-navy mt-1 text-base font-semibold">
                {{ PRIVACY_POLICY_TODOS.lastUpdatedDate }}
              </dd>
            </div>
            <div class="sm:border-border p-5 sm:border-r">
              <dt class="text-text-muted text-xs font-semibold tracking-wider uppercase">
                Pengendali Data Pribadi
              </dt>
              <dd class="text-brand-navy mt-1 text-base font-semibold">
                {{ PRIVACY_POLICY_TODOS.dataController }}
              </dd>
            </div>
            <div class="p-5">
              <dt class="text-text-muted text-xs font-semibold tracking-wider uppercase">
                Petugas Pelindungan Data Pribadi
              </dt>
              <dd class="text-brand-navy mt-1 text-base font-semibold">
                {{ PRIVACY_POLICY_TODOS.dataProtectionOfficer }}
              </dd>
            </div>
          </dl>
        </div>

        <!-- Dasar Hukum & Dasar Pemrosesan (UU PDP) -->
        <div class="rounded-btn border-border bg-surface-muted border p-5 sm:p-6">
          <h3 class="text-brand-navy text-base font-bold">
            Dasar Hukum dan Dasar Pemrosesan Data Pribadi
          </h3>
          <p class="text-brand-navy mt-2 text-base leading-relaxed">
            Pemrosesan data pribadi pada SIDATA dilaksanakan berdasarkan ketentuan dalam
            <strong>UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP)</strong> dengan
            dasar pemrosesan meliputi:
          </p>
          <ul class="text-brand-navy mt-4 space-y-3 text-base">
            <li
              v-for="basis in legalBases"
              :key="basis.title"
              class="rounded-btn border-border border bg-white p-4"
            >
              <p class="text-brand-navy font-semibold">{{ basis.title }}</p>
              <p class="text-text-muted mt-1 text-sm leading-relaxed">{{ basis.description }}</p>
            </li>
          </ul>
        </div>

        <!-- Daftar Isi -->
        <nav
          aria-label="Daftar isi kebijakan privasi"
          class="rounded-btn border-border border bg-white p-5"
        >
          <p class="text-brand-navy text-sm font-bold tracking-wide uppercase">
            Ringkasan Bagian Kebijakan
          </p>
          <ol
            class="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-flow-col sm:grid-cols-2 sm:grid-rows-4"
          >
            <li v-for="item in tocItems" :key="item.id">
              <a
                :href="`#${item.id}`"
                class="text-brand-navy focus-visible:outline-brand-navy inline-flex items-baseline gap-2 rounded-xs py-1 font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <span class="shrink-0 font-bold">{{ item.number }}.</span>
                <span>{{ item.label }}</span>
              </a>
            </li>
          </ol>
        </nav>
      </div>
    </section>

    <!-- 1. Data yang Dikumpulkan -->
    <section
      id="data-dikumpulkan"
      class="bg-surface-muted px-4 py-10 sm:px-6 sm:py-12"
      aria-labelledby="section-1-title"
    >
      <div class="mx-auto max-w-5xl space-y-6">
        <div>
          <h2 id="section-1-title" class="text-brand-navy text-lg font-bold">
            1. Data yang Dikumpulkan
          </h2>
          <p class="text-brand-navy mt-2 max-w-3xl text-base leading-relaxed">
            SIDATA hanya mengumpulkan dan memproses data yang diperlukan sesuai dengan cara Anda
            menggunakan portal ini:
          </p>
        </div>

        <div class="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div class="rounded-btn border-border border bg-white p-5">
            <h3 class="text-brand-navy text-base font-bold">
              a. Pengunjung Umum (Tanpa Akun) &amp; Fitur Lokasi Peta
            </h3>
            <p class="text-brand-navy mt-2 text-sm leading-relaxed">
              Warga dapat membaca seluruh halaman cerita statistik, katalog publikasi, daftar Ketua
              RT, dan peta interaktif tanpa perlu mendaftar atau masuk ke akun.
            </p>
            <p class="text-brand-navy mt-2 text-sm leading-relaxed">
              <strong>Tidak ada analitik perilaku atau pelacak iklan:</strong> Aplikasi SIDATA tidak
              memasang layanan analitik pelacak perilaku pengunjung maupun pelacak periklanan pihak
              ketiga.
            </p>
            <p class="text-brand-navy mt-2 text-sm leading-relaxed">
              <strong>Lokasi pengunjung di halaman Peta:</strong> Apabila Anda menekan tombol untuk
              mengaktifkan lokasi pada halaman Peta, peramban akan membaca koordinat lokasi
              perangkat Anda hanya untuk menghitung jarak ke titik fasilitas atau RT. Titik lokasi
              tersebut <strong>hanya disimpan sementara di memori peramban</strong> selama sesi tab
              berlangsung dan <strong>tidak pernah dikirim atau disimpan ke server SIDATA</strong>.
            </p>
          </div>

          <div class="rounded-btn border-border border bg-white p-5">
            <h3 class="text-brand-navy text-base font-bold">
              b. Pengguna Terdaftar (Pengguna, Editor, Administrator)
            </h3>
            <p class="text-brand-navy mt-2 text-sm leading-relaxed">
              Bagi pengguna yang membuat akun atau diberikan akses pengelola, sistem menyimpan:
            </p>
            <ul class="text-brand-navy mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
              <li>Alamat email dan status verifikasi email.</li>
              <li>
                Kata sandi akun (hanya untuk akun biasa, disimpan dalam bentuk tersandi satu arah
                yang tidak dapat dikembalikan ke teks aslinya).
              </li>
              <li>
                Pengenal akun Google (apabila pengguna memilih masuk melalui layanan akun Google).
              </li>
              <li>
                Peran akses di dalam sistem (Pengguna, Editor, atau Administrator), status kewajiban
                penggantian kata sandi awal, serta waktu pembuatan dan pembaruan akun.
              </li>
              <li>
                Kode verifikasi sekali pakai (OTP) dalam bentuk tersandi satu arah beserta batas
                waktu berlaku dan jumlah percobaan selama proses aktivasi email.
              </li>
            </ul>
          </div>

          <div class="rounded-btn border-border border bg-white p-5">
            <h3 class="text-brand-navy text-base font-bold">
              c. Cookie, Penyimpanan Peramban, dan Catatan Keamanan
            </h3>
            <ul class="text-brand-navy mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
              <li>
                <strong>Cookie sesi dan keamanan:</strong> Digunakan untuk menjaga sesi masuk yang
                aktif, memverifikasi proses masuk melalui Google, serta melindungi formulir dari
                pemalsuan permintaan lintas situs.
              </li>
              <li>
                <strong>Penyimpanan lokal peramban:</strong> Digunakan secara terbatas untuk
                menyimpan alamat halaman tujuan sementara saat proses masuk, token sementara saat
                pengguna diwajibkan mengganti kata sandi pada login pertama, serta preferensi
                tampilan ciut/lebar menu samping pada halaman pengelola.
              </li>
              <li>
                <strong>Catatan aktivitas keamanan aplikasi:</strong> Saat terjadi aktivitas
                autentikasi (seperti masuk, keluar, atau verifikasi akun) maupun perubahan konten
                oleh pengelola, aplikasi mencatat jenis aktivitas, waktu, alamat email dan peran
                pelaku, alamat IP, serta informasi peramban/perangkat.
              </li>
              <li>
                <strong>Log akses server atau layanan hosting:</strong>
                {{ PRIVACY_POLICY_TODOS.serverAccessLogPolicy }}.
              </li>
            </ul>
          </div>

          <div class="rounded-btn border-border border bg-white p-5">
            <h3 class="text-brand-navy text-base font-bold">
              d. Data Pejabat, Ketua RT, dan Pengelola Komunitas
            </h3>
            <p class="text-brand-navy mt-2 text-sm leading-relaxed">
              Untuk keperluan keterbukaan informasi dan pelayanan masyarakat di wilayah
              {{ institutionName }}, pengelola memasukkan data publik melalui sistem pengelolaan
              konten berupa:
            </p>
            <ul class="text-brand-navy mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
              <li>
                Nama, nomor RT, nomor telepon/WhatsApp pelayanan, alamat, dan titik koordinat lokasi
                Ketua RT.
              </li>
              <li>
                Nama pengelola, nomor telepon, alamat, dan titik lokasi Bank Sampah Unit (BSU).
              </li>
              <li>
                Nama dan jabatan pimpinan serta perangkat kelurahan pada Struktur Organisasi dan
                Tata Kerja (SOTK), serta nama dan afiliasi penulis pada halaman Cerita.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- 2. Penggunaan Data -->
    <section
      id="penggunaan-data"
      class="bg-white px-4 py-10 sm:px-6 sm:py-12"
      aria-labelledby="section-2-title"
    >
      <div class="mx-auto max-w-5xl">
        <h2 id="section-2-title" class="text-brand-navy text-lg font-bold">2. Penggunaan Data</h2>
        <p class="text-text-muted mt-2 max-w-3xl text-base">
          Data yang dikumpulkan digunakan semata-mata untuk penyelenggaraan layanan portal SIDATA:
        </p>

        <ul class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <li class="rounded-btn border-border border bg-white p-5">
            <h3 class="text-brand-navy text-base font-bold">
              Penyajian Informasi Publik Kelurahan
            </h3>
            <p class="text-brand-navy mt-1.5 text-sm leading-relaxed">
              Menampilkan statistik sektoral, narasi cerita wilayah, katalog publikasi resmi, peta
              sebaran fasilitas, serta direktori kontak Ketua RT dan Bank Sampah Unit agar mudah
              diakses oleh warga.
            </p>
          </li>
          <li class="rounded-btn border-border border bg-white p-5">
            <h3 class="text-brand-navy text-base font-bold">
              Autentikasi dan Pengelolaan Hak Akses
            </h3>
            <p class="text-brand-navy mt-1.5 text-sm leading-relaxed">
              Memverifikasi identitas pengguna melalui kode OTP email atau akun Google, mengelola
              sesi masuk, serta memastikan hanya Editor dan Administrator berwenang yang dapat
              memperbarui data portal.
            </p>
          </li>
          <li class="rounded-btn border-border border bg-white p-5">
            <h3 class="text-brand-navy text-base font-bold">Keamanan Sistem dan Audit Aktivitas</h3>
            <p class="text-brand-navy mt-1.5 text-sm leading-relaxed">
              Mencegah percobaan masuk tanpa izin dan serangan otomatis, membatasi laju permintaan
              berlebihan berdasarkan alamat IP atau akun, serta menelusuri riwayat perubahan konten
              dan peristiwa keamanan.
            </p>
          </li>
          <li class="rounded-btn border-border border bg-white p-5">
            <h3 class="text-brand-navy text-base font-bold">
              Perhitungan Jarak Titik Lokasi di Perangkat
            </h3>
            <p class="text-brand-navy mt-1.5 text-sm leading-relaxed">
              Menghitung jarak antara posisi pengunjung (apabila izin lokasi diaktifkan) dengan
              titik Ketua RT, Bank Sampah Unit, atau fasilitas umum langsung di dalam peramban
              pengunjung.
            </p>
          </li>
        </ul>
      </div>
    </section>

    <!-- 3. Pihak Ketiga -->
    <section
      id="pihak-ketiga"
      class="bg-surface-muted px-4 py-10 sm:px-6 sm:py-12"
      aria-labelledby="section-3-title"
    >
      <div class="mx-auto max-w-5xl space-y-5">
        <div>
          <h2 id="section-3-title" class="text-brand-navy text-lg font-bold">3. Pihak Ketiga</h2>
          <p class="text-brand-navy mt-2 max-w-3xl text-base leading-relaxed">
            SIDATA tidak menjual atau menyewakan data pribadi kepada pihak mana pun. Untuk
            menjalankan fungsi teknis tertentu, portal ini terintegrasi dengan layanan pihak ketiga
            berikut:
          </p>
        </div>

        <div class="rounded-btn border-border overflow-x-auto border bg-white">
          <table class="divide-border text-brand-navy min-w-full divide-y text-left text-sm">
            <caption class="sr-only">
              Daftar layanan pihak ketiga yang digunakan oleh portal SIDATA
            </caption>
            <thead class="bg-brand-navy text-xs font-semibold tracking-wider text-white uppercase">
              <tr>
                <th scope="col" class="px-4 py-3.5 sm:px-6">Layanan Pihak Ketiga</th>
                <th scope="col" class="px-4 py-3.5 sm:px-6">Fungsi pada SIDATA</th>
                <th scope="col" class="px-4 py-3.5 sm:px-6">Data yang Diproses</th>
              </tr>
            </thead>
            <tbody class="divide-border divide-y bg-white">
              <tr v-for="service in thirdPartyServices" :key="service.name">
                <th scope="row" class="text-brand-navy px-4 py-4 align-top font-semibold sm:px-6">
                  {{ service.name }}
                </th>
                <td class="text-brand-navy px-4 py-4 align-top leading-relaxed sm:px-6">
                  {{ service.purpose }}
                </td>
                <td class="text-text-muted px-4 py-4 align-top leading-relaxed sm:px-6">
                  {{ service.dataProcessed }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="rounded-btn border-brand-navy/20 text-brand-navy border bg-white p-5 text-sm">
          <p class="leading-relaxed">
            <strong>Pemberitahuan pemrosesan lintas negara:</strong> Penyedia layanan pihak ketiga
            di atas (Google, Cloudflare, Resend, dan OpenStreetMap) mengoperasikan infrastruktur
            global sehingga dapat memproses data teknis terkait pada server yang berlokasi di luar
            wilayah Negara Kesatuan Republik Indonesia sesuai kebijakan privasi masing-masing
            layanan, dan alamat IP perangkat pengunjung terlihat langsung oleh server OpenStreetMap
            pada saat peramban memuat peta interaktif.
          </p>
        </div>
      </div>
    </section>

    <!-- 4. Pihak yang Dapat Melihat Data -->
    <section
      id="pihak-melihat-data"
      class="bg-white px-4 py-10 sm:px-6 sm:py-12"
      aria-labelledby="section-4-title"
    >
      <div class="mx-auto max-w-5xl">
        <h2 id="section-4-title" class="text-brand-navy text-lg font-bold">
          4. Pihak yang Dapat Melihat Data
        </h2>
        <p class="text-text-muted mt-2 max-w-3xl text-base">
          Akses terhadap data di dalam SIDATA dibatasi berdasarkan sifat data dan peran pengguna:
        </p>

        <div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div class="rounded-btn border-border border bg-white p-5">
            <h3 class="text-brand-navy text-base font-bold">Masyarakat Umum (Publik)</h3>
            <p class="text-brand-navy mt-2 text-sm leading-relaxed">
              Dapat melihat data statistik agregat, artikel cerita, dokumen publikasi yang telah
              diterbitkan, daftar pejabat kelurahan (SOTK), nama penulis cerita, serta nama, nomor
              telepon/WhatsApp pelayanan, alamat, dan titik lokasi Ketua RT maupun pengelola Bank
              Sampah Unit yang dipublikasikan.
            </p>
          </div>

          <div class="rounded-btn border-border border bg-white p-5">
            <h3 class="text-brand-navy text-base font-bold">Editor Konten</h3>
            <p class="text-brand-navy mt-2 text-sm leading-relaxed">
              Dapat menambah dan memperbarui data indikator statistik, konten cerita, katalog
              publikasi, titik peta, dan direktori Ketua RT, serta melihat ringkasan perubahan
              konten terbaru. Editor tidak memiliki akses ke daftar akun pengguna maupun catatan
              aktivitas keamanan lengkap.
            </p>
          </div>

          <div class="rounded-btn border-border border bg-white p-5">
            <h3 class="text-brand-navy text-base font-bold">Administrator</h3>
            <p class="text-brand-navy mt-2 text-sm leading-relaxed">
              Memiliki akses penuh untuk mengelola akun dan peran pengguna, mengaktifkan atau
              menonaktifkan akun, mengatur konfigurasi portal, serta meninjau catatan aktivitas
              keamanan aplikasi untuk keperluan pengawasan dan pengamanan sistem.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- 5. Penyimpanan dan Keamanan -->
    <section
      id="penyimpanan-keamanan"
      class="bg-surface-muted px-4 py-10 sm:px-6 sm:py-12"
      aria-labelledby="section-5-title"
    >
      <div class="mx-auto max-w-5xl space-y-6">
        <div>
          <h2 id="section-5-title" class="text-brand-navy text-lg font-bold">
            5. Penyimpanan dan Keamanan
          </h2>
          <p class="text-brand-navy mt-2 max-w-3xl text-base leading-relaxed">
            SIDATA menerapkan langkah pengamanan teknis sesuai fungsi nyata yang terdapat di dalam
            sistem:
          </p>
        </div>

        <div class="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div class="rounded-btn border-border border bg-white p-5">
            <h3 class="text-brand-navy text-base font-bold">Langkah Pengamanan Data</h3>
            <ul class="text-brand-navy mt-2.5 list-disc space-y-2 pl-5 text-sm leading-relaxed">
              <li>
                <strong>Penyandian kata sandi dan kode OTP:</strong> Kata sandi akun dan kode
                verifikasi sekali pakai (OTP) disimpan dalam bentuk tersandi satu arah yang tidak
                dapat dikembalikan ke teks aslinya. Kata sandi, token sesi, dan kode OTP tidak
                dicatat dalam catatan aktivitas keamanan aplikasi.
              </li>
              <li>
                <strong>Pengamanan sesi dan formulir:</strong> Cookie sesi diamankan agar tidak
                dapat dibaca oleh skrip berbahaya di peramban, cookie sementara untuk proses masuk
                Google disandikan, dan setiap permintaan perubahan data dilindungi dari pemalsuan
                permintaan lintas situs.
              </li>
              <li>
                <strong>Penghapusan metadata foto otomatis:</strong> Setiap foto yang diunggah oleh
                pengelola melalui sistem diproses ulang secara otomatis untuk menghapus metadata
                bawaan kamera (termasuk informasi koordinat lokasi pengambilan foto) sebelum
                disajikan kepada publik.
              </li>
              <li>
                <strong>Pelindungan catatan keamanan:</strong> Catatan aktivitas keamanan aplikasi
                dilindungi dari pengubahan isi maupun penghapusan sembarangan dari dalam aplikasi.
              </li>
            </ul>
          </div>

          <div class="rounded-btn border-border border bg-white p-5">
            <h3 class="text-brand-navy text-base font-bold">Masa Penyimpanan (Retensi) Data</h3>
            <ul class="text-brand-navy mt-2.5 list-disc space-y-2 pl-5 text-sm leading-relaxed">
              <li>
                <strong>Sesi masuk dan kode OTP:</strong> Token akses aktif hanya disimpan di memori
                peramban selama sesi berlangsung, cookie pembaruan sesi masuk berlaku selama 24 jam
                (atau sampai pengguna keluar), dan kode OTP berlaku selama 15 menit dengan batas
                maksimal 5 kali percobaan gagal.
              </li>
              <li>
                <strong>Berkas media yang tidak terpakai:</strong> Berkas foto atau dokumen unggahan
                pengelola yang batal dipasang atau telah dilepas dari konten publik akan dibersihkan
                melalui proses pemeliharaan terjadwal setelah melewati masa tenggang.
              </li>
              <li>
                <strong>Data akun yang dinonaktifkan:</strong>
                {{ PRIVACY_POLICY_TODOS.inactiveAccountRetention }}.
              </li>
              <li>
                <strong>Catatan aktivitas keamanan (log audit):</strong> Sistem mendukung pengaturan
                masa simpan per tingkat keparahan aktivitas dan pembersihan berkala atas catatan
                lama yang telah melewati batas masa simpan (kecuali catatan tingkat kritis yang
                belum ditinjau Administrator). Kebijakan masa simpan operasional mengacu pada
                {{ PRIVACY_POLICY_TODOS.auditLogRetention }}.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- 6. Hak Pengguna dan Penghapusan Data -->
    <section
      id="hak-pengguna"
      class="bg-white px-4 py-10 sm:px-6 sm:py-12"
      aria-labelledby="section-6-title"
    >
      <div class="mx-auto max-w-5xl space-y-6">
        <div>
          <h2 id="section-6-title" class="text-brand-navy text-lg font-bold">
            6. Hak Pengguna dan Penghapusan Data
          </h2>
          <p class="text-text-muted mt-2 max-w-3xl text-base">
            Sesuai dengan <strong>UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi</strong>,
            Anda memiliki hak-hak sebagai Subjek Data Pribadi berikut:
          </p>
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div
            v-for="right in subjectRights"
            :key="right.title"
            class="rounded-btn border-border border bg-white p-5"
          >
            <h3 class="text-brand-navy text-base font-bold">{{ right.title }}</h3>
            <p class="text-brand-navy mt-1.5 text-sm leading-relaxed">{{ right.description }}</p>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div class="rounded-btn border-border bg-surface-muted border p-5">
            <h3 class="text-brand-navy text-base font-bold">
              Mekanisme Penonaktifan &amp; Penghapusan Akun Pengguna
            </h3>
            <p class="text-brand-navy mt-2 text-sm leading-relaxed">
              Ketika permohonan penghapusan akun diproses oleh Administrator, sistem melakukan
              <strong>penonaktifan akun</strong> (<em>soft-delete</em>) yang secara langsung
              mencabut seluruh sesi masuk aktif dan menghentikan akses akun tersebut ke dalam
              sistem. Sistem <strong>tidak melakukan penghapusan permanen secara otomatis</strong>
              pada saat akun dinonaktifkan guna menjaga keutuhan riwayat pengelolaan data.
            </p>
            <p class="text-brand-navy mt-2 text-sm leading-relaxed">
              Ketentuan masa simpan data akun nonaktif dan prosedur penghapusan permanen mengikuti:
              {{ PRIVACY_POLICY_TODOS.inactiveAccountRetention }}.
            </p>
          </div>

          <div class="rounded-btn border-border bg-surface-muted border p-5">
            <h3 class="text-brand-navy text-base font-bold">
              Mekanisme Koreksi atau Penghapusan bagi Pihak Tanpa Akun
            </h3>
            <p class="text-brand-navy mt-2 text-sm leading-relaxed">
              Bagi Ketua RT, pengelola Bank Sampah Unit (BSU), perangkat kelurahan, maupun pihak
              lain yang tidak memiliki akun pengguna namun data nama, jabatan, nomor
              telepon/WhatsApp, alamat, atau titik lokasinya ditampilkan pada halaman publik SIDATA,
              Anda berhak mengajukan koreksi, pembaruan, atau penghapusan data tersebut.
            </p>
            <p class="text-brand-navy mt-2 text-sm leading-relaxed">
              Permohonan dapat disampaikan kepada pengelola data melalui kontak resmi di bawah ini
              atau secara langsung melalui Kantor {{ institutionName }} agar diperbarui atau dihapus
              oleh Editor/Administrator melalui sistem pengelolaan konten. Jangka waktu tanggapan
              permohonan mengacu pada: {{ PRIVACY_POLICY_TODOS.subjectRightsResponseTime }}.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- 7. Perubahan Kebijakan -->
    <section
      id="perubahan-kebijakan"
      class="bg-surface-muted px-4 py-10 sm:px-6 sm:py-12"
      aria-labelledby="section-7-title"
    >
      <div class="mx-auto max-w-5xl">
        <h2 id="section-7-title" class="text-brand-navy text-lg font-bold">
          7. Perubahan Kebijakan
        </h2>
        <div class="rounded-btn border-border mt-4 border bg-white p-5 sm:p-6">
          <p class="text-brand-navy text-base leading-relaxed">
            Kebijakan Privasi ini dapat ditinjau dan diperbarui dari waktu ke waktu untuk
            menyesuaikan dengan perkembangan fitur pada portal SIDATA, prosedur operasional
            pengelolaan data di lingkungan {{ institutionName }}, maupun perubahan peraturan
            perundang-undangan yang berlaku. Setiap perubahan akan dipublikasikan pada halaman ini
            beserta pembaruan keterangan tanggal di bagian atas dokumen.
          </p>
        </div>
      </div>
    </section>

    <!-- 8. Kontak -->
    <section
      id="kontak"
      class="bg-white px-4 py-10 sm:px-6 sm:py-12"
      aria-labelledby="section-8-title"
    >
      <div class="mx-auto max-w-5xl">
        <h2 id="section-8-title" class="text-brand-navy text-lg font-bold">8. Kontak</h2>
        <p class="text-text-muted mt-2 max-w-3xl text-base">
          Apabila Anda memiliki pertanyaan mengenai Kebijakan Privasi ini atau ingin mengajukan
          permohonan terkait hak Subjek Data Pribadi Anda, silakan hubungi pengelola melalui saluran
          berikut:
        </p>

        <dl
          class="rounded-btn divide-border border-border mt-5 grid grid-cols-1 divide-y border bg-white sm:grid-cols-2 sm:divide-y-0"
        >
          <div class="sm:border-border p-5 sm:border-r sm:border-b">
            <dt class="text-text-muted text-xs font-semibold tracking-wider uppercase">
              Pengendali Data Pribadi
            </dt>
            <dd class="text-brand-navy mt-1 text-base font-semibold">
              {{ PRIVACY_POLICY_TODOS.dataController }}
            </dd>
          </div>
          <div class="sm:border-border p-5 sm:border-b">
            <dt class="text-text-muted text-xs font-semibold tracking-wider uppercase">
              Petugas Pelindungan Data Pribadi
            </dt>
            <dd class="text-brand-navy mt-1 text-base font-semibold">
              {{ PRIVACY_POLICY_TODOS.dataProtectionOfficer }}
            </dd>
          </div>
          <div class="sm:border-border p-5 sm:border-r">
            <dt class="text-text-muted text-xs font-semibold tracking-wider uppercase">
              Email Kontak Privasi
            </dt>
            <dd class="text-brand-navy mt-1 text-base font-semibold">
              {{ PRIVACY_POLICY_TODOS.contactEmail }}
            </dd>
          </div>
          <div class="p-5">
            <dt class="text-text-muted text-xs font-semibold tracking-wider uppercase">
              Alamat Kantor &amp; Telepon Layanan
            </dt>
            <dd class="text-brand-navy mt-1 text-sm leading-relaxed">
              <p class="font-semibold">{{ institutionName }}</p>
              <p>{{ contactAddress }}</p>
              <p class="mt-1">Telp. {{ contactPhone }}</p>
            </dd>
          </div>
        </dl>
      </div>
    </section>

    <TentangFeatureBand heading="Permohonan Informasi Publik (PPID)">
      <p class="text-brand-navy mt-2 max-w-3xl text-base">
        Untuk permohonan data atau dokumen informasi publik berdasarkan UU No. 14 Tahun 2008 tentang
        Keterbukaan Informasi Publik, silakan pelajari panduan alur resmi menuju PPID Pemerintah
        Kota Balikpapan.
      </p>
      <div class="mt-5">
        <RouterLink
          to="/permintaan-data"
          class="rounded-btn bg-brand-navy hover:bg-brand-navy-deep focus-visible:outline-brand-navy inline-flex min-h-[44px] items-center justify-center gap-2 px-5 py-2.5 text-base font-medium text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span>Lihat Panduan Permintaan Data</span>
          <span aria-hidden="true">&rarr;</span>
        </RouterLink>
      </div>
    </TentangFeatureBand>
  </TentangPageLayout>
</template>
