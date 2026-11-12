import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ContentBlockForm from '../components/data/ContentBlockForm.vue';
import type { ContentBlock } from '../stores/contentBlocks.store';

const mockHeroBlock: ContentBlock = {
  id: 'block-1',
  sectionId: null,
  type: 'hero',
  slug: 'landing-hero',
  title: 'Judul Hero',
  body: 'Isi teks hero',
  metadata: null,
  sortOrder: null,
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const mockProfilBlock: ContentBlock = {
  id: 'block-2',
  sectionId: null,
  type: 'prose',
  slug: 'tentang-kelurahan-profil',
  title: 'Profil Kelurahan',
  body: 'Deskripsi profil kelurahan',
  metadata: {
    rtCount: 100,
    kecamatan: 'Balikpapan Timur',
    kota: 'Kota Balikpapan',
    landscape: 'Pesisir & Dataran',
    lurahName: 'Munir Achmad, S.E.',
    lurahTitle: 'Lurah Kelurahan Manggar',
    batasWilayah: [
      { arah: 'Sebelah Utara', wilayah: 'Kelurahan Karang Joang' },
      { arah: 'Sebelah Timur', wilayah: 'Kelurahan Manggar Baru' },
    ],
    sotkMembers: [
      { role: 'Lurah', officialName: 'Munir Achmad, S.E.', duties: null },
      { role: 'Sekretaris Lurah', officialName: 'Munjiah Puspitawaty. M, S.E', duties: null },
    ],
  },
  sortOrder: null,
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const highlightsBlock: ContentBlock = {
  id: 'block-h',
  sectionId: null,
  type: 'highlight',
  slug: 'landing-highlights',
  title: 'Potensi Uji',
  body: 'Narasi uji.',
  metadata: { items: [{ title: 'Poin Uji', desc: 'Deskripsi uji.' }] },
  sortOrder: null,
  updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('ContentBlockForm.vue', () => {
  it('renders hero title/body for landing-hero and emits null metadata without badge/CTA', async () => {
    const wrapper = mount(ContentBlockForm, {
      props: {
        block: mockHeroBlock,
      },
    });

    expect(wrapper.find('input#block-title').exists()).toBe(true);
    expect(wrapper.find('textarea#block-body').exists()).toBe(true);
    expect(wrapper.find('input#block-hero-badge').exists()).toBe(false);
    expect(wrapper.find('input#block-hero-cta-text').exists()).toBe(false);
    expect(wrapper.find('input#block-hero-cta-link').exists()).toBe(false);

    await wrapper.find('input#block-title').setValue('Judul Hero Baru');
    await wrapper.find('form').trigger('submit.prevent');

    const emitted = wrapper.emitted('submit');
    expect(emitted).toBeTruthy();
    expect(emitted?.[0]?.[0]).toMatchObject({
      title: 'Judul Hero Baru',
      body: 'Isi teks hero',
      metadata: null,
    });
  });

  it('renders profile metadata fields for tentang-kelurahan-profil block', async () => {
    const wrapper = mount(ContentBlockForm, {
      props: {
        block: mockProfilBlock,
      },
    });

    expect(wrapper.find('input#block-rt-count').exists()).toBe(true);
    expect(wrapper.find('input#block-kecamatan').exists()).toBe(true);
    expect(wrapper.find('input#block-kota').exists()).toBe(true);

    await wrapper.find('input#block-rt-count').setValue(105);
    await wrapper.find('form').trigger('submit.prevent');

    const emitted = wrapper.emitted('submit');
    expect(emitted).toBeTruthy();
    expect(emitted?.[0]?.[0]).toMatchObject({
      metadata: expect.objectContaining({
        rtCount: 105,
      }),
    });
  });

  it('validates empty body and prevents submit', async () => {
    const wrapper = mount(ContentBlockForm, {
      props: {
        block: mockHeroBlock,
      },
    });

    await wrapper.find('textarea#block-body').setValue('   ');
    await wrapper.find('form').trigger('submit.prevent');

    expect(wrapper.emitted('submit')).toBeFalsy();
    expect(wrapper.text()).toContain('Isi konten wajib diisi');
  });

  it('emits cancel event when cancel button is clicked', async () => {
    const wrapper = mount(ContentBlockForm, {
      props: {
        block: mockHeroBlock,
      },
    });

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Batal')
      ?.trigger('click');
    expect(wrapper.emitted('cancel')).toBeTruthy();
  });

  it('shows the named collection form for publikasi-katalog and never a JSON editor', async () => {
    const publikasiBlock: ContentBlock = {
      id: 'block-3',
      sectionId: null,
      type: 'prose',
      slug: 'publikasi-katalog',
      title: 'Katalog',
      body: 'Deskripsi',
      metadata: {
        publications: [
          {
            category: 'A',
            title: 'B',
            description: 'C',
            isAvailableOnline: false,
          },
        ],
      },
      sortOrder: null,
      updatedAt: '2026-09-01T00:00:00.000Z',
    };

    const wrapper = mount(ContentBlockForm, { props: { block: publikasiBlock } });

    expect(wrapper.find('textarea#block-metadata').exists()).toBe(false);
    expect(wrapper.find('input#block-pub-title-0').exists()).toBe(true);

    await wrapper.find('form').trigger('submit.prevent');
    const emitted = wrapper.emitted('submit');
    expect(emitted).toBeTruthy();
    expect(emitted?.[0]?.[0]).toMatchObject({
      metadata: {
        publications: [{ category: 'A', title: 'B', description: 'C', isAvailableOnline: false }],
      },
    });
  });

  it('shows the highlights collection form for landing-highlights', () => {
    const wrapper = mount(ContentBlockForm, { props: { block: highlightsBlock } });
    expect(wrapper.find('input#block-item-title-0').exists()).toBe(true);
    expect(wrapper.find('textarea#block-metadata').exists()).toBe(false);
  });

  it('shows a plain message and no editor or data for a block no form knows', async () => {
    const unknownBlock: ContentBlock = {
      id: 'block-x',
      sectionId: null,
      type: 'prose',
      slug: 'blok-rahasia-teknis',
      title: 'Blok Asing',
      body: 'isi',
      metadata: { rahasia: 'nilai-teknis-123' },
      sortOrder: null,
      updatedAt: '2026-09-01T00:00:00.000Z',
    };

    const wrapper = mount(ContentBlockForm, { props: { block: unknownBlock } });

    expect(wrapper.text()).toContain(
      'Blok ini belum bisa diubah dari sini. Hubungi pengelola teknis.',
    );
    expect(wrapper.find('textarea').exists()).toBe(false);
    expect(wrapper.find('input').exists()).toBe(false);
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.html()).not.toContain('nilai-teknis-123');
    expect(wrapper.html()).not.toContain('blok-rahasia-teknis');

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Tutup')
      ?.trigger('click');
    expect(wrapper.emitted('cancel')).toBeTruthy();
  });

  it('no block form of any kind renders a JSON or code editor', () => {
    const blocks = [
      mockHeroBlock,
      mockProfilBlock,
      highlightsBlock,
      { ...mockHeroBlock, slug: 'landing-sambutan-lurah', type: 'sambutan_lurah' },
      { ...mockHeroBlock, slug: 'publikasi-katalog', type: 'prose' },
      { ...mockHeroBlock, slug: 'bab-uji', type: 'prose', sectionId: 'sec-1' },
    ];
    for (const block of blocks) {
      const wrapper = mount(ContentBlockForm, { props: { block } });
      expect(wrapper.find('textarea#block-metadata').exists()).toBe(false);
      expect(wrapper.find('.font-mono').exists()).toBe(false);
      expect(wrapper.text()).not.toMatch(/JSON/i);
      wrapper.unmount();
    }
  });

  it('states where residents see each block', () => {
    const cases: Array<[ContentBlock, string]> = [
      [mockHeroBlock, 'Tampil di: Beranda, bagian atas'],
      [
        { ...mockHeroBlock, slug: 'landing-sambutan-lurah', type: 'sambutan_lurah' },
        'Tampil di: Beranda, bagian Sambutan Lurah',
      ],
      [mockProfilBlock, 'Tampil di: halaman Tentang Kelurahan Manggar'],
      [
        { ...mockHeroBlock, slug: 'publikasi-katalog', type: 'prose' },
        'Tampil di: halaman Publikasi',
      ],
    ];
    for (const [block, expected] of cases) {
      const wrapper = mount(ContentBlockForm, { props: { block } });
      expect(wrapper.find('[data-test="block-placement"]').text()).toContain(expected);
      expect(wrapper.find('[data-test="block-hidden-note"]').exists()).toBe(false);
      wrapper.unmount();
    }
  });

  it('labels landing-highlights as not shown on the site and does not claim it changes Beranda', () => {
    const wrapper = mount(ContentBlockForm, { props: { block: highlightsBlock } });
    const placement = wrapper.find('[data-test="block-placement"]').text();
    expect(placement).toBe('Tidak ditampilkan di situs');
    expect(placement).not.toContain('Tampil di');
    expect(wrapper.find('[data-test="block-hidden-note"]').text()).toContain(
      'belum muncul di halaman mana pun',
    );
  });

  it('places a Cerita section block under its section and edits title/body only', async () => {
    const ceritaBlock: ContentBlock = {
      ...mockHeroBlock,
      id: 'block-c',
      slug: 'pengantar-penduduk',
      type: 'prose',
      sectionId: 'sec-1',
      metadata: { bebas: 1 },
    };
    const wrapper = mount(ContentBlockForm, {
      props: { block: ceritaBlock, sectionLabel: 'Kependudukan › Jumlah Penduduk' },
    });
    expect(wrapper.find('[data-test="block-placement"]').text()).toBe(
      'Tampil di: Cerita, Kependudukan › Jumlah Penduduk',
    );

    await wrapper.find('input#block-title').setValue('Judul Baru');
    await wrapper.find('form').trigger('submit.prevent');
    const payload = wrapper.emitted('submit')?.[0]?.[0] as Record<string, unknown>;
    expect(payload).toEqual({ title: 'Judul Baru', body: 'Isi teks hero' });
    expect('metadata' in payload).toBe(false);
  });

  it('keeps every field after a failed save and offers a reload after a stale save', async () => {
    const wrapper = mount(ContentBlockForm, { props: { block: mockHeroBlock } });
    await wrapper.find('input#block-title').setValue('Draf yang jangan hilang');
    await wrapper.find('textarea#block-body').setValue('Isi draf panjang');

    await wrapper.setProps({ serverError: 'Gagal menyimpan. Coba lagi.', busy: false });
    expect((wrapper.find('input#block-title').element as HTMLInputElement).value).toBe(
      'Draf yang jangan hilang',
    );
    expect((wrapper.find('textarea#block-body').element as HTMLTextAreaElement).value).toBe(
      'Isi draf panjang',
    );
    expect(wrapper.find('[data-test="block-stale-notice"]').exists()).toBe(false);

    await wrapper.setProps({ stale: true });
    expect((wrapper.find('input#block-title').element as HTMLInputElement).value).toBe(
      'Draf yang jangan hilang',
    );
    expect(wrapper.find('[data-test="block-stale-notice"]').exists()).toBe(true);
    await wrapper.find('[data-test="block-reload"]').trigger('click');
    expect(wrapper.emitted('reload')).toBeTruthy();
  });

  it('edits boundaries, SOTK and Lurah on the profile form without a JSON editor', async () => {
    const wrapper = mount(ContentBlockForm, {
      props: { block: mockProfilBlock },
    });

    expect(wrapper.find('textarea#block-metadata').exists()).toBe(false);
    expect(wrapper.find('input#block-lurahName').exists()).toBe(true);
    expect(wrapper.find('input#block-batas-arah-0').exists()).toBe(true);
    expect(wrapper.find('input#block-sotk-role-0').exists()).toBe(true);

    await wrapper.find('input#block-lurahName').setValue('Nama Lurah Baru');
    await wrapper.find('input#block-batas-wilayah-0').setValue('Kelurahan Uji Utara');
    await wrapper.find('input#block-sotk-name-1').setValue('Sekretaris Baru');
    await wrapper.find('form').trigger('submit.prevent');

    const emitted = wrapper.emitted('submit');
    expect(emitted).toBeTruthy();
    const payload = emitted?.[0]?.[0] as {
      metadata: {
        lurahName: string;
        batasWilayah: Array<{ arah: string; wilayah: string }>;
        sotkMembers: Array<{ role: string; officialName: string | null }>;
      };
    };
    expect(payload.metadata.lurahName).toBe('Nama Lurah Baru');
    expect(payload.metadata.batasWilayah[0]?.wilayah).toBe('Kelurahan Uji Utara');
    expect(payload.metadata.sotkMembers[0]?.officialName).toBe('Nama Lurah Baru');
    expect(payload.metadata.sotkMembers[1]?.officialName).toBe('Sekretaris Baru');
  });

  it('validates empty boundary arah and blocks submit', async () => {
    const wrapper = mount(ContentBlockForm, {
      props: { block: mockProfilBlock },
    });

    await wrapper.find('input#block-batas-arah-0').setValue('   ');
    await wrapper.find('form').trigger('submit.prevent');

    expect(wrapper.emitted('submit')).toBeFalsy();
    expect(wrapper.text()).toContain('Arah batas wilayah wajib diisi');
  });

  it('persists SOTK Lurah name when only that row is edited (does not overwrite from top field)', async () => {
    const wrapper = mount(ContentBlockForm, {
      props: { block: mockProfilBlock },
    });

    await wrapper.find('input#block-sotk-name-0').setValue('Nama Dari SOTK');
    await wrapper.find('form').trigger('submit.prevent');

    const emitted = wrapper.emitted('submit');
    expect(emitted).toBeTruthy();
    const payload = emitted?.[0]?.[0] as {
      metadata: {
        lurahName: string;
        sotkMembers: Array<{ role: string; officialName: string | null }>;
      };
    };
    expect(payload.metadata.sotkMembers[0]?.officialName).toBe('Nama Dari SOTK');
    expect(payload.metadata.lurahName).toBe('Nama Dari SOTK');
  });

  it('keeps both lurahName and SOTK Lurah unchanged when neither field was edited', async () => {
    const testProfilBlock: ContentBlock = {
      ...mockProfilBlock,
      metadata: {
        ...mockProfilBlock.metadata,
        lurahName: 'Nama Uji A',
        sotkMembers: [
          { role: 'Lurah', officialName: 'Nama Uji A', duties: null },
          { role: 'Sekretaris Lurah', officialName: 'Sekretaris Uji', duties: null },
        ],
      },
    };

    const wrapper = mount(ContentBlockForm, {
      props: { block: testProfilBlock },
    });

    // Edit an unrelated field
    await wrapper.find('input#block-rt-count').setValue(110);
    await wrapper.find('form').trigger('submit.prevent');

    const emitted = wrapper.emitted('submit');
    expect(emitted).toBeTruthy();
    const payload = emitted?.[0]?.[0] as {
      metadata: {
        rtCount: number;
        lurahName: string;
        sotkMembers: Array<{ role: string; officialName: string | null }>;
      };
    };
    expect(payload.metadata.rtCount).toBe(110);
    expect(payload.metadata.lurahName).toBe('Nama Uji A');
    expect(payload.metadata.sotkMembers[0]?.officialName).toBe('Nama Uji A');
    expect(payload.metadata.sotkMembers[1]?.officialName).toBe('Sekretaris Uji');
  });

  it('allows clearing Lurah name via top field and syncs null to SOTK row', async () => {
    const wrapper = mount(ContentBlockForm, {
      props: { block: mockProfilBlock },
    });

    await wrapper.find('input#block-lurahName').setValue('');
    await wrapper.find('form').trigger('submit.prevent');

    const emitted = wrapper.emitted('submit');
    expect(emitted).toBeTruthy();
    const payload = emitted?.[0]?.[0] as {
      metadata: {
        lurahName?: string;
        sotkMembers: Array<{ role: string; officialName: string | null }>;
      };
    };
    expect(payload.metadata.lurahName).toBeUndefined();
    expect(payload.metadata.sotkMembers[0]?.officialName).toBeNull();
  });

  it('allows clearing Lurah name via SOTK row and syncs undefined to lurahName', async () => {
    const wrapper = mount(ContentBlockForm, {
      props: { block: mockProfilBlock },
    });

    await wrapper.find('input#block-sotk-name-0').setValue('');
    await wrapper.find('form').trigger('submit.prevent');

    const emitted = wrapper.emitted('submit');
    expect(emitted).toBeTruthy();
    const payload = emitted?.[0]?.[0] as {
      metadata: {
        lurahName?: string;
        sotkMembers: Array<{ role: string; officialName: string | null }>;
      };
    };
    expect(payload.metadata.lurahName).toBeUndefined();
    expect(payload.metadata.sotkMembers[0]?.officialName).toBeNull();
  });

  it('does not restore default SOTK rows when an explicit roster is empty', () => {
    const emptyProfilBlock: ContentBlock = {
      ...mockProfilBlock,
      metadata: {
        ...mockProfilBlock.metadata,
        lurahName: '',
        sotkMembers: [],
      },
    };

    const wrapper = mount(ContentBlockForm, {
      props: { block: emptyProfilBlock },
    });

    const lurahInput = wrapper.find('input#block-lurahName');
    expect(lurahInput.attributes('placeholder')).toBe('Nama pejabat belum tersedia');
    expect((lurahInput.element as HTMLInputElement).value).toBe('');
    expect(wrapper.find('input#block-sotk-name-0').exists()).toBe(false);
  });

  it('matches the Lurah role case-insensitively in the form', async () => {
    const mixedCaseBlock: ContentBlock = {
      ...mockProfilBlock,
      metadata: {
        ...mockProfilBlock.metadata,
        lurahName: 'Nama Lama',
        sotkMembers: [
          { role: '  lurah ', officialName: 'Nama Lama', duties: null },
          { role: 'Sekretaris Lurah', officialName: 'Sekretaris Uji', duties: null },
        ],
      },
    };

    const wrapper = mount(ContentBlockForm, {
      props: { block: mixedCaseBlock },
    });

    expect((wrapper.find('input#block-lurahName').element as HTMLInputElement).value).toBe(
      'Nama Lama',
    );
    await wrapper.find('input#block-sotk-name-0').setValue('Nama Baru');
    await wrapper.find('form').trigger('submit.prevent');

    const payload = wrapper.emitted('submit')?.[0]?.[0] as {
      metadata: { lurahName: string; sotkMembers: Array<{ officialName: string | null }> };
    };
    expect(payload.metadata.lurahName).toBe('Nama Baru');
    expect(payload.metadata.sotkMembers[0]?.officialName).toBe('Nama Baru');
  });

  it('keeps the Lurah row deleted after a top-field edit', async () => {
    const wrapper = mount(ContentBlockForm, {
      props: { block: mockProfilBlock },
    });

    await wrapper.find('input#block-lurahName').setValue('Nama Baru');
    const removeButtons = wrapper.findAll('button').filter((b) => b.text() === 'Hapus jabatan');
    await removeButtons[0]?.trigger('click');
    await wrapper.find('form').trigger('submit.prevent');

    const payload = wrapper.emitted('submit')?.[0]?.[0] as {
      metadata: {
        lurahName?: string;
        sotkMembers: Array<{ role: string; officialName: string | null }>;
      };
    };
    expect(payload.metadata.lurahName).toBeUndefined();
    expect(payload.metadata.sotkMembers.some((m) => m.role.trim().toLowerCase() === 'lurah')).toBe(
      false,
    );
    expect((wrapper.find('input#block-lurahName').element as HTMLInputElement).value).toBe('');
  });

  it('prepends a Lurah SOTK row when editing top Lurah field if no Lurah row previously existed', async () => {
    const noLurahBlock: ContentBlock = {
      ...mockProfilBlock,
      metadata: {
        ...mockProfilBlock.metadata,
        lurahName: '',
        // Explicitly provide sotkMembers without a Lurah role row
        sotkMembers: [
          { role: 'Sekretaris Lurah', officialName: 'Munjiah Puspitawaty. M, S.E', duties: null },
        ],
      },
    };

    const wrapper = mount(ContentBlockForm, {
      props: { block: noLurahBlock },
    });

    await wrapper.find('input#block-lurahName').setValue('Munir Achmad, S.E.');
    await wrapper.find('form').trigger('submit.prevent');

    const emitted = wrapper.emitted('submit');
    expect(emitted).toBeTruthy();
    const payload = emitted?.[0]?.[0] as {
      metadata: {
        lurahName: string;
        sotkMembers: Array<{ role: string; officialName: string | null }>;
      };
    };
    expect(payload.metadata.lurahName).toBe('Munir Achmad, S.E.');
    expect(payload.metadata.sotkMembers.length).toBe(2);
    expect(payload.metadata.sotkMembers[0]).toEqual({
      role: 'Lurah',
      officialName: 'Munir Achmad, S.E.',
      duties: null,
    });
    expect(payload.metadata.sotkMembers[1]?.role).toBe('Sekretaris Lurah');
  });
});
