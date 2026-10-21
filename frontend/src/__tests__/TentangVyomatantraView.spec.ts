import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import TentangVyomatantraView from '../views/TentangVyomatantraView.vue';

function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/tentang', component: { template: '<div>Tentang</div>' } },
      { path: '/tentang/vyomatantra', component: TentangVyomatantraView },
      { path: '/:pathMatch(.*)*', component: { template: '<div>Page</div>' } },
    ],
  });

  return { pinia, router };
}

describe('TentangVyomatantraView accessibility and content', () => {
  it('renders required semantic landmarks, skip link, and single h1', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/vyomatantra');
    await router.isReady();

    const wrapper = mount(TentangVyomatantraView, {
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
    expect(h1List[0]?.text()).toContain('Inovasi Sosial VYOMATANTRA');
  });

  it('renders partner logos and SDGs badges with accessible alt text', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/vyomatantra');
    await router.isReady();

    const wrapper = mount(TentangVyomatantraView, {
      global: { plugins: [pinia, router] },
    });

    expect(wrapper.find('img[alt="Logo Tim Inovasi Sosial VYOMATANTRA"]').exists()).toBe(true);
    expect(wrapper.find('img[alt="Logo Institut Teknologi Kalimantan (ITK)"]').exists()).toBe(true);
    expect(wrapper.find('img[alt="Logo SDGs Desa"]').exists()).toBe(true);
    expect(wrapper.find('img[alt="Logo SDGs 17: Kemitraan untuk Pembangunan Desa"]').exists()).toBe(
      true,
    );
  });

  it('renders artifact-backed program facts and the proposal team roster', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/vyomatantra');
    await router.isReady();

    const wrapper = mount(TentangVyomatantraView, {
      global: { plugins: [pinia, router] },
    });

    expect(wrapper.text()).toContain('Pelatihan Eco Boba untuk Pengolahan Limbah Kemasan Plastik');
    expect(wrapper.text()).toContain('58 peserta');
    expect(wrapper.text()).toContain('lima produk');
    expect(wrapper.text()).not.toContain('briket arang');
    expect(wrapper.text()).toContain('mendampingi survei lapangan');
    expect(wrapper.text()).toContain('mengumpulkan data spasial');
    expect(wrapper.text()).toContain('mengompilasi data spasial');
    expect(wrapper.text()).toContain('Pembinaan & Pemetaan Bank Sampah Unit (BSU)');
    expect(wrapper.text()).toContain('Sistem Informasi Data Terpadu Kelurahan (SIDATA)');
    expect(wrapper.text()).toContain('SDG 17: Kemitraan untuk Mencapai Tujuan');
    expect(wrapper.text()).toContain('Naca Kirana Badarudin');
    expect(wrapper.text()).toContain('Indah Rahma Mihadha');
    expect(wrapper.text()).toContain('Andi Naufal Nurfadhil');
    expect(wrapper.text()).toContain('Muhammad Aditya Putra');
    expect(wrapper.text()).toContain('Muhammad Iqbal Ferhan');
    expect(wrapper.text()).toContain('Sulthan Farizan Fawwaz');
    expect(wrapper.text()).toContain('Andi Mushawwira Muchlis');
    expect(wrapper.text()).toContain('Feby Anggraini');
    expect(wrapper.text()).not.toContain('Nama Anggota');
    expect(wrapper.text()).not.toContain('TODO');
  });

  it('uses shared tentang components and the brand navy hero panel', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/vyomatantra');
    await router.isReady();

    const wrapper = mount(TentangVyomatantraView, {
      global: { plugins: [pinia, router] },
    });

    // Breadcrumb matches the Figma "Tentang > ..." pattern
    const breadcrumb = wrapper.find('nav[aria-label="Breadcrumb"]');
    expect(breadcrumb.exists()).toBe(true);
    expect(breadcrumb.text()).toContain('Tentang');
    expect(breadcrumb.text()).toContain('Inovasi Sosial VYOMATANTRA');

    // Navy hero panel holds the single h1
    const hero = wrapper.find('section.bg-brand-navy');
    expect(hero.exists()).toBe(true);
    expect(hero.find('h1').exists()).toBe(true);

    // The card body stays on the navy-deep token, not a slate utility
    expect(wrapper.text()).toContain('Data Tepat, Aksi Hebat');
  });

  it('renders the eight proposal team members with their listed roles', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/vyomatantra');
    await router.isReady();

    const wrapper = mount(TentangVyomatantraView, {
      global: { plugins: [pinia, router] },
    });

    const rosterSection = wrapper.find('section[aria-labelledby="tim-pelaksana-title"]');
    expect(rosterSection.exists()).toBe(true);
    expect(rosterSection.find('h2#tim-pelaksana-title').text()).toContain(
      'Tim Pelaksana VYOMATANTRA',
    );

    // Assert 8 cards
    const rosterCards = rosterSection.findAll('article');
    expect(rosterCards.length).toBe(8);

    expect(rosterSection.text()).toContain('Ketua Tim');
    expect(rosterSection.text()).toContain('Sekretaris');
    expect(rosterSection.text()).toContain('Bendahara');
    expect(rosterSection.findAll('article')).toHaveLength(8);

    // Assert photo placeholders rendered for team members
    const placeholders = rosterSection.findAll('[data-test="team-photo-placeholder"]');
    expect(placeholders.length).toBe(8);

    // Assert partner cards do not render personal photo placeholders
    const partnerSection = wrapper.find('section[aria-labelledby="tim-title"]');
    expect(partnerSection.findAll('[data-test="team-photo-placeholder"]').length).toBe(0);
  });

  it('renders accurate photo caption for kelurahan building', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/vyomatantra');
    await router.isReady();

    const wrapper = mount(TentangVyomatantraView, {
      global: { plugins: [pinia, router] },
    });

    expect(wrapper.text()).toContain(
      'Kantor Kelurahan Manggar, Balikpapan Timur — lokasi koordinasi kegiatan program Desa Cantik',
    );
  });

  it('tells the program work as a four-part journey', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/vyomatantra');
    await router.isReady();

    const wrapper = mount(TentangVyomatantraView, {
      global: { plugins: [pinia, router] },
    });

    const proker = wrapper.find('section[aria-labelledby="proker-title"]');
    expect(proker.exists()).toBe(true);
    expect(proker.text()).toContain('Perjalanan Program Kerja');

    const steps = proker.findAll('[data-test="procedure-steps"] > li');
    expect(steps.length).toBe(4);
    expect(steps[0]?.text()).toContain('Persiapan');
    expect(steps[1]?.text()).toContain('Pelaksanaan');
    expect(steps[2]?.text()).toContain('Monitoring dan evaluasi');
    expect(steps[3]?.text()).toContain('Pelaporan dan tindak lanjut');
  });

  it('lists the proposal program work activities under the journey', async () => {
    const { pinia, router } = mountView();
    await router.push('/tentang/vyomatantra');
    await router.isReady();

    const wrapper = mount(TentangVyomatantraView, {
      global: { plugins: [pinia, router] },
    });

    const proker = wrapper.find('section[aria-labelledby="proker-title"]');
    for (const activity of [
      'Pembentukan tim pelaksana dan pembagian tugas',
      'Penyusunan proposal kegiatan',
      'Menentukan tujuan dan sasaran',
      'Penyusunan rundown kegiatan',
      'Koordinasi awal dengan anggota BPS dan Kelurahan Manggar',
      'Survei lokasi kegiatan dan identifikasi sasaran peserta',
      'Penyusunan materi edukasi Pembinaan Statistik dan Literasi Digital',
      'Desain serta cetak banner, poster, dan id card',
      'Penyusunan kuesioner after kegiatan',
      'Finalisasi rundown kegiatan dan kuesioner after kegiatan',
      'Promosi kegiatan, undangan peserta, dan koordinasi teknis akhir bersama BPS dan pengurus Kelurahan Manggar',
      'Pelaksanaan sosialisasi',
      'Evaluasi partisipasi dan persepsi warga serta evaluasi seluruh kegiatan',
      'Finalisasi laporan kegiatan',
      'Pembuatan after movie dan artikel',
      'Penyerahan laporan kepada mitra dan pihak pendukung',
    ]) {
      expect(proker.text()).toContain(activity);
    }

    // The section attributes itself to the proposal and the field documentation.
    expect(proker.text()).toContain('Proposal Inovasi Sosial Desa Cantik Kelurahan Manggar');
    expect(proker.text()).toContain('Monografi Kelurahan Manggar');
  });
});
