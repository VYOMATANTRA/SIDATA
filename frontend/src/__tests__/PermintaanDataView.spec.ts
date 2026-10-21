import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PermintaanDataView from '../views/PermintaanDataView.vue';

function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/permintaan-data', component: PermintaanDataView },
      { path: '/:pathMatch(.*)*', component: { template: '<div>Page</div>' } },
    ],
  });

  return { pinia, router };
}

describe('PermintaanDataView accessibility and content', () => {
  it('renders required semantic landmarks, skip link, and single h1', async () => {
    const { pinia, router } = mountView();
    await router.push('/permintaan-data');
    await router.isReady();

    const wrapper = mount(PermintaanDataView, {
      global: { plugins: [pinia, router] },
    });

    // Skip to content link
    const skipLink = wrapper.find('a[href="#main-content"]');
    expect(skipLink.exists()).toBe(true);

    // Landmarks
    expect(wrapper.find('nav[aria-label="Navigasi Utama"]').exists()).toBe(true);
    const mainLandmarks = wrapper.findAll('main#main-content');
    expect(mainLandmarks.length).toBe(1);
    expect(wrapper.find('footer').exists()).toBe(true);

    // Exactly one h1
    const h1List = wrapper.findAll('h1');
    expect(h1List.length).toBe(1);
    expect(h1List[0]?.text()).toContain('Permintaan Data & Informasi Publik');
  });

  it('displays clean scope notice without internal developer references', async () => {
    const { pinia, router } = mountView();
    await router.push('/permintaan-data');
    await router.isReady();

    const wrapper = mount(PermintaanDataView, {
      global: { plugins: [pinia, router] },
    });

    expect(wrapper.text()).toContain('Batasan Layanan Portal Informasi');
    expect(wrapper.text()).toContain('tidak menyimpan dokumen resmi PPID');
    expect(wrapper.text()).not.toContain('SPEC §');
    expect(wrapper.text()).not.toContain('external pointer');
  });

  it('renders procedural steps in a semantic ordered list <ol>', async () => {
    const { pinia, router } = mountView();
    await router.push('/permintaan-data');
    await router.isReady();

    const wrapper = mount(PermintaanDataView, {
      global: { plugins: [pinia, router] },
    });

    const ol = wrapper.find('[data-test="procedure-steps"]');
    expect(ol.exists()).toBe(true);

    const steps = ol.findAll('.procedure-step');
    expect(steps.length).toBe(5);
    expect(wrapper.text()).toContain('Periksa Ketersediaan Data Publik di Portal SIDATA');
    expect(wrapper.text()).toContain('Siapkan Dokumen Persyaratan Pemohon');
    expect(wrapper.text()).toContain('Ajukan Permohonan Resmi ke PPID Kota Balikpapan');
  });

  it('renders SLA service standards in a semantic accessible table with exact citation', async () => {
    const { pinia, router } = mountView();
    await router.push('/permintaan-data');
    await router.isReady();

    const wrapper = mount(PermintaanDataView, {
      global: { plugins: [pinia, router] },
    });

    const table = wrapper.find('table');
    expect(table.exists()).toBe(true);
    expect(table.find('caption').exists()).toBe(true);

    const colHeaders = table.findAll('th[scope="col"]');
    expect(colHeaders.length).toBe(3);

    const rowHeaders = table.findAll('tbody th[scope="row"]');
    expect(rowHeaders.length).toBeGreaterThanOrEqual(5);

    expect(wrapper.text()).toContain('Maksimal 10 Hari Kerja');
    expect(wrapper.text()).toContain('Bebas Biaya (Gratis)');
    expect(wrapper.text()).toContain(
      'Pasal 22 ayat (7) UU No. 14 Tahun 2008 tentang Keterbukaan Informasi Publik',
    );
    expect(wrapper.text()).toContain('Pasal 22 ayat (8) UU No. 14 Tahun 2008');
    expect(wrapper.text()).toContain('Pasal 36 ayat (1) UU No. 14 Tahun 2008');
    expect(wrapper.text()).toContain('SOP Layanan PPID Balikpapan');
    expect(wrapper.text()).toContain('Pasal 21 UU No. 14/2008');
  });

  it('renders external Balikpapan PPID link with accessible security attributes', async () => {
    const { pinia, router } = mountView();
    await router.push('/permintaan-data');
    await router.isReady();

    const wrapper = mount(PermintaanDataView, {
      global: { plugins: [pinia, router] },
    });

    const ppidLink = wrapper.find('a[href="https://ppid.balikpapan.go.id"]');
    expect(ppidLink.exists()).toBe(true);
    expect(ppidLink.attributes('target')).toBe('_blank');
    expect(ppidLink.attributes('rel')).toContain('noopener');
    expect(ppidLink.attributes('rel')).toContain('noreferrer');
    expect(ppidLink.text()).toContain('Tautan eksternal');
  });

  it('explains the three UU KIP information classes as a description list', async () => {
    const { pinia, router } = mountView();
    await router.push('/permintaan-data');
    await router.isReady();

    const wrapper = mount(PermintaanDataView, {
      global: { plugins: [pinia, router] },
    });

    const dl = wrapper.find('dl');
    expect(dl.exists()).toBe(true);

    const terms = dl.findAll('dt').map((node) => node.text());
    expect(terms).toContain('Informasi Berkala');
    expect(terms).toContain('Informasi Serta-merta');
    expect(terms).toContain('Informasi Setiap Saat');

    // Every term carries its own description
    expect(dl.findAll('dd').length).toBe(terms.length);
  });

  it('offers the escalation path from permohonan to keberatan and sengketa', async () => {
    const { pinia, router } = mountView();
    await router.push('/permintaan-data');
    await router.isReady();

    const wrapper = mount(PermintaanDataView, {
      global: { plugins: [pinia, router] },
    });

    const escalation = wrapper.find('section[aria-labelledby="eskalasi-title"]');
    expect(escalation.exists()).toBe(true);
    expect(escalation.text()).toContain('Jika Permohonan Ditolak atau Tidak Dijawab');
    expect(escalation.text()).toContain('Keberatan');

    const disputeNote = escalation
      .findAll('ol > li')
      .find((item) => item.text().includes('Sengketa'))
      ?.text();
    expect(disputeNote).toContain(
      'Permohonan penyelesaian sengketa diajukan paling lambat 14 hari kerja sejak tanggapan tertulis Atasan PPID diterima, atau sejak berakhirnya batas waktu 30 hari kerja pemberian tanggapan apabila tidak ada jawaban.',
    );
    expect(disputeNote).toContain('Pasal 13 PerKI No. 1 Tahun 2013');

    const keberatanLink = wrapper.find('a[href="https://ppid.balikpapan.go.id/ppid/keberatan"]');
    expect(keberatanLink.exists()).toBe(true);
    expect(keberatanLink.attributes('rel')).toContain('noopener');

    const disputeDocument = wrapper
      .find('section[aria-labelledby="sop-title"]')
      .findAll('article')
      .find((item) => item.text().includes('Prosedur Permohonan Penyelesaian Sengketa Informasi'));
    expect(disputeDocument?.text()).toContain(
      'Permohonan penyelesaian sengketa diajukan paling lambat 14 hari kerja sejak tanggapan tertulis Atasan PPID diterima, atau sejak berakhirnya batas waktu 30 hari kerja pemberian tanggapan apabila tidak ada jawaban.',
    );
    expect(disputeDocument?.text()).toContain('Pasal 13 PerKI No. 1 Tahun 2013');

    const perkiLink = wrapper.find('a[href="https://peraturan.go.id/files/bn649-2013.pdf"]');
    expect(perkiLink.exists()).toBe(true);
    expect(perkiLink.attributes('target')).toBe('_blank');
    expect(perkiLink.attributes('rel')).toContain('noopener');
    expect(perkiLink.attributes('rel')).toContain('noreferrer');
  });

  it('deep-links the official request form as the primary action', async () => {
    const { pinia, router } = mountView();
    await router.push('/permintaan-data');
    await router.isReady();

    const wrapper = mount(PermintaanDataView, {
      global: { plugins: [pinia, router] },
    });

    const formLink = wrapper.find('a[href="https://ppid.balikpapan.go.id/ppid/permohonan"]');
    expect(formLink.exists()).toBe(true);
    expect(formLink.text()).toContain('Isi Formulir Permohonan');
    expect(formLink.attributes('target')).toBe('_blank');
    expect(formLink.attributes('rel')).toContain('noreferrer');
  });

  it('uses the shared tentang layout and breadcrumb with a Beranda parent', async () => {
    const { pinia, router } = mountView();
    await router.push('/permintaan-data');
    await router.isReady();

    const wrapper = mount(PermintaanDataView, {
      global: { plugins: [pinia, router] },
    });

    const breadcrumb = wrapper.find('nav[aria-label="Breadcrumb"]');
    expect(breadcrumb.exists()).toBe(true);
    expect(breadcrumb.text()).toContain('Beranda');
    expect(breadcrumb.text()).toContain('Permintaan Data');

    // Permintaan Data is not part of the Tentang hub
    expect(breadcrumb.text()).not.toContain('Tentang');
  });

  it('directs residents to PPID without presenting kelurahan settings as PPID contacts', async () => {
    const { pinia, router } = mountView();
    await router.push('/permintaan-data');
    await router.isReady();

    const wrapper = mount(PermintaanDataView, {
      global: { plugins: [pinia, router] },
    });

    const main = wrapper.find('main#main-content');
    expect(main.find('section[aria-labelledby="meja-title"]').exists()).toBe(false);
    expect(main.text()).not.toContain('Kontak Resmi');
    expect(main.text()).not.toContain('WhatsApp/SMS PPID');

    const ppidLink = main.find('a[href="https://ppid.balikpapan.go.id"]');
    expect(ppidLink.exists()).toBe(true);
    expect(ppidLink.text()).toContain('Portal PPID Balikpapan');
    expect(ppidLink.attributes('target')).toBe('_blank');
    expect(ppidLink.attributes('rel')).toContain('noopener');
    expect(ppidLink.attributes('rel')).toContain('noreferrer');
  });

  it('renders the official Balikpapan PPID SOP documents with accessible download links', async () => {
    const { pinia, router } = mountView();
    await router.push('/permintaan-data');
    await router.isReady();

    const wrapper = mount(PermintaanDataView, {
      global: { plugins: [pinia, router] },
    });

    const sopSection = wrapper.find('section[aria-labelledby="sop-title"]');
    expect(sopSection.exists()).toBe(true);
    expect(sopSection.text()).toContain(
      'Dokumen Standar Operasional Prosedur (SOP) & Regulasi Resmi',
    );
    expect(sopSection.text()).toContain('Nomor 490/365/M/DISKOMINFO');
    expect(sopSection.text()).toContain('Nomor 490/378/M/DISKOMINFO');
    expect(sopSection.text()).toContain('SOP Pengumpulan Data Statistik Sektoral');
    expect(sopSection.text()).toContain('SOP Pengolahan Data Statistik Sektoral');
    expect(sopSection.text()).toContain('Maklumat Pelayanan Informasi Publik');

    const downloadLinks = sopSection.findAll('a[href$=".pdf"]');
    expect(downloadLinks.length).toBeGreaterThanOrEqual(7);
    for (const link of downloadLinks) {
      expect(link.attributes('target')).toBe('_blank');
      expect(link.attributes('rel')).toContain('noopener');
      expect(link.attributes('rel')).toContain('noreferrer');
      expect(link.text()).toContain('Tautan eksternal');
    }
  });

  it('lists the official 7 statutory grounds for submitting an information objection', async () => {
    const { pinia, router } = mountView();
    await router.push('/permintaan-data');
    await router.isReady();

    const wrapper = mount(PermintaanDataView, {
      global: { plugins: [pinia, router] },
    });

    expect(wrapper.text()).toContain('7 Alasan Sah Pengajuan Keberatan');
    expect(wrapper.text()).toContain('Permohonan informasi publik ditolak tanpa alasan yang sah');
    expect(wrapper.text()).toContain('Informasi berkala tidak disediakan');
    expect(wrapper.text()).toContain('Permintaan informasi tidak ditanggapi');
    expect(wrapper.text()).toContain('Biaya yang dikenakan untuk perolehan salinan tidak wajar');

    const keberatanPdfLink = wrapper.find(
      'a[href="https://ppid.balikpapan.go.id/assets/content_pdf/1699149426486.pdf"]',
    );
    expect(keberatanPdfLink.exists()).toBe(true);
    expect(keberatanPdfLink.attributes('target')).toBe('_blank');
    expect(keberatanPdfLink.attributes('rel')).toContain('noopener');
  });
});
