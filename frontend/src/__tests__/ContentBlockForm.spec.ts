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
  metadata: {
    badge: 'Lencana',
    ctaText: 'Tombol',
    ctaLink: '#potensi',
  },
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

describe('ContentBlockForm.vue', () => {
  it('renders hero fields for landing-hero block and emits submit payload on save', async () => {
    const wrapper = mount(ContentBlockForm, {
      props: {
        block: mockHeroBlock,
      },
    });

    expect(wrapper.find('input#block-title').exists()).toBe(true);
    expect(wrapper.find('textarea#block-body').exists()).toBe(true);
    expect(wrapper.find('input#block-hero-badge').exists()).toBe(true);

    await wrapper.find('input#block-title').setValue('Judul Hero Baru');
    await wrapper.find('input#block-hero-badge').setValue('Lencana Baru');
    await wrapper.find('form').trigger('submit.prevent');

    const emitted = wrapper.emitted('submit');
    expect(emitted).toBeTruthy();
    expect(emitted?.[0]?.[0]).toMatchObject({
      title: 'Judul Hero Baru',
      body: 'Isi teks hero',
      metadata: expect.objectContaining({
        badge: 'Lencana Baru',
      }),
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

  it('parses and emits raw metadata JSON for generic blocks like publikasi-katalog', async () => {
    const mockGenericBlock: ContentBlock = {
      id: 'block-3',
      sectionId: null,
      type: 'prose',
      slug: 'publikasi-katalog',
      title: 'Katalog',
      body: 'Deskripsi',
      metadata: {
        publications: [{ category: 'A', title: 'B', description: 'C', href: '' }],
      },
      sortOrder: null,
      updatedAt: '2026-09-01T00:00:00.000Z',
    };

    const wrapper = mount(ContentBlockForm, {
      props: { block: mockGenericBlock },
    });

    const textarea = wrapper.find('textarea#block-metadata');
    expect(textarea.exists()).toBe(true);

    await wrapper.find('form').trigger('submit.prevent');
    const emitted = wrapper.emitted('submit');
    expect(emitted).toBeTruthy();
    expect(emitted?.[0]?.[0]).toMatchObject({
      metadata: {
        publications: [{ category: 'A', title: 'B', description: 'C', href: '' }],
      },
    });
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

});
