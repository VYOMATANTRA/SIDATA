import type { StoryContext, StorySeed } from './types.js';

/**
 * Persampahan & Bank Sampah Unit. Two kinds of content:
 *  - Bank Sampah Unit: prose and figures are COMPUTED from the BSU survey records already in the
 *    database (spatial_points, type bank_sampah), so no survey value is committed to the repo.
 *    Manager names, phones and addresses are stripped before the story sees a record. Volumes and
 *    money fields are not used: their units and magnitudes are inconsistent across units.
 *  - Program Eco Boba: facts from "Pelatihan Pengolahan Limbah Kemasan Plastik yang Tidak Bernilai
 *    Ekonomis Menjadi Eco Boba" (Juli 2026), cited by printed page label (Hal. 01-06, Page 07).
 *    Measured outputs and expected impact are kept apart, as the booklet itself does.
 */
const BSU_SOURCE = 'Kuesioner BSU, Monografi Kelurahan Manggar 2026';
const BOOKLET = 'Booklet Pelatihan Eco Boba, Juli 2026';

type Rec = Record<string, unknown>;
const txt = (r: Rec, k: string) => (typeof r[k] === 'string' ? (r[k] as string).trim() : '');
const num = (r: Rec, k: string): number | null => {
  const m = /\d+/.exec(txt(r, k));
  return m ? Number(m[0]) : null;
};
const year = (r: Rec): number | null => {
  const m = /(\d{4})/.exec(txt(r, 'Tahun berdiri'));
  return m ? Number(m[1]) : null;
};
const id = (n: number) => n.toLocaleString('id-ID');
const bsu = (ctx: StoryContext): Rec[] => ctx.points('bank_sampah');
const countIf = (rs: Rec[], f: (r: Rec) => boolean) => rs.filter(f).length;
const yes = (k: string) => (r: Rec) => txt(r, k).toLowerCase() === 'ya';
const has = (k: string, word: string) => (r: Rec) => txt(r, k).toLowerCase().includes(word);

/** Counts BSUs per waste type; spellings that differ only in case are one type. */
function jenisSampah(rs: Rec[]): [string, number][] {
  const c = new Map<string, { label: string; n: number }>();
  for (const r of rs) {
    const seen = new Set<string>();
    for (const raw of txt(r, 'Jenis sampah diterima').split(',')) {
      const t = raw.trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const e = c.get(key) ?? { label: t.charAt(0).toUpperCase() + t.slice(1), n: 0 };
      e.n += 1;
      c.set(key, e);
    }
  }
  return [...c.values()]
    .map((e): [string, number] => [e.label, e.n])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const KENDALA: [label: string, needle: string][] = [
  ['Sarana dan prasarana kurang', 'sarana dan prasarana'],
  ['Kesadaran dan dukungan warga kurang', 'kesadaran'],
  ['Jumlah nasabah masih sedikit', 'nasabah masih sedikit'],
  ['Modal atau dana operasional terbatas', 'modal'],
  ['Tenaga pengelola terbatas', 'tenaga pengelola'],
  ['Harga jual ke pengepul terlalu rendah', 'harga jual'],
  ['Akses informasi dan pelatihan terbatas', 'akses informasi'],
];

export const PERSAMPAHAN_STORY: StorySeed = {
  page: 'persampahan-dan-bank-sampah-unit',
  sections: [
    {
      chapter: 'bank-sampah-unit',
      section: 'ringkasan-bsu',
      title: 'Bank sampah unit di Manggar',
      body: (ctx) => {
        const rs = bsu(ctx);
        const aktif = countIf(rs, (r) => txt(r, 'Status') === 'Aktif');
        const nasabah = rs.map((r) => ({
          n: String(r['name']),
          v: num(r, 'Nasabah terdaftar') ?? 0,
        }));
        const total = nasabah.reduce((s, x) => s + x.v, 0);
        const top = [...nasabah].sort((a, b) => b.v - a.v)[0];
        const years = rs.map(year).filter((y): y is number => y !== null);
        const lama = years.filter((y) => y < 2020).length;
        const baru = years.filter((y) => y >= 2025).length;
        return [
          `Kuesioner BSU yang dihimpun untuk Monografi Kelurahan Manggar 2026 mencatat **${id(aktif)} bank sampah unit (BSU) aktif**. Bersama-sama mereka memiliki **${id(total)} nasabah terdaftar**: warga yang menabung sampah terpilah.`,
          top
            ? `Nasabah terbanyak tercatat di ${top.n} (${id(top.v)} nasabah). Besarnya berbeda jauh antar-BSU, dari belasan hingga lebih dari seratus nasabah.`
            : '',
          `BSU di Manggar masih muda. Hanya ${id(lama)} BSU yang berdiri sebelum 2020 (yang tertua pada ${Math.min(...years)}), sedangkan ${id(baru)} BSU baru berdiri pada 2025–2026.`,
        ]
          .filter(Boolean)
          .join('\n\n');
      },
      figure: (ctx) => ({
        kind: 'diagram',
        title: 'Nasabah terdaftar menurut BSU',
        source: BSU_SOURCE,
        bars: {
          unit: 'nasabah',
          items: bsu(ctx)
            .map((r) => ({ label: String(r['name']), value: num(r, 'Nasabah terdaftar') ?? 0 }))
            .sort((a, b) => b.value - a.value),
        },
      }),
    },
    {
      chapter: 'bank-sampah-unit',
      section: 'pengelolaan-bsu',
      title: 'Cara BSU dikelola',
      body: (ctx) => {
        const rs = bsu(ctx);
        const n = rs.length;
        const sk = countIf(rs, yes('SK kepengurusan'));
        const buku = countIf(rs, (r) => txt(r, 'Pembukuan keuangan') === 'Rutin');
        const pilah = countIf(rs, yes('Tempat pemilahan memadai'));
        const art = countIf(rs, yes('AD/ART'));
        const jadwal = countIf(rs, yes('Jadwal layanan rutin'));
        const dana = countIf(rs, has('Sumber dana', 'penjualan sampah'));
        return [
          `Dari ${id(n)} BSU, **${id(sk)} sudah memiliki SK kepengurusan** dan ${id(buku)} menjalankan pembukuan keuangan secara rutin. ${id(jadwal)} BSU memiliki jadwal layanan rutin bagi nasabahnya.`,
          `Sisi kelembagaan dan sarana masih tertinggal: hanya ${id(art)} BSU yang memiliki AD/ART dan ${id(pilah)} yang memiliki tempat pemilahan yang memadai.`,
          `${id(dana)} BSU mengandalkan hasil penjualan sampah sebagai sumber dana, sebagian dengan tambahan dari CSR perusahaan atau dana RT.`,
        ].join('\n\n');
      },
      figure: (ctx) => {
        const rs = bsu(ctx);
        return {
          kind: 'diagram',
          title: 'Jumlah BSU menurut aspek pengelolaan',
          source: BSU_SOURCE,
          bars: {
            unit: 'BSU',
            items: [
              { label: 'Memiliki SK kepengurusan', value: countIf(rs, yes('SK kepengurusan')) },
              {
                label: 'Pembukuan rutin',
                value: countIf(rs, (r) => txt(r, 'Pembukuan keuangan') === 'Rutin'),
              },
              { label: 'Jadwal layanan rutin', value: countIf(rs, yes('Jadwal layanan rutin')) },
              {
                label: 'Tempat pemilahan memadai',
                value: countIf(rs, yes('Tempat pemilahan memadai')),
              },
              { label: 'Memiliki AD/ART', value: countIf(rs, yes('AD/ART')) },
            ],
          },
        };
      },
    },
    {
      chapter: 'bank-sampah-unit',
      section: 'jenis-sampah-bsu',
      title: 'Sampah apa yang diterima BSU',
      body: (ctx) => {
        const rs = bsu(ctx);
        const n = rs.length;
        const list = jenisSampah(rs);
        const semua = list.filter(([, c]) => c === n).map(([t]) => t.toLowerCase());
        const jarang = list.filter(([, c]) => c <= 2).map(([t]) => t.toLowerCase());
        return [
          semua.length
            ? `Seluruh BSU menerima ${semua.join(' dan ')}. Di luar itu, tiap BSU menerima jenis sampah yang berbeda.`
            : 'Jenis sampah yang diterima berbeda di tiap BSU.',
          `Minyak jelantah dan sampah elektronik diterima di sebagian besar BSU.${jarang.length ? ` Jenis yang jarang diterima: ${jarang.join(', ')}.` : ''}`,
          'Kemasan plastik sachet dan bungkus jajanan tidak disebut secara khusus: sampah jenis ini umumnya tidak diterima pengepul. Persoalan itulah yang dijawab Program Eco Boba pada bab berikutnya.',
        ].join('\n\n');
      },
      figure: (ctx) => ({
        kind: 'diagram',
        title: 'Jumlah BSU menurut jenis sampah yang diterima',
        source: BSU_SOURCE,
        bars: {
          unit: 'BSU',
          items: jenisSampah(bsu(ctx))
            .slice(0, 12)
            .map(([label, value]) => ({ label, value })),
        },
      }),
    },
    {
      chapter: 'bank-sampah-unit',
      section: 'kendala-dan-harapan-bsu',
      title: 'Kendala dan harapan pengelola',
      body: (ctx) => {
        const rs = bsu(ctx);
        const k = KENDALA.map(([label, needle]) => ({
          label,
          c: countIf(rs, has('Kendala', needle)),
        })).sort((a, b) => b.c - a.c);
        const harap = (...w: string[]) =>
          countIf(rs, (r) => w.some((x) => txt(r, 'Harapan').toLowerCase().includes(x)));
        return [
          `Kendala yang paling sering disebut pengelola adalah **${k[0]!.label.toLowerCase()}** (${id(k[0]!.c)} BSU), disusul ${k[1]!.label.toLowerCase()} (${id(k[1]!.c)}) dan ${k[2]!.label.toLowerCase()} (${id(k[2]!.c)}).`,
          `Dalam jawaban terbuka, ${id(harap('pemerintah', 'kelurahan'))} BSU mengharapkan dukungan pemerintah, ${id(harap('timbangan', 'gudang', 'mesin', 'gerobak', 'sarana'))} menyebut kebutuhan sarana seperti timbangan, gudang, atau mesin, dan ${id(harap('pelatihan', 'sosialisasi'))} mengharapkan pelatihan atau sosialisasi.`,
          'Hitungan di atas berasal dari kata kunci pada jawaban bebas, sehingga menggambarkan kecenderungan, bukan angka pasti.',
        ].join('\n\n');
      },
      figure: (ctx) => ({
        kind: 'diagram',
        title: 'Jumlah BSU menurut kendala yang disebut',
        source: BSU_SOURCE,
        bars: {
          unit: 'BSU',
          items: KENDALA.map(([label, needle]) => ({
            label,
            value: countIf(bsu(ctx), has('Kendala', needle)),
          })).sort((a, b) => b.value - a.value),
        },
      }),
    },
    {
      chapter: 'program-eco-boba',
      section: 'masalah-kemasan-plastik',
      title: 'Plastik kemasan yang tidak laku dijual',
      body: [
        'Tim Desa Cantik ITK menemukan persoalan ini lewat laporan BSU dan pengamatan lapangan: **kemasan plastik seperti bungkus jajanan dan sachet** dianggap tidak bernilai ekonomis, sehingga pengepul cenderung tidak menerimanya dan sampah itu tidak terolah. Sebagian besar BSU belum memiliki mekanisme untuk mengelolanya sendiri (booklet Hal. 02).',
        'Menurut Ketua Ecco Walibar, kemasan seperti ini umumnya berakhir di TPA Manggar. Sebagai contoh bahwa plastik dapat berguna, booklet menyebut Pelita Borneo 38 yang mengolahnya menjadi ecobrick untuk dinding dan furnitur (Hal. 02).',
      ].join('\n\n'),
    },
    {
      chapter: 'program-eco-boba',
      section: 'rancangan-eco-boba',
      title: 'Mengapa Eco Boba',
      body: [
        'Dari diskusi dengan narasumber tentang siklus hidup sampah rumah tangga, ada tiga pilihan hasil olahan: ecobrick, eco enzim, dan **Eco Boba**. Dua yang pertama tidak dipilih karena sudah umum dan tutorialnya mudah ditemukan (Hal. 03).',
        'Eco Boba dipilih karena empat alasan:',
        '- **Kebaruan.** Belum banyak inisiatif serupa yang mengolah plastik kemasan menjadi isian.\n- **Jangkauan pasar.** Dapat dipakai sebagai isian bantal dan bean bag, dengan potensi di wisata pantai Manggar Baru.\n- **Mudah dikerjakan.** Tidak perlu keterampilan tinggi dan dapat dikerjakan di sela pekerjaan rumah.\n- **Dukungan alat.** Sebuah program CSR baru saja membagikan mesin pencacah yang membantu tahap awal.',
        'Sasaran peserta adalah perwakilan 14 BSU aktif di Manggar, perwakilan Kecamatan Balikpapan Timur, dan perwakilan Kelurahan Manggar. Program ini diprakarsai Tim Inovasi Sosial ITK melalui LPPM, di bawah Program Desa Cantik BPS (Hal. 01, 03).',
      ].join('\n\n'),
    },
    {
      chapter: 'program-eco-boba',
      section: 'pelaksanaan-pelatihan',
      title: 'Sehari memotong dan menjahit plastik',
      body: [
        'Pelatihan berlangsung pada **Juli 2026**, dibuka pukul 10.15 WITA dengan sambutan dari ITK, BPS Kota Balikpapan, Kecamatan Balikpapan Timur, dan Kelurahan Manggar. Hadir 58 peserta dari kalangan akademisi, pemerintah, dan masyarakat (Hal. 04).',
        'Sesi inti pertama adalah **pencacahan plastik** yang dipandu Tim Ecco Walibar: peserta menggunting kemasan plastik menjadi potongan kecil yang menggantikan dakron sebagai isian. Sesi kedua adalah **menjahit bantal**: cacahan dibungkus kantong LDPE, dimasukkan ke sarung bantal berukuran 42 × 84 cm, lalu sarungnya dijahit tangan hingga menjadi produk Eco Boba.',
        'Dua kelompok terbaik mendapat penghargaan dalam kategori "Paling Heboh & Kompak" dan "Paling Kreatif & Inovatif". Acara ditutup pukul 14.10 WITA (Hal. 04).',
      ].join('\n\n'),
    },
    {
      chapter: 'booklet-eco-boba',
      section: 'hasil-dan-dampak',
      title: 'Yang sudah terukur, yang masih harapan',
      body: [
        '**Hasil terukur.** Seluruh 58 peserta, dalam 5 kelompok, menyelesaikan pembuatan bantal Eco Boba, dengan tingkat penyelesaian tugas 100 persen tiap kelompok. Dihasilkan 5 bantal yang dibagikan sebagai produk contoh kepada Kelurahan Manggar, BPS, ITK, dan kedua narasumber (Hal. 05).',
        '**Harapan, belum terukur.** Narasumber Ecco Walibar memperkirakan plastik yang berakhir di TPA dapat berkurang drastis dan laju penambahan sampah di TPA Manggar, yang kapasitasnya disebut hampir penuh, dapat melambat. Perwakilan kelurahan berharap warga BSU terus berlatih secara mandiri, dan perwakilan kecamatan berharap keterampilan ini berlanjut di kelurahan lain (Hal. 05).',
        'Booklet tidak memuat berat atau volume sampah yang berhasil diolah maupun hasil survei umpan balik peserta, sehingga dampak terhadap TPA belum dapat dinyatakan sebagai hasil.',
      ].join('\n\n'),
      figure: () => ({
        kind: 'diagram',
        title: 'Hasil terukur pelatihan Eco Boba, Juli 2026',
        source: `${BOOKLET}, Hal. 05`,
        bars: {
          unit: 'jumlah',
          items: [
            { label: 'Peserta', value: 58 },
            { label: 'Kelompok', value: 5 },
            { label: 'Bantal dihasilkan', value: 5 },
          ],
        },
      }),
    },
    {
      chapter: 'booklet-eco-boba',
      section: 'keberlanjutan-dan-rekomendasi',
      title: 'Setelah pelatihan: apa berikutnya',
      body: [
        'Pelatihan menghasilkan produk nyata dan antusiasme peserta yang tinggi, tetapi booklet mencatat **belum ada mekanisme pemantauan atau tindak lanjut yang terstruktur**. Kegiatan ini berupa satu sesi tanpa kelanjutan (Hal. 06).',
        'Rekomendasinya:',
        '- **BPS** mempertimbangkan pendampingan atau pemantauan pascapelatihan.\n- **Kelurahan dan kecamatan** menunjuk pendamping atau penanggung jawab bagi peserta, dan mempertimbangkan replikasi di kelurahan lain.\n- **Peserta dan BSU** melanjutkan latihan Eco Boba secara mandiri. Narasumber melihat peluang berkembang menjadi usaha kecil.',
      ].join('\n\n'),
    },
    {
      chapter: 'booklet-eco-boba',
      section: 'booklet-lengkap',
      title: 'Baca booklet lengkapnya',
      body: [
        'Booklet "Pelatihan Pengolahan Limbah Kemasan Plastik yang Tidak Bernilai Ekonomis Menjadi Eco Boba" (Juli 2026) disusun sebagai dokumentasi dan pertanggungjawaban pelatihan kepada BPS sebagai pengampu Program Desa Cantik, sekaligus dipublikasikan untuk keterbukaan kepada publik (Hal. 01).',
        'Dokumen lengkapnya dapat diunduh di halaman **Publikasi**.',
      ].join('\n\n'),
    },
  ],
};
