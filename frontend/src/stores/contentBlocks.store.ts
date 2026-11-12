import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { apiErrorFromResponse, apiRequestJson } from '../utils/apiClient';
import { toUserMessage } from '../utils/userMessages';
import { PUBLICATIONS } from '../content/publikasi';
import { SOTK_MEMBERS } from '../content/tentang';

export interface ContentBlock {
  id: string;
  sectionId: string | null;
  type: string;
  slug: string;
  title: string | null;
  body: string;
  metadata: Record<string, unknown> | null;
  sortOrder: number | null;
  updatedAt: string;
}

export const DEFAULT_HERO_BLOCK: ContentBlock = {
  id: 'default-hero',
  sectionId: null,
  type: 'hero',
  slug: 'landing-hero',
  title: 'Sistem Informasi Data Terpadu Kelurahan',
  body: 'Pusat integrasi data kependudukan, potensi wilayah, layanan publik, dan pemetaan geospasial Kelurahan Manggar, Balikpapan Timur.',
  metadata: null,
  sortOrder: null,
  updatedAt: new Date('2026-09-01').toISOString(),
};

export const DEFAULT_SAMBUTAN_BLOCK: ContentBlock = {
  id: 'default-sambutan-lurah',
  sectionId: null,
  type: 'sambutan_lurah',
  slug: 'landing-sambutan-lurah',
  title: 'Sambutan Lurah Manggar',
  body: 'Selamat datang di Sistem Informasi Data Terpadu (SIDATA) Kelurahan Manggar. Portal ini dihadirkan sebagai sarana transparansi informasi dan keterpaduan data statistik serta spasial guna mendukung perencanaan wilayah dan pelayanan masyarakat yang lebih efektif.',
  metadata: {
    authorName: 'Lurah Manggar',
    authorTitle: 'Kepala Kelurahan Manggar',
    photoUrl: '',
  },
  sortOrder: null,
  updatedAt: new Date('2026-09-01').toISOString(),
};

export const DEFAULT_HIGHLIGHTS_BLOCK: ContentBlock = {
  id: 'default-highlights',
  sectionId: null,
  type: 'highlight',
  slug: 'landing-highlights',
  title: 'Potensi Unggulan Wilayah',
  body: 'Kelurahan Manggar memiliki potensi strategis dalam pengelolaan persampahan mandiri berbasis masyarakat melalui jaringan Bank Sampah, sektor perikanan pesisir, serta pariwisata pantai.',
  metadata: {
    items: [
      {
        title: 'Bank Sampah Mandiri',
        desc: 'Jaringan unit pengolahan dan pemilahan sampah warga terdistribusi di kawasan RT.',
      },
      {
        title: 'Sektor Pesisir & Kelautan',
        desc: 'Sentra ekonomi nelayan tangkap, budidaya pesisir, dan destinasi wisata bahari.',
      },
      {
        title: 'Partisipasi Warga 100 RT',
        desc: 'Keterpaduan koordinasi 100 Ketua RT dalam penyampaian data dan pelayanan warga.',
      },
    ],
  },
  sortOrder: null,
  updatedAt: new Date('2026-09-01').toISOString(),
};

export const DEFAULT_TENTANG_PROFIL_BLOCK: ContentBlock = {
  id: 'default-tentang-profil',
  sectionId: null,
  type: 'prose',
  slug: 'tentang-kelurahan-profil',
  title: 'Profil Kelurahan Manggar',
  body: 'Data, potensi, dan cerita di balik perkembangan Kelurahan Manggar.',
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
      { arah: 'Sebelah Selatan', wilayah: 'Selat Makassar' },
      { arah: 'Sebelah Barat', wilayah: 'Kelurahan Sepinggan dan Sepinggan Baru' },
    ],
    // Single source of truth: frontend/src/content/tentang.ts SOTK_MEMBERS
    sotkMembers: SOTK_MEMBERS.map((item) => ({ ...item })),
  },
  sortOrder: null,
  updatedAt: new Date('2026-09-01').toISOString(),
};

export const DEFAULT_PUBLIKASI_KATALOG_BLOCK: ContentBlock = {
  id: 'default-publikasi-katalog',
  sectionId: null,
  type: 'prose',
  slug: 'publikasi-katalog',
  title: 'Katalog Publikasi Kelurahan Manggar',
  body: 'Koleksi dokumen, publikasi resmi, dan infografis statistik Kelurahan Manggar.',
  metadata: {
    // Single source of truth: frontend/src/content/publikasi.ts
    publications: PUBLICATIONS.map((item) => ({ ...item })),
  },
  sortOrder: null,
  updatedAt: new Date('2026-09-01').toISOString(),
};

export const DEFAULT_CONTENT_BLOCKS: Record<string, ContentBlock> = {
  'landing-hero': DEFAULT_HERO_BLOCK,
  'landing-sambutan-lurah': DEFAULT_SAMBUTAN_BLOCK,
  'landing-highlights': DEFAULT_HIGHLIGHTS_BLOCK,
  'tentang-kelurahan-profil': DEFAULT_TENTANG_PROFIL_BLOCK,
  'publikasi-katalog': DEFAULT_PUBLIKASI_KATALOG_BLOCK,
};

export const useContentBlocksStore = defineStore('contentBlocks', () => {
  const blocks = ref<Record<string, ContentBlock>>({ ...DEFAULT_CONTENT_BLOCKS });
  const serverBlocks = ref<Record<string, ContentBlock>>({});
  const isLoading = ref(false);
  const isLoaded = ref(false);
  const error = ref<string | null>(null);

  let inFlight: Promise<void> | null = null;

  // Figure blocks are managed only on /admin/cerita (the section figure endpoints), never as a
  // card in the content-block CMS, so they stay out of this list. `serverBlocks` keeps them.
  const editableBlocks = computed<ContentBlock[]>(() =>
    Object.values(serverBlocks.value).filter((block) => block.type !== 'figure'),
  );
  const hero = computed<ContentBlock>(() => blocks.value['landing-hero'] ?? DEFAULT_HERO_BLOCK);
  const sambutanLurah = computed<ContentBlock>(
    () => blocks.value['landing-sambutan-lurah'] ?? DEFAULT_SAMBUTAN_BLOCK,
  );
  const highlights = computed<ContentBlock>(
    () => blocks.value['landing-highlights'] ?? DEFAULT_HIGHLIGHTS_BLOCK,
  );
  const tentangProfil = computed<ContentBlock>(
    () => blocks.value['tentang-kelurahan-profil'] ?? DEFAULT_TENTANG_PROFIL_BLOCK,
  );
  const publikasiKatalog = computed<ContentBlock>(
    () => blocks.value['publikasi-katalog'] ?? DEFAULT_PUBLIKASI_KATALOG_BLOCK,
  );

  async function fetchBlocks(force = false): Promise<void> {
    if (isLoaded.value && !force) return;
    if (inFlight) return inFlight;

    isLoading.value = true;
    error.value = null;

    inFlight = (async () => {
      try {
        const response = await fetch('/api/content-blocks');
        if (!response.ok) {
          throw await apiErrorFromResponse(response, '/api/content-blocks', 'GET');
        }

        const data = (await response.json()) as { blocks?: ContentBlock[] };
        if (Array.isArray(data.blocks)) {
          const map: Record<string, ContentBlock> = { ...DEFAULT_CONTENT_BLOCKS };
          const serverMap: Record<string, ContentBlock> = {};
          for (const item of data.blocks) {
            if (item && item.slug) {
              map[item.slug] = item;
              serverMap[item.slug] = item;
            }
          }
          blocks.value = map;
          serverBlocks.value = serverMap;
          isLoaded.value = true;
        }
      } catch (err) {
        error.value = toUserMessage(err, 'memuat blok konten', 'GET').message;
      } finally {
        isLoading.value = false;
        inFlight = null;
      }
    })();

    return inFlight;
  }

  /**
   * Saves one block. `expectedUpdatedAt` is the block's `updatedAt` as the editor last saw it: the
   * server refuses the save with a stale-write conflict if someone else saved first, so a stale
   * tab can never silently overwrite newer content.
   */
  async function updateBlock(
    slug: string,
    payload: {
      title?: string | null;
      body?: string;
      metadata?: Record<string, unknown> | null;
      expectedUpdatedAt?: string;
    },
  ): Promise<ContentBlock> {
    const data = await apiRequestJson<{ block: ContentBlock }>(
      `/api/content-blocks/${encodeURIComponent(slug)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    );
    blocks.value = {
      ...blocks.value,
      [data.block.slug]: data.block,
    };
    serverBlocks.value = {
      ...serverBlocks.value,
      [data.block.slug]: data.block,
    };
    return data.block;
  }

  return {
    blocks,
    serverBlocks,
    editableBlocks,
    isLoading,
    isLoaded,
    error,
    hero,
    sambutanLurah,
    highlights,
    tentangProfil,
    publikasiKatalog,
    fetchBlocks,
    updateBlock,
  };
});
