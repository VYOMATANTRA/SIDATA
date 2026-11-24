import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import CeritaChapterOverview from '../components/admin/cerita/CeritaChapterOverview.vue';
import CeritaAddSectionPanel from '../components/admin/cerita/CeritaAddSectionPanel.vue';
import CeritaMoveSectionDialog from '../components/admin/cerita/CeritaMoveSectionDialog.vue';
import type { AdminChapter, AdminSection } from '../stores/ceritaAdmin.store';
import type { OverviewCard } from '../utils/ceritaChapterOverview';

// The thumbnail loads through the authenticated client; the specs never reach the network.
vi.mock('../services/media.service', () => ({
  fetchMediaPreviewBlob: vi.fn<(path: string) => Promise<Blob>>(
    async () => new Blob(['x'], { type: 'image/webp' }),
  ),
  mediaPreviewPath: (id: string) => `/api/media/${id}/preview`,
}));

const sectionA: AdminSection = {
  id: 'sec-a',
  slug: 'ringkasan',
  title: 'Ringkasan',
  sortOrder: 0,
  updatedAt: 't1',
};
const sectionB: AdminSection = {
  id: 'sec-b',
  slug: 'rincian',
  title: 'Rincian',
  sortOrder: 1,
  updatedAt: 't2',
};

const chapter: AdminChapter = {
  id: 'chap-2',
  slug: 'jumlah-keluarga',
  number: '2',
  title: 'Jumlah Keluarga',
  sortOrder: 1,
  updatedAt: 'tc',
  sections: [sectionA, sectionB],
};

const cards: OverviewCard[] = [
  {
    section: sectionA,
    number: '2.1',
    title: 'Ringkasan',
    excerpt: 'Jumlah keluarga naik.',
    figureBadge: '1 gambar',
    completeness: { label: 'Lengkap', complete: true },
    thumbPath: '/api/media/m-1/preview',
    thumbAlt: 'Pratinjau gambar bagian 2.1',
  },
  {
    section: sectionB,
    number: '2.2',
    title: 'Rincian',
    excerpt: null,
    figureBadge: 'Grafik',
    completeness: { label: 'Belum lengkap', complete: false },
    thumbPath: null,
    thumbAlt: 'Pratinjau gambar bagian 2.2',
  },
];

function mountOverview(props: Partial<InstanceType<typeof CeritaChapterOverview>['$props']> = {}) {
  return mount(CeritaChapterOverview, {
    attachTo: document.body,
    props: {
      chapter,
      position: 2,
      total: 3,
      cards,
      otherChaptersCount: 2,
      chapterNumber: '2',
      busy: false,
      ...props,
    } as never,
  });
}

function buttonWith(wrapper: ReturnType<typeof mountOverview>, label: string) {
  const found = wrapper
    .findAll('button')
    .find((button) => (button.text() ?? '').replace(/\s+/g, ' ').trim().startsWith(label));
  if (!found) throw new Error(`no button "${label}"`);
  return found;
}

describe('CeritaChapterOverview', () => {
  it('shows the position label and the chapter title in a labelled field', () => {
    const wrapper = mountOverview();
    expect(wrapper.get('[data-test="overview-heading"]').text()).toBe(
      'Bab 2 dari 3 · Jumlah Keluarga',
    );
    const input = wrapper.get<HTMLInputElement>('input[type="text"]');
    expect(input.element.value).toBe('Jumlah Keluarga');
    const label = wrapper.get('label[for="cerita-ringkasan-judul"]');
    expect(label.text()).toContain('Judul bab');
    wrapper.unmount();
  });

  it('saves the trimmed title with Simpan judul', async () => {
    const wrapper = mountOverview();
    await wrapper.get('input[type="text"]').setValue('  Keluarga Baru  ');
    await wrapper.get('[data-test="chapter-title-save"]').trigger('click');
    expect(wrapper.emitted('save-title')).toEqual([['Keluarga Baru']]);
    wrapper.unmount();
  });

  it('does not save an empty title and says why', async () => {
    const wrapper = mountOverview();
    await wrapper.get('input[type="text"]').setValue('   ');
    await wrapper.get('[data-test="chapter-title-save"]').trigger('click');
    expect(wrapper.emitted('save-title')).toBeUndefined();
    expect(wrapper.text()).toContain('Judul bab wajib diisi.');
    wrapper.unmount();
  });

  it('shows the drag hint and lists each section as an ordered list item', () => {
    const wrapper = mountOverview();
    expect(wrapper.get('[data-test="overview-hint"]').text()).toBe(
      'Seret ikon titik-titik untuk mengubah urutan kartu. Dari keyboard, fokus ikon itu, tekan Spasi, lalu panah atas atau bawah, dan Spasi lagi untuk menjatuhkan. Klik kartu untuk mengedit isi dan figurnya.',
    );
    const items = wrapper.findAll('[data-test="overview-list"] > li');
    expect(items).toHaveLength(2);
    expect(wrapper.get('ol[data-test="overview-list"]').element.tagName).toBe('OL');
    expect(items[0]!.text()).toContain('Bagian 2.1');
    expect(items[0]!.text()).toContain('1 gambar');
    expect(items[0]!.text()).toContain('Lengkap');
    expect(items[1]!.text()).toContain('Grafik');
    expect(items[1]!.text()).toContain('Belum lengkap');
    wrapper.unmount();
  });

  it('shows the empty-chapter notice and still offers the add panel', () => {
    const wrapper = mountOverview({ cards: [] });
    expect(wrapper.get('[data-test="overview-empty"]').text()).toBe('Belum ada bagian di bab ini.');
    expect(wrapper.find('[data-test="overview-list"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="add-section-panel"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('emits the card title as the edit request', async () => {
    const wrapper = mountOverview();
    await wrapper.findAll('[data-test="overview-title"]')[1]!.trigger('click');
    expect(wrapper.emitted('edit-section')?.[0]?.[0]).toEqual(sectionB);
    wrapper.unmount();
  });

  it('reorders a card from the keyboard: Spasi, arrow, Spasi, with the number and the announcement', async () => {
    const wrapper = mountOverview();
    const firstGrip = wrapper.findAll('[data-test="grip"]')[0]!;

    await firstGrip.trigger('keydown', { key: ' ' });
    expect(firstGrip.attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[data-test="overview-reorder-status"]').text()).toBe(
      'Bagian 2.1 diangkat. Posisi 1 dari 2.',
    );

    await firstGrip.trigger('keydown', { key: 'ArrowDown' });
    // While carried, the card shows its new number and the list shows it in the new place.
    expect(wrapper.findAll('[data-test="overview-title"]').map((item) => item.text())).toEqual([
      'Rincian',
      'Ringkasan',
    ]);
    expect(wrapper.findAll('[data-test="overview-eyebrow"]').map((item) => item.text())).toEqual([
      'Bagian 2.1',
      'Bagian 2.2',
    ]);
    expect(wrapper.get('[data-test="overview-reorder-status"]').text()).toBe('Posisi 2 dari 2.');

    await firstGrip.trigger('keydown', { key: ' ' });
    expect(wrapper.emitted('place-section')?.[0]?.slice(0, 2)).toEqual([sectionA, 1]);
    expect(wrapper.get('[data-test="overview-reorder-status"]').text()).toBe(
      'Bagian dipindahkan ke posisi 2 dari 2.',
    );
    wrapper.unmount();
  });

  it('cancels a keyboard move with Escape and restores the order without saving', async () => {
    const wrapper = mountOverview();
    const firstGrip = wrapper.findAll('[data-test="grip"]')[0]!;

    await firstGrip.trigger('keydown', { key: ' ' });
    await firstGrip.trigger('keydown', { key: 'ArrowDown' });
    await firstGrip.trigger('keydown', { key: 'Escape' });

    expect(wrapper.findAll('[data-test="overview-title"]').map((item) => item.text())).toEqual([
      'Ringkasan',
      'Rincian',
    ]);
    expect(firstGrip.attributes('aria-pressed')).toBe('false');
    expect(wrapper.get('[data-test="overview-reorder-status"]').text()).toBe('Dibatalkan.');
    expect(wrapper.emitted('place-section')).toBeUndefined();
    wrapper.unmount();
  });

  it('does not move the first card up past the top of the list', async () => {
    const wrapper = mountOverview();
    const firstGrip = wrapper.findAll('[data-test="grip"]')[0]!;

    await firstGrip.trigger('keydown', { key: ' ' });
    await firstGrip.trigger('keydown', { key: 'ArrowUp' });
    expect(wrapper.get('[data-test="overview-reorder-status"]').text()).toBe(
      'Sudah di posisi 1 dari 2.',
    );
    await firstGrip.trigger('keydown', { key: 'Escape' });
    wrapper.unmount();
  });

  it('offers no Naik or Turun anywhere in the overview', () => {
    const wrapper = mountOverview();
    expect(wrapper.text()).not.toMatch(/Naik|Turun/);
    expect(wrapper.find('[data-test="card-up"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="card-down"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps the grip focusable but inert while a save runs', async () => {
    const wrapper = mountOverview({ busy: true });
    const grip = wrapper.get('[data-test="grip"]');
    expect(grip.attributes('aria-disabled')).toBe('true');
    // Focus can stay on the grip while the save runs; keys do nothing.
    await grip.trigger('keydown', { key: ' ' });
    expect(grip.attributes('aria-pressed')).toBe('false');
    expect(wrapper.emitted('place-section')).toBeUndefined();
    wrapper.unmount();
  });

  it('disables moving a section to another chapter when the page has no other chapter', () => {
    const wrapper = mountOverview({ otherChaptersCount: 0 });
    const move = wrapper.get('[data-test="card-move"]');
    expect((move.element as HTMLButtonElement).disabled).toBe(true);
    expect(wrapper.find('[data-test="card-move-info"]').text()).toContain('hanya punya satu bab');
    wrapper.unmount();
  });

  it('emits chapter delete and no chapter Naik or Turun', async () => {
    const wrapper = mountOverview();
    const labels = wrapper.findAll('button').map((button) => button.text());
    expect(labels.some((label) => label.startsWith('Naik') || label.startsWith('Turun'))).toBe(false);
    await buttonWith(wrapper, 'Hapus bab').trigger('click');
    expect(wrapper.emitted('chapter-delete')).toHaveLength(1);
    wrapper.unmount();
  });

  it('emits the add request from the panel with the chosen figure kind', async () => {
    const wrapper = mountOverview({ cards: [] });
    await wrapper.get('[data-test="tile-gallery"]').setValue(true);
    await wrapper.get('[data-test="add-section-title"]').setValue('Bagian Baru');
    await wrapper.get('[data-test="add-section-submit"]').trigger('click');
    expect(wrapper.emitted('add-section')).toEqual([['Bagian Baru', 'gallery']]);
    wrapper.unmount();
  });
});

describe('CeritaAddSectionPanel', () => {
  it('shows the four figure tiles as native radio inputs with their descriptions', () => {
    const wrapper = mount(CeritaAddSectionPanel, { props: { busy: false } });
    const radios = wrapper.findAll('input[type="radio"]');
    expect(radios).toHaveLength(4);
    expect(wrapper.text()).toContain('1 gambar');
    expect(wrapper.text()).toContain('Satu foto dengan keterangan');
    expect(wrapper.text()).toContain('Dua foto bertumpuk');
    expect(wrapper.text()).toContain('3 foto atau lebih, tampil sebagai korsel');
    expect(wrapper.text()).toContain('Dari tabel di menu Data');
    wrapper.unmount();
  });

  it('requires a title and emits null when no kind is chosen', async () => {
    const wrapper = mount(CeritaAddSectionPanel, {
      props: { busy: false },
      attachTo: document.body,
    });
    await wrapper.get('[data-test="add-section-submit"]').trigger('click');
    expect(wrapper.emitted('add')).toBeUndefined();
    expect(wrapper.text()).toContain('Judul bagian wajib diisi.');
    await wrapper.get('[data-test="add-section-title"]').setValue('Judul');
    await wrapper.get('[data-test="add-section-submit"]').trigger('click');
    expect(wrapper.emitted('add')).toEqual([['Judul', null]]);
    wrapper.unmount();
  });
});

describe('CeritaMoveSectionDialog', () => {
  // The dialog is teleported by BaseModal, so its controls are read from the document.
  const targets = [
    { id: 'chap-1', label: 'Bab 1 · Jumlah Penduduk' },
    { id: 'chap-3', label: 'Bab 3 · Pendidikan' },
  ];

  function radiosInDocument(): HTMLInputElement[] {
    return Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
  }

  it('lists the other chapters as radios, the first one chosen', async () => {
    const wrapper = mount(CeritaMoveSectionDialog, {
      props: { open: true, sectionTitle: 'Rincian', targets },
      attachTo: document.body,
    });
    await wrapper.vm.$nextTick();
    const radios = radiosInDocument();
    expect(radios.map((radio) => radio.value)).toEqual(['chap-1', 'chap-3']);
    expect(radios[0]!.checked).toBe(true);
    wrapper.unmount();
  });

  it('emits the chosen chapter on submit', async () => {
    const wrapper = mount(CeritaMoveSectionDialog, {
      props: { open: true, sectionTitle: 'Rincian', targets },
      attachTo: document.body,
    });
    await wrapper.vm.$nextTick();
    radiosInDocument()[1]!.click();
    await wrapper.vm.$nextTick();
    document.querySelector<HTMLButtonElement>('[data-test="move-submit"]')!.click();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('submit')).toEqual([['chap-3']]);
    wrapper.unmount();
  });
});
