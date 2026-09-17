import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getCsrfToken } from '../utils/csrf';

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
  title: 'Portal Data Terpadu Kelurahan Manggar',
  body: 'Pusat integrasi data kependudukan, potensi wilayah, layanan publik, dan pemetaan geospasial Kelurahan Manggar, Balikpapan Timur.',
  metadata: {
    ctaText: 'Jelajahi Potensi',
    ctaLink: '#potensi',
    badge: 'Data Akurat & Terbuka',
  },
  sortOrder: null,
  updatedAt: new Date('2026-09-01').toISOString(),
};

export const DEFAULT_SAMBUTAN_BLOCK: ContentBlock = {
  id: 'default-sambutan-lurah',
  sectionId: null,
  type: 'sambutan_lurah',
  slug: 'landing-sambutan-lurah',
  title: 'Sambutan Lurah Manggar',
  body: 'Selamat datang di Sistem Informasi Data Terpadu (SIDATA) Kelurahan Manggar. Portal ini kami hadirkan sebagai sarana transparansi informasi dan keterpaduan data statistik serta spasial guna mendukung perencanaan wilayah dan pelayanan masyarakat yang lebih efektif.',
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

export const DEFAULT_CONTENT_BLOCKS: Record<string, ContentBlock> = {
  'landing-hero': DEFAULT_HERO_BLOCK,
  'landing-sambutan-lurah': DEFAULT_SAMBUTAN_BLOCK,
  'landing-highlights': DEFAULT_HIGHLIGHTS_BLOCK,
};

export const useContentBlocksStore = defineStore('contentBlocks', () => {
  const blocks = ref<Record<string, ContentBlock>>({ ...DEFAULT_CONTENT_BLOCKS });
  const isLoading = ref(false);
  const isLoaded = ref(false);
  const error = ref<string | null>(null);

  let inFlight: Promise<void> | null = null;

  const hero = computed<ContentBlock>(() => blocks.value['landing-hero'] ?? DEFAULT_HERO_BLOCK);
  const sambutanLurah = computed<ContentBlock>(
    () => blocks.value['landing-sambutan-lurah'] ?? DEFAULT_SAMBUTAN_BLOCK,
  );
  const highlights = computed<ContentBlock>(
    () => blocks.value['landing-highlights'] ?? DEFAULT_HIGHLIGHTS_BLOCK,
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
          throw new Error(`Gagal memuat blok konten (status ${response.status})`);
        }

        const data = (await response.json()) as { blocks?: ContentBlock[] };
        if (Array.isArray(data.blocks)) {
          const map: Record<string, ContentBlock> = { ...DEFAULT_CONTENT_BLOCKS };
          for (const item of data.blocks) {
            if (item && item.slug) {
              map[item.slug] = item;
            }
          }
          blocks.value = map;
          isLoaded.value = true;
        }
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Terjadi kesalahan jaringan';
      } finally {
        isLoading.value = false;
        inFlight = null;
      }
    })();

    return inFlight;
  }

  async function updateBlock(
    slug: string,
    payload: { title?: string | null; body?: string; metadata?: Record<string, unknown> | null },
  ): Promise<ContentBlock> {
    const csrfToken = await getCsrfToken();
    const response = await fetch(`/api/content-blocks/${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errJson = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(errJson.error || 'Gagal memperbarui blok konten');
    }

    const data = (await response.json()) as { block: ContentBlock };
    blocks.value = {
      ...blocks.value,
      [data.block.slug]: data.block,
    };
    return data.block;
  }

  return {
    blocks,
    isLoading,
    isLoaded,
    error,
    hero,
    sambutanLurah,
    highlights,
    fetchBlocks,
    updateBlock,
  };
});
